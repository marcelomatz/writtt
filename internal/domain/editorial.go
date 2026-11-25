package domain

import (
	"fmt"
	"math"
	"strings"

	"github.com/marcelomatz/matz-core/algorithms"
	"github.com/marcelomatz/matz-core/diff"
)

// ExtractChaptersAndStats extracts H1/H2/H3 chapters with per-chapter word counts and full document statistics.
func ExtractChaptersAndStats(markdown string) ([]ChapterHeading, DocumentStats) {
	normalized := strings.ReplaceAll(markdown, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")

	type rawHeading struct {
		level int
		text  string
		line  int
	}
	var rawHeadings []rawHeading
	inCodeBlock := false
	codeBlockCount := 0
	taskTotal := 0
	taskCompleted := 0

	for idx, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			if !inCodeBlock {
				inCodeBlock = true
				codeBlockCount++
			} else {
				inCodeBlock = false
			}
			continue
		}
		if inCodeBlock {
			continue
		}

		lower := strings.ToLower(trimmed)
		if strings.HasPrefix(lower, "- [ ] ") || strings.HasPrefix(lower, "* [ ] ") {
			taskTotal++
		} else if strings.HasPrefix(lower, "- [x] ") || strings.HasPrefix(lower, "* [x] ") {
			taskTotal++
			taskCompleted++
		}

		if strings.HasPrefix(line, "# ") {
			rawHeadings = append(rawHeadings, rawHeading{level: 1, text: strings.TrimSpace(line[2:]), line: idx + 1})
		} else if strings.HasPrefix(line, "## ") {
			rawHeadings = append(rawHeadings, rawHeading{level: 2, text: strings.TrimSpace(line[3:]), line: idx + 1})
		} else if strings.HasPrefix(line, "### ") {
			rawHeadings = append(rawHeadings, rawHeading{level: 3, text: strings.TrimSpace(line[4:]), line: idx + 1})
		}
	}

	chapters := make([]ChapterHeading, 0, len(rawHeadings))
	for i, h := range rawHeadings {
		startLine := h.line - 1
		endLine := len(lines)
		if i+1 < len(rawHeadings) {
			endLine = rawHeadings[i+1].line - 1
		}
		sectionText := strings.Join(lines[startLine:endLine], " ")
		sectionWords := countWords(sectionText)
		title := h.text
		if title == "" {
			title = "(sem titulo)"
		}
		chapters = append(chapters, ChapterHeading{
			ID:        fmt.Sprintf("ch-%d-%d", i+1, h.line),
			Level:     h.level,
			Text:      title,
			Line:      h.line,
			WordCount: sectionWords,
		})
	}

	totalWords := countWords(normalized)
	readMin := 0
	if totalWords > 0 {
		readMin = int(math.Ceil(float64(totalWords) / 200.0))
	}
	paragraphs := 0
	for _, block := range strings.Split(normalized, "\n\n") {
		if strings.TrimSpace(block) != "" {
			paragraphs++
		}
	}

	entropy := math.Round(ComputeStringEntropy(normalized)*100) / 100
	_, redactions, _ := SanitizeContextForAI(normalized, 100_000)

	lineCount := len(lines)
	if normalized == "" {
		lineCount = 0
	}
	shaHex, _ := algorithms.SHA256(normalized)

	return chapters, DocumentStats{
		Words:            totalWords,
		Chars:            len(normalized),
		Lines:            lineCount,
		Paragraphs:       paragraphs,
		ReadMinutes:      readMin,
		ChapterCount:     len(chapters),
		CodeBlockCount:   codeBlockCount,
		TaskTotal:        taskTotal,
		TaskCompleted:    taskCompleted,
		EntropyBits:      entropy,
		EntropyClass:     ClassifyEntropy(entropy),
		SecretAlerts:     len(redactions),
		ContentSHA256Hex: shaHex,
	}
}

func countWords(s string) int {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return 0
	}
	return len(strings.Fields(trimmed))
}

// BuildDocumentHierarchyDAG computes the topological sort (Kahn + parallel waves) and cascade impact
// for the document tree (root workspace -> parent documents -> split sub-documents).
func BuildDocumentHierarchyDAG(docs []SearchResult) (DocumentDAGPlan, DocumentCascadePlan) {
	nodes := []string{"vault-root"}
	seen := map[string]bool{"vault-root": true}
	deps := map[string][]string{"vault-root": nil}

	for _, d := range docs {
		if d.ID == "" {
			continue
		}
		if !seen[d.ID] {
			seen[d.ID] = true
			nodes = append(nodes, d.ID)
		}
	}
	for _, d := range docs {
		if d.ID == "" {
			continue
		}
		parent := "vault-root"
		if d.ParentID != "" && seen[d.ParentID] && d.ParentID != d.ID {
			parent = d.ParentID
		}
		deps[d.ID] = []string{parent}
	}

	order, waves, cycles := algorithms.TopologicalSort(nodes, deps)
	stopOrder, startOrder, cascadeCycles := algorithms.CascadeRestartPlan("vault-root", nodes, deps)
	return DocumentDAGPlan{
			Order:         order,
			Waves:         waves,
			BootOrder:     order,
			ParallelWaves: waves,
			Dependencies:  deps,
			CycleNodes:    cycles,
			HasCycle:      len(cycles) > 0,
		}, DocumentCascadePlan{
			TargetNode:    "vault-root",
			StopOrder:     stopOrder,
			StartOrder:    startOrder,
			AffectedOrder: startOrder,
			CycleNodes:    cascadeCycles,
		}
}

// DetectHierarchyCycle returns true if moving docID under targetParentID would introduce a cycle in the document tree.
func DetectHierarchyCycle(docID, targetParentID string, docs []SearchResult) bool {
	docID = strings.TrimSpace(docID)
	targetParentID = strings.TrimSpace(targetParentID)
	if targetParentID == "" {
		return false
	}
	if docID == targetParentID {
		return true
	}
	parentMap := make(map[string]string, len(docs))
	for _, d := range docs {
		if d.ID != "" {
			parentMap[d.ID] = strings.TrimSpace(d.ParentID)
		}
	}
	parentMap[docID] = targetParentID

	visited := make(map[string]bool, len(docs)+2)
	cur := targetParentID
	for cur != "" {
		if cur == docID {
			return true
		}
		if visited[cur] {
			return true
		}
		visited[cur] = true
		cur = parentMap[cur]
	}
	return false
}

// ComputeDocumentBreadcrumbs returns the ordered root-to-leaf ancestor chain for docID, safely breaking any cycles.
func ComputeDocumentBreadcrumbs(docID string, docs []SearchResult) []BreadcrumbItem {
	byID := make(map[string]SearchResult, len(docs))
	for _, d := range docs {
		if d.ID != "" {
			byID[d.ID] = d
		}
	}
	var rev []BreadcrumbItem
	visited := make(map[string]bool)
	cur := strings.TrimSpace(docID)
	for cur != "" && !visited[cur] {
		visited[cur] = true
		item, ok := byID[cur]
		if !ok {
			break
		}
		rev = append(rev, BreadcrumbItem{
			ID:       item.ID,
			Title:    item.Title,
			ParentID: item.ParentID,
		})
		cur = strings.TrimSpace(item.ParentID)
	}
	for i, j := 0, len(rev)-1; i < j; i, j = i+1, j-1 {
		rev[i], rev[j] = rev[j], rev[i]
	}
	return rev
}

// ComputeDocumentDiff computes a Unified Diff and line-by-line LCS diff between two document contents.
func ComputeDocumentDiff(docID string, fromVer int, oldText string, toVer int, newText string) VersionDiffReport {
	lines := diff.ComputeLineDiff(oldText, newText)
	patch := diff.FormatUnifiedPatch(docID+".md", oldText, newText)
	adds, dels := 0, 0
	for _, l := range lines {
		if l.Kind == diff.LineAdd {
			adds++
		} else if l.Kind == diff.LineDel {
			dels++
		}
	}
	return VersionDiffReport{
		DocID:        docID,
		FromVersion:  fromVer,
		ToVersion:    toVer,
		UnifiedPatch: patch,
		Additions:    adds,
		Deletions:    dels,
		Lines:        lines,
	}
}

// ParseStructuredAIReply extracts <opinion>...</opinion> and <content>...</content> blocks
// from an Ollama response so the UI can cleanly separate AI commentary from insertable manuscript text.
func ParseStructuredAIReply(raw string) (opinion string, insertable string) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", ""
	}
	extractTag := func(src, tag string) (string, bool) {
		openTag := "<" + tag + ">"
		closeTag := "</" + tag + ">"
		lower := strings.ToLower(src)
		sIdx := strings.Index(lower, openTag)
		if sIdx == -1 {
			return "", false
		}
		start := sIdx + len(openTag)
		eIdx := strings.Index(lower[start:], closeTag)
		if eIdx == -1 {
			return strings.TrimSpace(src[start:]), true
		}
		return strings.TrimSpace(src[start : start+eIdx]), true
	}

	op, hasOp := extractTag(trimmed, "opinion")
	cnt, hasCnt := extractTag(trimmed, "content")
	if hasOp || hasCnt {
		if !hasOp && hasCnt {
			lower := strings.ToLower(trimmed)
			sIdx := strings.Index(lower, "<content>")
			eIdx := strings.Index(lower, "</content>")
			if sIdx >= 0 && eIdx > sIdx {
				outside := strings.TrimSpace(trimmed[:sIdx] + "\n" + trimmed[eIdx+len("</content>"):])
				op = outside
			}
		}
		return op, cnt
	}

	if fenceStart := strings.Index(trimmed, "```"); fenceStart != -1 {
		afterStart := trimmed[fenceStart+3:]
		nl := strings.Index(afterStart, "\n")
		if nl != -1 {
			bodyStart := fenceStart + 3 + nl + 1
			if fenceEnd := strings.Index(trimmed[bodyStart:], "```"); fenceEnd != -1 {
				block := strings.TrimSpace(trimmed[bodyStart : bodyStart+fenceEnd])
				before := strings.TrimSpace(trimmed[:fenceStart])
				after := strings.TrimSpace(trimmed[bodyStart+fenceEnd+3:])
				opText := strings.TrimSpace(strings.Trim(before+"\n"+after, "\n"))
				return opText, block
			}
		}
	}

	return "", trimmed
}

// ClassifyOllamaModelCapability inspects an Ollama model identifier and determines whether it supports
// conversational chat (excluding embedding-only models such as nomic-embed-text, all-minilm, bge, etc.).
func ClassifyOllamaModelCapability(name string) AIModelCapabilityDTO {
	clean := strings.TrimSpace(name)
	lower := strings.ToLower(clean)
	family := clean
	if colon := strings.Index(family, ":"); colon > 0 {
		family = family[:colon]
	}
	isEmbeddingOnly := strings.Contains(lower, "embed") ||
		strings.Contains(lower, "minilm") ||
		strings.HasPrefix(lower, "bge-") ||
		strings.Contains(lower, "/bge-") ||
		strings.Contains(lower, "paraphrase-")

	return AIModelCapabilityDTO{
		Name:         clean,
		Family:       family,
		SupportsChat: clean != "" && !isEmbeddingOnly,
	}
}
