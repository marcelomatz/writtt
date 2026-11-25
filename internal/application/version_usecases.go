package application

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/marcelomatz/matz-core/algorithms"
	"github.com/marcelomatz/matz-core/notes"

	"writtt/internal/domain"
)

func (s *WritttService) recordDocumentVersion(diskDoc domain.Document) {
	versions, _ := s.loadRawVersions(diskDoc.Frontmatter.ID)
	verNum := len(versions) + 1
	shaHex, _ := algorithms.SHA256(diskDoc.Content)
	entry := domain.DocumentVersion{
		ID:        fmt.Sprintf("ver-%s-%d", diskDoc.Frontmatter.ID, verNum),
		DocID:     diskDoc.Frontmatter.ID,
		Version:   verNum,
		Title:     diskDoc.Frontmatter.Title,
		Content:   diskDoc.Content,
		Encrypted: notes.IsEncrypted(diskDoc.Content),
		CreatedAt: time.Now().Format("2006-01-02 15:04:05"),
		SHA256:    shaHex[:16],
	}
	versions = append([]domain.DocumentVersion{entry}, versions...)
	if len(versions) > 25 {
		versions = versions[:25]
	}
	if raw, err := json.MarshalIndent(versions, "", "  "); err == nil {
		_ = s.hal.WriteFile(s.versionsFilePath(diskDoc.Frontmatter.ID), raw)
	}
}

func (s *WritttService) loadRawVersions(docID string) ([]domain.DocumentVersion, error) {
	data, err := s.hal.ReadFile(s.versionsFilePath(docID))
	if err != nil {
		return nil, err
	}
	var list []domain.DocumentVersion
	if err := json.Unmarshal(data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

// ListDocumentVersions returns up to 25 immutable snapshots for docID, decrypting Vault snapshots if unlocked.
func (s *WritttService) ListDocumentVersions(docID string) ([]domain.DocumentVersion, error) {
	if err := domain.ValidateDocumentID(docID); err != nil {
		return nil, err
	}
	rawList, err := s.loadRawVersions(docID)
	if err != nil {
		return []domain.DocumentVersion{}, nil
	}
	s.mu.Lock()
	activePwd := string(s.activePassword)
	s.mu.Unlock()

	out := make([]domain.DocumentVersion, 0, len(rawList))
	for _, v := range rawList {
		cp := v
		if notes.IsEncrypted(cp.Content) {
			if activePwd != "" {
				if plain, decErr := notes.Decrypt(activePwd, cp.Content); decErr == nil {
					cp.Content = string(plain)
					cp.Encrypted = false
				}
			} else {
				cp.Content = "[Conteudo criptografado - Desbloqueie o Cofre]"
				cp.Encrypted = true
			}
		}
		out = append(out, cp)
	}
	return out, nil
}

// RestoreDocumentVersion rolls docID back to a historical version and records a new audited snapshot.
func (s *WritttService) RestoreDocumentVersion(docID string, version int) (*domain.Document, error) {
	versions, err := s.ListDocumentVersions(docID)
	if err != nil {
		return nil, err
	}
	var target *domain.DocumentVersion
	for i := range versions {
		if versions[i].Version == version {
			target = &versions[i]
			break
		}
	}
	if target == nil {
		return nil, fmt.Errorf("version %d not found for document %s", version, docID)
	}
	if target.Encrypted {
		return nil, fmt.Errorf("unlock vault before restoring encrypted version")
	}
	current, err := s.ReadDocument(docID)
	if err != nil {
		return nil, err
	}
	current.Frontmatter.Title = target.Title
	current.Content = target.Content
	if _, err := s.SaveDocument(*current); err != nil {
		return nil, err
	}
	s.AppendConsoleAndAudit("document:"+docID, "version.restore", fmt.Sprintf("Versao v%d restaurada com sucesso", version))
	return s.ReadDocument(docID)
}

// DiffDocumentVersions computes an LCS line diff and Unified Patch between two document versions.
func (s *WritttService) DiffDocumentVersions(docID string, fromVersion int, toVersion int) (domain.VersionDiffReport, error) {
	versions, err := s.ListDocumentVersions(docID)
	if err != nil {
		return domain.VersionDiffReport{}, err
	}
	var oldText, newText string
	for _, v := range versions {
		if v.Version == fromVersion {
			oldText = v.Content
		}
		if v.Version == toVersion {
			newText = v.Content
		}
	}
	if toVersion == 0 {
		if cur, err := s.ReadDocument(docID); err == nil {
			newText = cur.Content
			toVersion = cur.Frontmatter.Version
		}
	}
	return domain.ComputeDocumentDiff(docID, fromVersion, oldText, toVersion, newText), nil
}

// GenerateAuthorshipProof creates a verifiable timestamped SHA-256 authorship certificate
// anchored into the immutable ForensicChain, protecting manuscripts prior to publication.
func (s *WritttService) GenerateAuthorshipProof(docID string) (*domain.AuthorshipProofDTO, error) {
	doc, err := s.ReadDocument(docID)
	if err != nil {
		return nil, err
	}
	if doc.Frontmatter.IsVault && doc.Frontmatter.Encrypted {
		return nil, fmt.Errorf("desbloqueie o cofre para gerar o certificado de autoria deste documento")
	}
	aliasCfg, _ := s.GetOperatorAlias()
	authorAlias := aliasCfg.Alias
	if authorAlias == "" {
		authorAlias = "@local-author"
	}
	_, stats := domain.ExtractChaptersAndStats(doc.Content)
	canonical := fmt.Sprintf("writtt:authorship:v1|%s|%s|%d|%s|%s", doc.Frontmatter.ID, doc.Frontmatter.Title, doc.Frontmatter.Version, authorAlias, doc.Content)
	sum := sha256.Sum256([]byte(canonical))
	contentHash := hex.EncodeToString(sum[:])
	issuedAt := time.Now().UTC().Format(time.RFC3339)

	s.mu.Lock()
	forensicHash := s.appendAuditLocked(
		"authorship:"+doc.Frontmatter.ID,
		"authorship.certified",
		fmt.Sprintf("Certificado SHA-256 emitido para %q (v%d, %d palavras, sha256=%s)", doc.Frontmatter.Title, doc.Frontmatter.Version, stats.Words, contentHash[:16]),
	)
	seq := len(s.forensicChain.Records())
	s.mu.Unlock()

	certText := strings.Join([]string{
		"=== WRITTT PRE-PUBLICATION AUTHORSHIP CERTIFICATE ===",
		fmt.Sprintf("Document ID      : %s", doc.Frontmatter.ID),
		fmt.Sprintf("Title            : %s", doc.Frontmatter.Title),
		fmt.Sprintf("Author Alias     : %s", authorAlias),
		fmt.Sprintf("Version          : v%d", doc.Frontmatter.Version),
		fmt.Sprintf("Word Count       : %d words (%d chars)", stats.Words, stats.Chars),
		fmt.Sprintf("Vault Protected  : %v", doc.Frontmatter.IsVault),
		fmt.Sprintf("Issued At (UTC)  : %s", issuedAt),
		fmt.Sprintf("Content SHA-256  : %s", contentHash),
		fmt.Sprintf("Forensic Block   : #%d (%s)", seq, forensicHash),
		"=====================================================",
	}, "\n")

	return &domain.AuthorshipProofDTO{
		DocID:            doc.Frontmatter.ID,
		Title:            doc.Frontmatter.Title,
		AuthorAlias:      authorAlias,
		Version:          doc.Frontmatter.Version,
		WordCount:        stats.Words,
		CharCount:        stats.Chars,
		ContentSHA256:    contentHash,
		ForensicHash:     forensicHash,
		ForensicSequence: seq,
		EncryptedInVault: doc.Frontmatter.IsVault,
		IssuedAtRFC3339:  issuedAt,
		CertificateText:  certText,
	}, nil
}
