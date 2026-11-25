package domain

import (
	"math"
	"sort"
	"strings"
	"unicode"
)

// ChunkDocumentForRAG splits a Markdown document into semantic heading/paragraph chunks and computes L2-normalized TF vectors.
func ChunkDocumentForRAG(docID, docTitle, content string, maxWords int) []RAGChunk {
	if maxWords <= 0 {
		maxWords = 120
	}
	trimmed := strings.TrimSpace(content)
	if trimmed == "" || strings.HasPrefix(trimmed, "enc:") || strings.HasPrefix(trimmed, "rk:") {
		return nil
	}
	lines := strings.Split(strings.ReplaceAll(trimmed, "\r\n", "\n"), "\n")
	currentHeading := docTitle
	var buf []string
	wordCount := 0
	var chunks []RAGChunk

	flush := func() {
		text := strings.TrimSpace(strings.Join(buf, "\n"))
		buf = nil
		wordCount = 0
		if text == "" {
			return
		}
		vec := ComputeRAGVector(currentHeading + " " + text)
		if len(vec) == 0 {
			return
		}
		chunks = append(chunks, RAGChunk{
			DocID:     docID,
			DocTitle:  docTitle,
			ChunkIdx:  len(chunks),
			Heading:   currentHeading,
			Content:   text,
			TokenFreq: vec,
		})
	}

	for _, line := range lines {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "# ") || strings.HasPrefix(t, "## ") || strings.HasPrefix(t, "### ") {
			flush()
			currentHeading = strings.TrimSpace(strings.TrimLeft(t, "#"))
			buf = append(buf, t)
			wordCount += len(strings.Fields(t))
			continue
		}
		words := len(strings.Fields(t))
		if wordCount+words > maxWords && wordCount > 0 {
			flush()
		}
		buf = append(buf, line)
		wordCount += words
	}
	flush()
	return chunks
}

// ComputeRAGVector tokenizes text into normalized lowercase terms and returns an L2-normalized frequency vector.
func ComputeRAGVector(text string) map[string]float64 {
	counts := make(map[string]float64)
	var token strings.Builder
	flushTok := func() {
		if token.Len() >= 2 {
			w := token.String()
			counts[w] += 1.0
		}
		token.Reset()
	}
	for _, r := range strings.ToLower(text) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			token.WriteRune(r)
		} else {
			flushTok()
		}
	}
	flushTok()
	if len(counts) == 0 {
		return nil
	}
	var sumSq float64
	for _, c := range counts {
		sumSq += c * c
	}
	norm := math.Sqrt(sumSq)
	if norm == 0 {
		return counts
	}
	for k, c := range counts {
		counts[k] = c / norm
	}
	return counts
}

// CosineSimilarity computes the cosine similarity in [0, 1] between two L2-normalized term vectors.
func CosineSimilarity(vecA, vecB map[string]float64) float64 {
	if len(vecA) == 0 || len(vecB) == 0 {
		return 0
	}
	if len(vecA) > len(vecB) {
		vecA, vecB = vecB, vecA
	}
	var dot float64
	for k, va := range vecA {
		if vb, ok := vecB[k]; ok {
			dot += va * vb
		}
	}
	if dot > 1.0 {
		return 1.0
	}
	if dot < 0 {
		return 0
	}
	return dot
}

// SearchSimilarChunks ranks document chunks by cosine similarity against query and returns the topK results.
func SearchSimilarChunks(query string, chunks []RAGChunk, topK int) []RAGSearchResult {
	if topK <= 0 {
		topK = 5
	}
	qVec := ComputeRAGVector(query)
	if len(qVec) == 0 {
		return nil
	}
	var results []RAGSearchResult
	for _, ch := range chunks {
		sim := CosineSimilarity(qVec, ch.TokenFreq)
		if sim <= 0.01 {
			continue
		}
		snippet := ch.Content
		if len(snippet) > 180 {
			snippet = snippet[:180] + "..."
		}
		results = append(results, RAGSearchResult{
			DocID:      ch.DocID,
			DocTitle:   ch.DocTitle,
			ChunkIdx:   ch.ChunkIdx,
			Heading:    ch.Heading,
			Snippet:    snippet,
			Similarity: math.Round(sim*10000) / 10000,
		})
	}
	sort.Slice(results, func(i, j int) bool {
		if results[i].Similarity == results[j].Similarity {
			return results[i].DocID < results[j].DocID
		}
		return results[i].Similarity > results[j].Similarity
	})
	if len(results) > topK {
		results = results[:topK]
	}
	return results
}
