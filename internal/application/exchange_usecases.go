package application

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/marcelomatz/matz-core/algorithms"
	"github.com/marcelomatz/matz-core/notes"

	"writtt/internal/domain"
)

// EnsureRSAKeyPair loads or initializes the operator's RSA-2048 OAEP keypair for Writtt Express.
func (s *WritttService) EnsureRSAKeyPair() (*notes.RSAKeyPairBundle, error) {
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return nil, err
	}
	if cfg.RSAKeyPair != nil && cfg.RSAKeyPair.PublicKeyPEM != "" {
		return cfg.RSAKeyPair, nil
	}
	kp, err := notes.GenerateRSAKeyPair()
	if err != nil {
		return nil, err
	}
	cfg.RSAKeyPair = kp
	if err := s.saveSecurityCfg(cfg); err != nil {
		return nil, err
	}
	s.AppendConsoleAndAudit("express", "rsa.generated", fmt.Sprintf("Par de chaves RSA-2048 OAEP gerado (fp=%s)", kp.Fingerprint))
	return kp, nil
}

func (s *WritttService) loadExpressEnvelopes() ([]notes.ExpressEnvelope, error) {
	data, err := s.hal.ReadFile(s.expressFilePath())
	if err != nil {
		return []notes.ExpressEnvelope{}, nil
	}
	var list []notes.ExpressEnvelope
	if err := json.Unmarshal(data, &list); err != nil {
		return []notes.ExpressEnvelope{}, nil
	}
	return list, nil
}

func (s *WritttService) saveExpressEnvelopes(list []notes.ExpressEnvelope) error {
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return s.hal.WriteFile(s.expressFilePath(), data)
}

// SendExpressEnvelope seals a manuscript or message with hybrid RSA-2048 OAEP + AES-256-GCM encryption.
func (s *WritttService) SendExpressEnvelope(senderAlias, subject, body, recipientPubKeyPEM string) (*domain.ExpressMessageDTO, error) {
	kp, err := s.EnsureRSAKeyPair()
	if err != nil {
		return nil, err
	}
	targetPEM := strings.TrimSpace(recipientPubKeyPEM)
	if targetPEM == "" {
		targetPEM = kp.PublicKeyPEM
	}
	if strings.TrimSpace(senderAlias) == "" {
		if cfg, cfgErr := s.loadSecurityCfg(); cfgErr == nil && cfg.OperatorAlias != "" {
			senderAlias = cfg.OperatorAlias
		} else {
			senderAlias = "@local-operator"
		}
	}
	if strings.TrimSpace(subject) == "" {
		subject = "Zero-Knowledge Express Drop"
	}
	env, err := notes.SealExpressEnvelope(targetPEM, senderAlias, subject, []byte(body))
	if err != nil {
		return nil, err
	}
	list, _ := s.loadExpressEnvelopes()
	list = append([]notes.ExpressEnvelope{*env}, list...)
	if err := s.saveExpressEnvelopes(list); err != nil {
		return nil, err
	}
	s.AppendConsoleAndAudit("express:"+env.ID, "express.seal", fmt.Sprintf("Envelope hibrido RSA-2048 OAEP + AES-256-GCM selado (%s)", env.Subject))
	return &domain.ExpressMessageDTO{
		ID:                   env.ID,
		SenderAlias:          env.SenderAlias,
		RecipientFingerprint: env.RecipientFingerprint,
		Subject:              env.Subject,
		ContentSHA256:        env.ContentSHA256,
		CreatedAt:            env.CreatedAt,
		Read:                 false,
		Sealed:               true,
	}, nil
}

// ListExpressInbox returns metadata of sealed Express envelopes stored locally.
func (s *WritttService) ListExpressInbox() ([]domain.ExpressMessageDTO, error) {
	list, err := s.loadExpressEnvelopes()
	if err != nil {
		return nil, err
	}
	out := make([]domain.ExpressMessageDTO, 0, len(list))
	for _, env := range list {
		out = append(out, domain.ExpressMessageDTO{
			ID:                   env.ID,
			SenderAlias:          env.SenderAlias,
			RecipientFingerprint: env.RecipientFingerprint,
			Subject:              env.Subject,
			ContentSHA256:        env.ContentSHA256,
			CreatedAt:            env.CreatedAt,
			Read:                 env.Read,
			Sealed:               true,
		})
	}
	return out, nil
}

// UnsealExpressMessage decrypts an Express envelope in memory using the local RSA-2048 private key.
func (s *WritttService) UnsealExpressMessage(id string) (*domain.ExpressMessageDTO, error) {
	kp, err := s.EnsureRSAKeyPair()
	if err != nil {
		return nil, err
	}
	list, _ := s.loadExpressEnvelopes()
	for i := range list {
		if list[i].ID == id {
			plain, decErr := notes.UnsealExpressEnvelope(kp.PrivateKeyPEM, list[i])
			if decErr != nil {
				return nil, decErr
			}
			list[i].Read = true
			_ = s.saveExpressEnvelopes(list)
			s.AppendConsoleAndAudit("express:"+id, "express.unseal", fmt.Sprintf("Envelope %s aberto com chave privada RSA-2048 OAEP", id))
			return &domain.ExpressMessageDTO{
				ID:                   list[i].ID,
				SenderAlias:          list[i].SenderAlias,
				RecipientFingerprint: list[i].RecipientFingerprint,
				Subject:              list[i].Subject,
				DecryptedBody:        string(plain),
				ContentSHA256:        list[i].ContentSHA256,
				CreatedAt:            list[i].CreatedAt,
				Read:                 true,
				Sealed:               false,
			}, nil
		}
	}
	return nil, fmt.Errorf("express envelope %s not found", id)
}

// DeleteExpressMessage removes an Express envelope from the local inbox.
func (s *WritttService) DeleteExpressMessage(id string) error {
	list, _ := s.loadExpressEnvelopes()
	var filtered []notes.ExpressEnvelope
	for _, e := range list {
		if e.ID != id {
			filtered = append(filtered, e)
		}
	}
	s.AppendConsoleAndAudit("express:"+id, "express.delete", "Envelope Express removido")
	return s.saveExpressEnvelopes(filtered)
}

func (s *WritttService) loadDriveStore() (*persistedDriveStore, error) {
	data, err := s.hal.ReadFile(s.driveFilePath())
	if err != nil {
		return &persistedDriveStore{Payloads: make(map[string]string)}, nil
	}
	var st persistedDriveStore
	if err := json.Unmarshal(data, &st); err != nil {
		return &persistedDriveStore{Payloads: make(map[string]string)}, nil
	}
	if st.Payloads == nil {
		st.Payloads = make(map[string]string)
	}
	return &st, nil
}

func (s *WritttService) saveDriveStore(st *persistedDriveStore) error {
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	return s.hal.WriteFile(s.driveFilePath(), data)
}

// UploadDriveVaultFile encrypts an arbitrary binary/text file into the E2EE Drive Vault and computes entropy telemetry.
func (s *WritttService) UploadDriveVaultFile(filename, mimeType, base64Data string) (*domain.DriveVaultFile, error) {
	if idx := strings.Index(base64Data, ","); idx != -1 {
		base64Data = base64Data[idx+1:]
	}
	plainBytes, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		plainBytes = []byte(base64Data)
	}

	s.mu.Lock()
	activePwd := string(s.activePassword)
	s.mu.Unlock()
	if activePwd == "" {
		activePwd = "writtt-local-ephemeral-drive-key"
	}

	encryptedStr, err := notes.Encrypt(activePwd, plainBytes)
	if err != nil {
		return nil, err
	}
	meta, err := notes.InspectCiphertext(encryptedStr, plainBytes)
	if err != nil {
		return nil, err
	}

	cipherRaw, decErr := base64.StdEncoding.DecodeString(strings.TrimPrefix(encryptedStr, "enc:"))
	var entBits float64
	if decErr == nil && len(cipherRaw) > 0 {
		entBits = domain.ComputeStringEntropy(string(cipherRaw))
	} else {
		entBits = domain.ComputeStringEntropy(encryptedStr)
	}
	id := fmt.Sprintf("drv-%d", time.Now().UnixNano())
	entry := domain.DriveVaultFile{
		ID:            id,
		Filename:      filepath.Base(filename),
		MimeType:      mimeType,
		Category:      domain.ClassifyDriveFileCategory(filename, mimeType),
		SizeOriginal:  len(plainBytes),
		SizeEncrypted: meta.CiphertextBytes,
		CreatedAt:     time.Now().Format("2006-01-02 15:04:05"),
		Algorithm:     meta.Algorithm,
		KDF:           meta.KDF,
		SaltHex:       meta.SaltHex,
		NonceHex:      meta.NonceHex,
		OverheadBytes: meta.OverheadBytes,
		SHA256Hex:     meta.SHA256Hex,
		EntropyBits:   entBits,
		EntropyClass:  domain.ClassifyEntropy(entBits),
		Status:        meta.Status,
	}

	st, _ := s.loadDriveStore()
	st.Files = append([]domain.DriveVaultFile{entry}, st.Files...)
	st.Payloads[id] = encryptedStr
	if err := s.saveDriveStore(st); err != nil {
		return nil, err
	}
	s.AppendConsoleAndAudit("drive:"+id, "drive.seal", fmt.Sprintf("Arquivo E2EE '%s' selado no Drive (%dB -> %dB)", entry.Filename, entry.SizeOriginal, entry.SizeEncrypted))
	return &entry, nil
}

// ListDriveVaultFiles returns metadata and cryptographic parameters of all sealed Drive files.
func (s *WritttService) ListDriveVaultFiles() ([]domain.DriveVaultFile, error) {
	st, err := s.loadDriveStore()
	if err != nil {
		return nil, err
	}
	if st.Files == nil {
		return []domain.DriveVaultFile{}, nil
	}
	return st.Files, nil
}

func (s *WritttService) decryptDriveBytes(id string) ([]byte, error) {
	st, _ := s.loadDriveStore()
	encPayload, ok := st.Payloads[id]
	if !ok {
		return nil, fmt.Errorf("drive file %s not found", id)
	}
	s.mu.Lock()
	activePwd := string(s.activePassword)
	s.mu.Unlock()
	if activePwd == "" {
		activePwd = "writtt-local-ephemeral-drive-key"
	}
	plain, err := notes.Decrypt(activePwd, encPayload)
	if err != nil && activePwd != "writtt-local-ephemeral-drive-key" {
		plain, err = notes.Decrypt("writtt-local-ephemeral-drive-key", encPayload)
	}
	if err != nil {
		return nil, err
	}
	return plain, nil
}

// DecryptDriveVaultFile decrypts a Drive Vault file as UTF-8 text.
func (s *WritttService) DecryptDriveVaultFile(id string) (string, error) {
	plain, err := s.decryptDriveBytes(id)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// DecryptDriveVaultFileBase64 decrypts a binary Drive Vault file as Base64.
func (s *WritttService) DecryptDriveVaultFileBase64(id string) (string, error) {
	plain, err := s.decryptDriveBytes(id)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(plain), nil
}

// DeleteDriveVaultFile removes an encrypted file from the local Drive Vault.
func (s *WritttService) DeleteDriveVaultFile(id string) error {
	st, _ := s.loadDriveStore()
	delete(st.Payloads, id)
	var kept []domain.DriveVaultFile
	for _, f := range st.Files {
		if f.ID != id {
			kept = append(kept, f)
		}
	}
	st.Files = kept
	s.AppendConsoleAndAudit("drive:"+id, "drive.delete", "Arquivo removido do Drive E2EE")
	return s.saveDriveStore(st)
}

// ExportWritttPack seals unlocked workspace documents into an Argon2id + AES-256-GCM .writttpack archive.
func (s *WritttService) ExportWritttPack(packName, passphrase string) (*domain.ExportBundleResult, error) {
	if strings.TrimSpace(passphrase) == "" {
		return nil, fmt.Errorf("defina uma senha para criptografar o pacote .writttpack")
	}
	if strings.TrimSpace(packName) == "" {
		packName = "Writtt-ZeroKnowledge-Backup"
	}
	docs, err := s.ListDocuments("all", 250)
	if err != nil {
		return nil, err
	}
	var items []notes.PackInputItem
	for _, summary := range docs {
		full, readErr := s.ReadDocument(summary.ID)
		if readErr != nil {
			continue
		}
		if full.Frontmatter.IsVault && full.Frontmatter.Encrypted {
			return nil, fmt.Errorf("desbloqueie seu Cofre Pessoal antes de exportar o backup .writttpack para incluir tambem suas obras protegidas")
		}
		docType := "document"
		if full.Frontmatter.IsVault {
			docType = "vault"
		}
		items = append(items, notes.PackInputItem{
			ID:        full.Frontmatter.ID,
			Name:      full.Frontmatter.Title,
			Type:      docType,
			Tags:      full.Frontmatter.Tags,
			MimeType:  "text/markdown",
			Plaintext: []byte(full.Content),
		})
	}
	packBytes, manifest, err := notes.CreateWritttPack(packName, passphrase, items)
	if err != nil {
		return nil, err
	}
	filename := strings.ReplaceAll(strings.ToLower(packName), " ", "-") + ".writttpack"
	exportPath := filepath.Join(s.baseDir, "exports", filename)
	_ = s.hal.WriteFile(exportPath, packBytes)
	shaHex, _ := algorithms.SHA256(string(packBytes))
	s.AppendConsoleAndAudit("export:"+filename, "pack.export", fmt.Sprintf("Pacote .writttpack criptografado com %d documentos (%d bytes)", len(manifest.Files), len(packBytes)))

	return &domain.ExportBundleResult{
		Format:      "writttpack",
		Filename:    filename,
		SavedPath:   exportPath,
		SizeBytes:   len(packBytes),
		SHA256Hex:   shaHex,
		Base64Data:  base64.StdEncoding.EncodeToString(packBytes),
		Description: fmt.Sprintf("Argon2id + AES-256-GCM Sealed Archive (%d docs)", len(manifest.Files)),
	}, nil
}

// ImportWritttPack decrypts and imports documents from a .writttpack archive.
func (s *WritttService) ImportWritttPack(base64Pack string, passphrase string) (int, error) {
	if idx := strings.Index(base64Pack, ","); idx != -1 {
		base64Pack = base64Pack[idx+1:]
	}
	packBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(base64Pack))
	if err != nil {
		return 0, fmt.Errorf("invalid base64 pack data: %w", err)
	}
	manifest, filesMap, err := notes.ParseWritttPack(packBytes, passphrase)
	if err != nil {
		return 0, err
	}
	imported := 0
	for _, f := range manifest.Files {
		plain, ok := filesMap[f.ID]
		if !ok {
			continue
		}
		doc := domain.Document{
			Frontmatter: domain.Frontmatter{
				ID:      f.ID,
				Title:   f.Name,
				Type:    "markdown",
				Tags:    f.Tags,
				IsVault: f.Type == "vault",
			},
			Content: string(plain),
		}
		if _, saveErr := s.SaveDocument(doc); saveErr == nil {
			imported++
		}
	}
	s.AppendConsoleAndAudit("import:"+manifest.PackName, "pack.import", fmt.Sprintf("Pacote '%s' importado (%d documentos)", manifest.PackName, imported))
	return imported, nil
}

// ExportDocumentArtifact renders docID into EPUB 3.0, standalone HTML5, or YAML+Markdown.
func (s *WritttService) ExportDocumentArtifact(docID string, format string) (*domain.ExportBundleResult, error) {
	doc, err := s.ReadDocument(docID)
	if err != nil {
		return nil, err
	}
	if doc.Frontmatter.Encrypted {
		return nil, fmt.Errorf("desbloqueie o cofre antes de exportar documento criptografado")
	}
	safeTitle := strings.ReplaceAll(strings.ToLower(doc.Frontmatter.Title), " ", "-")
	if safeTitle == "" {
		safeTitle = docID
	}

	var outBytes []byte
	var ext, desc string

	aliasCfg, _ := s.GetOperatorAlias()
	authorName := strings.TrimSpace(aliasCfg.Alias)
	if authorName == "" || authorName == "@local-operator" {
		authorName = "Writtt Studio"
	}

	switch strings.ToLower(format) {
	case "epub", "epub3":
		xhtmlBody := domain.RenderMarkdownToXHTML(doc.Content)
		outBytes, err = notes.GenerateEPUB3(doc.Frontmatter.Title, authorName, "pt-BR", xhtmlBody)
		if err != nil {
			return nil, err
		}
		ext = "epub"
		desc = "EPUB 3.0 E-Book Archive (OEBPS + NCX + XHTML)"
	case "html":
		xhtmlBody := domain.RenderMarkdownToXHTML(doc.Content)
		printStyles := `<style>
body{max-width:740px;margin:48px auto;padding:0 24px;font-family:Georgia,"Times New Roman",serif;font-size:17px;line-height:1.75;color:#18181b;background:#ffffff;}
h1,h2,h3{font-family:system-ui,-apple-system,sans-serif;line-height:1.25;margin-top:1.6em;color:#09090b;}
blockquote{border-left:3px solid #71717a;padding-left:16px;color:#52525b;margin:1.2em 0;}
pre,code{font-family:ui-monospace,Consolas,monospace;font-size:0.9em;background:#f4f4f5;border-radius:4px;}
pre{padding:12px;overflow-x:auto;}
table{width:100%;border-collapse:collapse;margin:1.2em 0;}
th,td{border:1px solid #d4d4d8;padding:8px 10px;text-align:left;}
@media print{body{margin:0;padding:0;font-size:12pt;}}
</style>`
		htmlDoc := fmt.Sprintf("<!DOCTYPE html>\n<html lang=\"pt-BR\"><head><meta charset=\"utf-8\"/><meta name=\"author\" content=%q/><title>%s</title>%s</head><body>%s</body></html>", authorName, doc.Frontmatter.Title, printStyles, xhtmlBody)
		outBytes = []byte(htmlDoc)
		ext = "html"
		desc = "Standalone Semantic HTML5 Document (Print/PDF Ready)"
	default:
		outBytes, err = encodeMarkdownDocument(*doc)
		if err != nil {
			return nil, err
		}
		ext = "md"
		desc = "Markdown + YAML Frontmatter"
	}

	filename := safeTitle + "." + ext
	exportPath := filepath.Join(s.baseDir, "exports", filename)
	_ = s.hal.WriteFile(exportPath, outBytes)
	shaHex, _ := algorithms.SHA256(string(outBytes))
	s.AppendConsoleAndAudit("export:"+filename, "document.export", fmt.Sprintf("Documento exportado em %s (%d bytes)", strings.ToUpper(ext), len(outBytes)))

	return &domain.ExportBundleResult{
		Format:      ext,
		Filename:    filename,
		SavedPath:   exportPath,
		SizeBytes:   len(outBytes),
		SHA256Hex:   shaHex,
		Base64Data:  base64.StdEncoding.EncodeToString(outBytes),
		Description: desc,
	}, nil
}

// GetOperatorAlias returns the author's @alias handle and cooldown window state.
func (s *WritttService) GetOperatorAlias() (domain.AliasConfigDTO, error) {
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return domain.AliasConfigDTO{}, err
	}
	alias := cfg.OperatorAlias
	if alias == "" {
		alias = "@local-operator"
	}
	penaltyDays := domain.ComputeNextAliasPenaltyDays(cfg.AliasChangeCount)
	canChange := true
	remainingHours := 0
	nextAllowedStr := ""
	if cfg.AliasLastChanged != "" && penaltyDays > 0 {
		if lastTime, parseErr := time.Parse(time.RFC3339, cfg.AliasLastChanged); parseErr == nil {
			nextTime := lastTime.Add(time.Duration(penaltyDays) * 24 * time.Hour)
			nextAllowedStr = nextTime.Format("2006-01-02 15:04")
			if time.Now().Before(nextTime) {
				canChange = false
				remainingHours = int(time.Until(nextTime).Hours()) + 1
			}
		}
	}
	return domain.AliasConfigDTO{
		Alias:          alias,
		ChangeCount:    cfg.AliasChangeCount,
		PenaltyDays:    penaltyDays,
		LastChangedAt:  cfg.AliasLastChanged,
		NextAllowedAt:  nextAllowedStr,
		CanChangeNow:   canChange,
		RemainingHours: remainingHours,
	}, nil
}

// SetOperatorAlias updates the author's @alias handle subject to the progressive cooldown schedule.
func (s *WritttService) SetOperatorAlias(alias string) (domain.AliasConfigDTO, error) {
	normalized, err := domain.ValidateOperatorAlias(alias)
	if err != nil {
		return domain.AliasConfigDTO{}, err
	}
	currentStatus, err := s.GetOperatorAlias()
	if err != nil {
		return domain.AliasConfigDTO{}, err
	}
	if normalized == currentStatus.Alias {
		return currentStatus, nil
	}
	if !currentStatus.CanChangeNow {
		return currentStatus, fmt.Errorf("alias bloqueado por cooldown (%d dias / %dh restantes ate %s)", currentStatus.PenaltyDays, currentStatus.RemainingHours, currentStatus.NextAllowedAt)
	}
	cfg, _ := s.loadSecurityCfg()
	cfg.OperatorAlias = normalized
	cfg.AliasChangeCount++
	cfg.AliasLastChanged = time.Now().Format(time.RFC3339)
	if err := s.saveSecurityCfg(cfg); err != nil {
		return domain.AliasConfigDTO{}, err
	}
	s.AppendConsoleAndAudit("express", "alias.updated", fmt.Sprintf("Identificador publico Writtt Express alterado para %s (mudanca #%d)", normalized, cfg.AliasChangeCount))
	return s.GetOperatorAlias()
}
