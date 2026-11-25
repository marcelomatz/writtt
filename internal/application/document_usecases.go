package application

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/marcelomatz/matz-core/algorithms"
	"github.com/marcelomatz/matz-core/notes"
	"gopkg.in/yaml.v3"

	"writtt/internal/domain"
)

func parseMarkdownDocument(id string, data []byte) domain.Document {
	doc := domain.Document{
		Raw: string(data),
	}
	parts := bytes.SplitN(data, []byte("---"), 3)
	if len(parts) == 3 {
		if err := yaml.Unmarshal(parts[1], &doc.Frontmatter); err == nil {
			doc.Content = strings.TrimPrefix(string(parts[2]), "\n")
			doc.Content = strings.TrimPrefix(doc.Content, "\r\n")
		} else {
			doc.Content = string(data)
		}
	} else {
		doc.Content = string(data)
	}
	if doc.Frontmatter.ID == "" {
		doc.Frontmatter.ID = id
	}
	if doc.Frontmatter.Type == "" {
		doc.Frontmatter.Type = "markdown"
	}
	if doc.Frontmatter.DocType == "" {
		doc.Frontmatter.DocType = "document"
	}
	if doc.Frontmatter.Version <= 0 {
		doc.Frontmatter.Version = 1
	}
	if doc.Frontmatter.CreatedAt.IsZero() {
		doc.Frontmatter.CreatedAt = time.Now()
	}
	if doc.Frontmatter.UpdatedAt.IsZero() {
		doc.Frontmatter.UpdatedAt = time.Now()
	}
	doc.Frontmatter.Encrypted = notes.IsEncrypted(doc.Content)
	return doc
}

func encodeMarkdownDocument(doc domain.Document) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString("---\n")
	enc := yaml.NewEncoder(&buf)
	if err := enc.Encode(doc.Frontmatter); err != nil {
		return nil, err
	}
	if err := enc.Close(); err != nil {
		return nil, err
	}
	buf.WriteString("---\n")
	buf.WriteString(doc.Content)
	return buf.Bytes(), nil
}

// SaveDocument persists a document and records an immutable snapshot in the version ledger.
func (s *WritttService) SaveDocument(doc domain.Document) (string, error) {
	return s.saveDocumentInternal(doc, true)
}

// AutoSaveDocument persists manuscript edits cleanly to disk and cache without spamming
// the immutable version ledger on every idle keystroke.
func (s *WritttService) AutoSaveDocument(doc domain.Document) (string, error) {
	return s.saveDocumentInternal(doc, false)
}

func (s *WritttService) saveDocumentInternal(doc domain.Document, recordSnapshot bool) (string, error) {
	start := time.Now()
	defer func() { s.observeLatency(start) }()

	if doc.Frontmatter.ID == "" {
		doc.Frontmatter.ID = generateULID()
		doc.Frontmatter.CreatedAt = time.Now()
		recordSnapshot = true
	} else if err := domain.ValidateDocumentID(doc.Frontmatter.ID); err != nil {
		return "", err
	}

	guard, err := s.AcquireDocLock("doc:" + doc.Frontmatter.ID)
	if err != nil {
		return "", err
	}
	defer guard.Release()

	now := time.Now()
	if doc.Frontmatter.CreatedAt.IsZero() {
		doc.Frontmatter.CreatedAt = now
	}
	doc.Frontmatter.UpdatedAt = now
	if doc.Frontmatter.Type == "" {
		doc.Frontmatter.Type = "markdown"
	}
	if doc.Frontmatter.DocType == "" {
		doc.Frontmatter.DocType = "document"
	}
	existingVersions, _ := s.loadRawVersions(doc.Frontmatter.ID)
	if recordSnapshot || len(existingVersions) == 0 {
		doc.Frontmatter.Version = len(existingVersions) + 1
	} else {
		doc.Frontmatter.Version = len(existingVersions)
	}

	if strings.TrimSpace(doc.Frontmatter.Title) == "" {
		lines := strings.SplitN(strings.TrimSpace(doc.Content), "\n", 2)
		if len(lines) > 0 && strings.TrimSpace(lines[0]) != "" {
			title := strings.TrimSpace(strings.TrimLeft(lines[0], "# "))
			if len(title) > 60 {
				title = title[:60] + "..."
			}
			doc.Frontmatter.Title = title
		} else {
			doc.Frontmatter.Title = "Untitled"
		}
	}

	s.mu.Lock()
	activePwd := string(s.activePassword)
	s.mu.Unlock()

	diskDoc := doc
	if diskDoc.Frontmatter.IsVault {
		if activePwd != "" && !notes.IsEncrypted(diskDoc.Content) {
			encrypted, encErr := notes.Encrypt(activePwd, []byte(diskDoc.Content))
			if encErr != nil {
				return "", encErr
			}
			diskDoc.Content = encrypted
			diskDoc.Frontmatter.Encrypted = true
		} else if notes.IsEncrypted(diskDoc.Content) {
			diskDoc.Frontmatter.Encrypted = true
		}
	} else {
		diskDoc.Frontmatter.Encrypted = false
	}

	encoded, err := encodeMarkdownDocument(diskDoc)
	if err != nil {
		return "", err
	}

	filePath := filepath.Join(s.DataDir(), diskDoc.Frontmatter.ID+".md")
	s.docCoalescer.MarkDirty(filePath, map[string]any{"bytes": encoded})
	s.docCoalescer.Flush()

	if recordSnapshot || len(existingVersions) == 0 {
		s.recordDocumentVersion(diskDoc)
	}

	s.mu.Lock()
	cachedCopy := doc
	cachedCopy.Frontmatter.Encrypted = false
	s.docCache.Put(doc.Frontmatter.ID, cachedCopy, 60_000, time.Now().UnixMilli())
	hashCoord := float64(algorithms.Joaat(doc.Frontmatter.ID)%100) + 1.0
	s.spatialGrid.Insert(doc.Frontmatter.ID, hashCoord, float64(len(doc.Content)%100), 0, 0, doc.Frontmatter.Title)
	if recordSnapshot {
		s.appendAuditLocked("document:"+doc.Frontmatter.ID, "document.save", fmt.Sprintf("Salvo %s (v%d, vault=%v, fence=%d)", doc.Frontmatter.Title, doc.Frontmatter.Version, doc.Frontmatter.IsVault, guard.Token))
	}
	s.mu.Unlock()

	return doc.Frontmatter.ID, nil
}

// ImportDocumentContent imports a local Markdown or plain-text file directly into the workspace or vault.
func (s *WritttService) ImportDocumentContent(filename, content string, isVault bool) (string, error) {
	base := filepath.Base(strings.TrimSpace(filename))
	title := strings.TrimSuffix(base, filepath.Ext(base))
	if title == "" {
		title = "Imported Manuscript"
	}
	doc := domain.Document{
		Frontmatter: domain.Frontmatter{
			Type:    "markdown",
			Title:   title,
			Tags:    []string{"imported"},
			IsVault: isVault,
			DocType: "document",
		},
		Content: content,
	}
	return s.SaveDocument(doc)
}

// ReadDocument loads a document from O(1) LRUCache or disk, decrypting Vault payloads only when unlocked.
func (s *WritttService) ReadDocument(id string) (*domain.Document, error) {
	start := time.Now()
	defer func() { s.observeLatency(start) }()

	if err := domain.ValidateDocumentID(id); err != nil {
		return nil, err
	}

	s.mu.Lock()
	activePwd := string(s.activePassword)
	if cached, ok := s.docCache.Get(id, time.Now().UnixMilli()); ok {
		if !cached.Frontmatter.IsVault || activePwd != "" {
			cp := cached
			s.mu.Unlock()
			return &cp, nil
		}
	}
	s.mu.Unlock()

	filePath := filepath.Join(s.DataDir(), id+".md")
	rawBytes, err := s.hal.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	doc := parseMarkdownDocument(id, rawBytes)

	if doc.Frontmatter.IsVault && notes.IsEncrypted(doc.Content) {
		if activePwd == "" {
			doc.Content = ""
			doc.Frontmatter.Encrypted = true
			return &doc, nil
		}
		plain, decErr := notes.Decrypt(activePwd, doc.Content)
		if decErr != nil {
			doc.Content = ""
			doc.Frontmatter.Encrypted = true
			return &doc, nil
		}
		doc.Content = string(plain)
		doc.Frontmatter.Encrypted = false
	}

	s.mu.Lock()
	s.docCache.Put(id, doc, 60_000, time.Now().UnixMilli())
	s.mu.Unlock()
	return &doc, nil
}

// DeleteDocument removes a document and its version ledger under StripedLockManager protection.
func (s *WritttService) DeleteDocument(id string) error {
	if err := domain.ValidateDocumentID(id); err != nil {
		return err
	}
	guard, err := s.AcquireDocLock("doc:" + id)
	if err != nil {
		return err
	}
	defer guard.Release()

	filePath := filepath.Join(s.DataDir(), id+".md")
	if err := s.hal.RemoveFile(filePath); err != nil {
		return err
	}
	_ = s.hal.RemoveFile(s.versionsFilePath(id))

	s.mu.Lock()
	s.docCache.Invalidate(id)
	s.spatialGrid.Remove(id)
	s.appendAuditLocked("document:"+id, "document.delete", fmt.Sprintf("Documento %s removido permanentemente", id))
	s.mu.Unlock()
	return nil
}

// UpdateMetadata updates document tags and Vault classification.
func (s *WritttService) UpdateMetadata(id string, tags []string, isVault bool) error {
	doc, err := s.ReadDocument(id)
	if err != nil {
		return err
	}
	doc.Frontmatter.Tags = tags
	doc.Frontmatter.IsVault = isVault
	_, err = s.SaveDocument(*doc)
	return err
}

// RenameDocument updates the document title in YAML frontmatter.
func (s *WritttService) RenameDocument(id string, newTitle string) error {
	doc, err := s.ReadDocument(id)
	if err != nil {
		return err
	}
	doc.Frontmatter.Title = strings.TrimSpace(newTitle)
	_, err = s.SaveDocument(*doc)
	return err
}

// MoveDocument reparents a document after verifying zero cycles in the document DAG.
func (s *WritttService) MoveDocument(id string, parentID string, sortOrder int) error {
	parentID = strings.TrimSpace(parentID)
	if parentID != "" {
		allDocs, _ := s.ListDocuments("all", 500)
		if domain.DetectHierarchyCycle(id, parentID, allDocs) {
			return fmt.Errorf("hierarchy cycle detected: cannot move document %s under %s", id, parentID)
		}
	}
	doc, err := s.ReadDocument(id)
	if err != nil {
		return err
	}
	doc.Frontmatter.ParentID = parentID
	doc.Frontmatter.SortOrder = sortOrder
	_, err = s.SaveDocument(*doc)
	return err
}

// ReorderDocuments assigns sequential sort_order under parentID with DAG cycle validation.
func (s *WritttService) ReorderDocuments(parentID string, orderedIDs []string) error {
	parentID = strings.TrimSpace(parentID)
	allDocs, _ := s.ListDocuments("all", 500)
	for idx, id := range orderedIDs {
		if parentID != "" && domain.DetectHierarchyCycle(id, parentID, allDocs) {
			return fmt.Errorf("hierarchy cycle detected: cannot move document %s under %s", id, parentID)
		}
		doc, err := s.ReadDocument(id)
		if err != nil {
			continue
		}
		doc.Frontmatter.ParentID = parentID
		doc.Frontmatter.SortOrder = idx + 1
		if _, err := s.SaveDocument(*doc); err != nil {
			return err
		}
	}
	return nil
}

// GetDocumentBreadcrumbs returns the ordered ancestor chain from workspace root to id.
func (s *WritttService) GetDocumentBreadcrumbs(id string) ([]domain.BreadcrumbItem, error) {
	allDocs, err := s.ListDocuments("all", 500)
	if err != nil {
		return nil, err
	}
	return domain.ComputeDocumentBreadcrumbs(id, allDocs), nil
}

// ListDocuments enumerates workspace documents filtered by category ("all", "vault", "protected", "split").
func (s *WritttService) ListDocuments(filter string, limit int) ([]domain.SearchResult, error) {
	if limit <= 0 {
		limit = 100
	}
	files, err := s.hal.ListFiles(s.DataDir())
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	activePwd := string(s.activePassword)
	s.mu.Unlock()

	var results []domain.SearchResult
	for _, f := range files {
		if filepath.Ext(f) != ".md" {
			continue
		}
		id := strings.TrimSuffix(f, ".md")
		rawBytes, readErr := s.hal.ReadFile(filepath.Join(s.DataDir(), f))
		if readErr != nil {
			continue
		}
		doc := parseMarkdownDocument(id, rawBytes)

		if (filter == "vault" || filter == "protected") && !doc.Frontmatter.IsVault {
			continue
		}
		if filter == "split" && doc.Frontmatter.DocType != "split" {
			continue
		}

		snippet := doc.Content
		if doc.Frontmatter.IsVault && notes.IsEncrypted(doc.Content) {
			if activePwd != "" {
				if plain, decErr := notes.Decrypt(activePwd, doc.Content); decErr == nil {
					snippet = string(plain)
				} else {
					snippet = "[Cofre E2EE Selado - AES-256-GCM]"
				}
			} else {
				snippet = "[Cofre E2EE Selado - AES-256-GCM]"
			}
		}
		snippet = strings.ReplaceAll(strings.TrimSpace(snippet), "\n", " ")
		if len(snippet) > 100 {
			snippet = snippet[:100] + "..."
		}
		tags := doc.Frontmatter.Tags
		if tags == nil {
			tags = []string{}
		}
		results = append(results, domain.SearchResult{
			ID:        doc.Frontmatter.ID,
			Type:      doc.Frontmatter.Type,
			Title:     doc.Frontmatter.Title,
			Snippet:   snippet,
			Tags:      tags,
			IsVault:   doc.Frontmatter.IsVault,
			UpdatedAt: doc.Frontmatter.UpdatedAt,
			ParentID:  doc.Frontmatter.ParentID,
			DocType:   doc.Frontmatter.DocType,
			SortOrder: doc.Frontmatter.SortOrder,
			Version:   doc.Frontmatter.Version,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].SortOrder != results[j].SortOrder {
			return results[i].SortOrder < results[j].SortOrder
		}
		return results[i].UpdatedAt.After(results[j].UpdatedAt)
	})
	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

// Search matches query across titles, tags, and unlocked document content without leaking sealed Vault plaintext.
func (s *WritttService) Search(query string) ([]domain.SearchResult, error) {
	cleanQuery := strings.ToLower(domain.SanitizeFTSQuery(query))
	if cleanQuery == "" {
		return s.ListDocuments("all", 50)
	}
	allDocs, err := s.ListDocuments("all", 250)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	activePwd := string(s.activePassword)
	s.mu.Unlock()

	var matched []domain.SearchResult
	for _, d := range allDocs {
		titleMatch := strings.Contains(strings.ToLower(d.Title), cleanQuery)
		tagMatch := false
		for _, t := range d.Tags {
			if strings.Contains(strings.ToLower(t), cleanQuery) {
				tagMatch = true
				break
			}
		}
		contentMatch := false
		if !d.IsVault || activePwd != "" {
			if fullDoc, err := s.ReadDocument(d.ID); err == nil && !fullDoc.Frontmatter.Encrypted {
				contentMatch = strings.Contains(strings.ToLower(fullDoc.Content), cleanQuery)
			}
		}
		if titleMatch || tagMatch || contentMatch {
			matched = append(matched, d)
		}
	}
	return matched, nil
}

// CreateSplitDoc derives a child split sub-document inheriting Vault status and tags from parentID.
// The sub-chapter starts with clean blank content (not duplicating the entire parent manuscript).
func (s *WritttService) CreateSplitDoc(parentID string, title string) (domain.SplitDocResult, error) {
	subDoc, err := s.CreateSubChapter(parentID, title)
	if err != nil {
		return domain.SplitDocResult{}, err
	}
	parent, _ := s.ReadDocument(parentID)
	origContent := ""
	if parent != nil {
		origContent = parent.Content
	}
	return domain.SplitDocResult{SplitID: subDoc.Frontmatter.ID, OriginalContent: origContent}, nil
}

// CreateSubChapter adds a brand-new blank sub-chapter section hierarchically nested under parentID
// without copying the parent's entire body text.
func (s *WritttService) CreateSubChapter(parentID string, title string) (*domain.Document, error) {
	parent, err := s.ReadDocument(parentID)
	if err != nil {
		return nil, fmt.Errorf("reading parent doc: %w", err)
	}
	existingChildren, _ := s.ListChildren(parentID)
	nextOrder := len(existingChildren) + 1
	cleanTitle := strings.TrimSpace(title)
	if cleanTitle == "" {
		cleanTitle = fmt.Sprintf("Subcapitulo %d", nextOrder)
	}
	subDoc := domain.Document{
		Frontmatter: domain.Frontmatter{
			Title:     cleanTitle,
			ParentID:  parentID,
			DocType:   "split",
			SortOrder: nextOrder,
			IsVault:   parent.Frontmatter.IsVault,
			Tags:      append([]string(nil), parent.Frontmatter.Tags...),
		},
		Content: "",
	}
	subID, err := s.SaveDocument(subDoc)
	if err != nil {
		return nil, err
	}
	s.AppendConsoleAndAudit("document:"+subID, "document.subchapter_create", fmt.Sprintf("Novo subcapitulo em branco '%s' adicionado a %s", cleanTitle, parentID))
	return s.ReadDocument(subID)
}

// AppendSubChapterToParent appends a sub-chapter's heading and body as a new section at the end of its parent work.
func (s *WritttService) AppendSubChapterToParent(subChapterID string) (*domain.Document, error) {
	subDoc, err := s.ReadDocument(subChapterID)
	if err != nil {
		return nil, err
	}
	parentID := strings.TrimSpace(subDoc.Frontmatter.ParentID)
	if parentID == "" {
		return nil, fmt.Errorf("este documento nao possui obra principal vinculada")
	}
	parent, err := s.ReadDocument(parentID)
	if err != nil {
		return nil, err
	}
	subBody := strings.TrimSpace(subDoc.Content)
	subHeading := strings.TrimSpace(subDoc.Frontmatter.Title)
	var merged strings.Builder
	merged.WriteString(strings.TrimRight(parent.Content, "\n"))
	if merged.Len() > 0 {
		merged.WriteString("\n\n")
	}
	if subHeading != "" && !strings.HasPrefix(subBody, "#") {
		merged.WriteString("## " + subHeading + "\n\n")
	}
	merged.WriteString(subBody)
	merged.WriteString("\n")

	parent.Content = merged.String()
	if _, err := s.SaveDocument(*parent); err != nil {
		return nil, err
	}
	s.AppendConsoleAndAudit("document:"+parentID, "document.subchapter_append", fmt.Sprintf("Subcapitulo '%s' incorporado ao final de %s", subHeading, parentID))
	return s.ReadDocument(parentID)
}

// DuplicateDocument creates a full standalone copy of sourceID so the author can work on an independent front.
func (s *WritttService) DuplicateDocument(sourceID string, newTitle string) (*domain.Document, error) {
	src, err := s.ReadDocument(sourceID)
	if err != nil {
		return nil, err
	}
	if src.Frontmatter.IsVault && src.Frontmatter.Encrypted {
		return nil, fmt.Errorf("desbloqueie o cofre antes de duplicar uma obra protegida")
	}
	cleanTitle := strings.TrimSpace(newTitle)
	if cleanTitle == "" {
		baseTitle := strings.TrimSpace(src.Frontmatter.Title)
		if baseTitle == "" {
			baseTitle = "Manuscrito"
		}
		cleanTitle = baseTitle + " (Copia)"
	}
	copyDoc := domain.Document{
		Frontmatter: domain.Frontmatter{
			Title:    cleanTitle,
			ParentID: "",
			DocType:  "document",
			IsVault:  src.Frontmatter.IsVault,
			Tags:     append([]string(nil), src.Frontmatter.Tags...),
		},
		Content: src.Content,
	}
	copyID, err := s.SaveDocument(copyDoc)
	if err != nil {
		return nil, err
	}
	s.AppendConsoleAndAudit("document:"+copyID, "document.duplicate", fmt.Sprintf("Copia independente '%s' criada a partir de %s", cleanTitle, sourceID))
	return s.ReadDocument(copyID)
}

// ListChildren returns all direct child sub-documents of parentID.
func (s *WritttService) ListChildren(parentID string) ([]domain.SearchResult, error) {
	all, err := s.ListDocuments("all", 250)
	if err != nil {
		return nil, err
	}
	var children []domain.SearchResult
	for _, d := range all {
		if d.ParentID == parentID {
			children = append(children, d)
		}
	}
	return children, nil
}

// MergeToParent merges edited sub-document content back into parentID.
func (s *WritttService) MergeToParent(parentID string, mergedContent string) error {
	parent, err := s.ReadDocument(parentID)
	if err != nil {
		return err
	}
	parent.Content = mergedContent
	_, err = s.SaveDocument(*parent)
	if err == nil {
		s.AppendConsoleAndAudit("document:"+parentID, "document.merge", fmt.Sprintf("Sub-documento mesclado no documento pai %s", parentID))
	}
	return err
}

// SaveAttachment stores a pasted/dropped image or vector SVG inside data/attachments/ and returns its local URL.
func (s *WritttService) SaveAttachment(filename string, base64Data string) (string, error) {
	if idx := strings.Index(base64Data, ","); idx != -1 {
		base64Data = base64Data[idx+1:]
	}
	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("invalid base64 attachment: %w", err)
	}
	base := filepath.Base(filename)
	if base == "." || base == "/" || base == "\\" {
		return "", fmt.Errorf("invalid attachment filename")
	}
	unique := fmt.Sprintf("%d-%s", time.Now().UnixMilli(), base)
	attachPath := filepath.Join(s.DataDir(), "attachments", unique)
	if err := s.hal.WriteFile(attachPath, data); err != nil {
		return "", err
	}
	s.AppendConsoleAndAudit("attachment:"+unique, "attachment.save", fmt.Sprintf("Anexo salvo (%d bytes)", len(data)))
	return "/attachments/" + url.PathEscape(unique), nil
}

// GetCustomDictionary loads the author's custom editorial spellcheck dictionary.
func (s *WritttService) GetCustomDictionary() ([]string, error) {
	data, err := s.hal.ReadFile(s.dictionaryFilePath())
	if err != nil {
		return []string{"argon2id", "writtt", "matz", "wails", "ciphertext", "zero-knowledge"}, nil
	}
	var words []string
	if err := json.Unmarshal(data, &words); err != nil {
		return []string{}, nil
	}
	sort.Strings(words)
	return words, nil
}

// AddDictionaryWord inserts a normalized lowercase term into the custom dictionary.
func (s *WritttService) AddDictionaryWord(word string) ([]string, error) {
	clean := strings.ToLower(strings.TrimSpace(word))
	if clean == "" {
		return s.GetCustomDictionary()
	}
	words, _ := s.GetCustomDictionary()
	for _, w := range words {
		if w == clean {
			return words, nil
		}
	}
	words = append(words, clean)
	sort.Strings(words)
	if raw, err := json.MarshalIndent(words, "", "  "); err == nil {
		_ = s.hal.WriteFile(s.dictionaryFilePath(), raw)
	}
	s.AppendConsoleAndAudit("dictionary", "dictionary.add", fmt.Sprintf("Termo '%s' adicionado ao dicionario editorial", clean))
	return words, nil
}

// RemoveDictionaryWord removes a term from the custom dictionary.
func (s *WritttService) RemoveDictionaryWord(word string) ([]string, error) {
	clean := strings.ToLower(strings.TrimSpace(word))
	words, _ := s.GetCustomDictionary()
	var filtered []string
	for _, w := range words {
		if w != clean {
			filtered = append(filtered, w)
		}
	}
	if raw, err := json.MarshalIndent(filtered, "", "  "); err == nil {
		_ = s.hal.WriteFile(s.dictionaryFilePath(), raw)
	}
	return filtered, nil
}
