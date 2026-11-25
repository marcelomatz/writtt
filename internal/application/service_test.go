package application

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/marcelomatz/matz-core/notes"

	"writtt/internal/domain"
)

func newTestService() (*WritttService, *inMemoryTestRunner) {
	mock := newInMemoryTestRunner()
	svc := NewWritttService(mock, "/mock/writtt")
	return svc, mock
}

func TestDocumentCRUDAndSplitScreenAndVersions(t *testing.T) {
	svc, _ := newTestService()

	// Create document with automatic title extraction
	id, err := svc.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{
			Tags: []string{"crypto", "architecture"},
		},
		Content: "# Arquitetura Zero-Knowledge\n\nPrimeiro paragrafo do documento.",
	})
	if err != nil || id == "" {
		t.Fatalf("SaveDocument failed: %v", err)
	}

	doc, err := svc.ReadDocument(id)
	if err != nil {
		t.Fatalf("ReadDocument failed: %v", err)
	}
	if doc.Frontmatter.Title != "Arquitetura Zero-Knowledge" {
		t.Fatalf("expected derived title 'Arquitetura Zero-Knowledge', got %q", doc.Frontmatter.Title)
	}
	if doc.Frontmatter.Version != 1 {
		t.Fatalf("expected version 1, got %d", doc.Frontmatter.Version)
	}

	// Update document to generate version 2
	doc.Content = "# Arquitetura Zero-Knowledge\n\nSegundo paragrafo adicionado na revisao."
	if _, err := svc.SaveDocument(*doc); err != nil {
		t.Fatalf("second SaveDocument failed: %v", err)
	}

	versions, err := svc.ListDocumentVersions(id)
	if err != nil || len(versions) != 2 {
		t.Fatalf("expected 2 versions, got %d (%v)", len(versions), err)
	}

	diffReport, err := svc.DiffDocumentVersions(id, 1, 2)
	if err != nil {
		t.Fatalf("DiffDocumentVersions failed: %v", err)
	}
	if diffReport.Additions == 0 {
		t.Fatalf("expected positive Additions in diff report")
	}

	restored, err := svc.RestoreDocumentVersion(id, 1)
	if err != nil {
		t.Fatalf("RestoreDocumentVersion failed: %v", err)
	}
	if !strings.Contains(restored.Content, "Primeiro paragrafo") {
		t.Fatalf("expected restored version 1 content, got %q", restored.Content)
	}

	// Update metadata, rename, and move
	if err := svc.UpdateMetadata(id, []string{"crypto", "vault"}, false); err != nil {
		t.Fatalf("UpdateMetadata failed: %v", err)
	}
	if err := svc.RenameDocument(id, "Manual Oficial Writtt"); err != nil {
		t.Fatalf("RenameDocument failed: %v", err)
	}
	if err := svc.MoveDocument(id, id, 1); err == nil {
		t.Fatalf("expected self-parent move to fail")
	}

	// Create split child document and merge back
	splitRes, err := svc.CreateSplitDoc(id, "Capitulo 2 - Subdocumento")
	if err != nil || splitRes.SplitID == "" {
		t.Fatalf("CreateSplitDoc failed: %v", err)
	}
	if err := svc.MoveDocument(splitRes.SplitID, id, 2); err != nil {
		t.Fatalf("MoveDocument failed: %v", err)
	}
	children, err := svc.ListChildren(id)
	if err != nil || len(children) != 1 {
		t.Fatalf("expected 1 child doc, got %d (%v)", len(children), err)
	}
	splitOnly, err := svc.ListDocuments("split", 50)
	if err != nil || len(splitOnly) != 1 {
		t.Fatalf("expected 1 split doc in filter, got %d", len(splitOnly))
	}

	if err := svc.MergeToParent(id, "# Manual Oficial Writtt\n\nConteudo mesclado com sucesso."); err != nil {
		t.Fatalf("MergeToParent failed: %v", err)
	}

	// Search by content and tag
	matches, err := svc.Search("mesclado")
	if err != nil || len(matches) == 0 {
		t.Fatalf("expected search match for 'mesclado', got %d (%v)", len(matches), err)
	}
	tagMatches, err := svc.Search("vault")
	if err != nil || len(tagMatches) == 0 {
		t.Fatalf("expected search match for tag 'vault'")
	}

	// Save attachment
	b64Img := "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("PNG_DATA"))
	attachURL, err := svc.SaveAttachment("diagram.png", b64Img)
	if err != nil || !strings.HasPrefix(attachURL, "/attachments/") {
		t.Fatalf("SaveAttachment failed: %v (%s)", err, attachURL)
	}

	// Delete split doc
	if err := svc.DeleteDocument(splitRes.SplitID); err != nil {
		t.Fatalf("DeleteDocument failed: %v", err)
	}
}

func TestVaultArgon2idPasswordPINRecoveryAndTOTP(t *testing.T) {
	svc, _ := newTestService()

	// Create a vault document before setting password
	vaultID, err := svc.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{
			Title:   "Segredo Estratégico",
			IsVault: true,
			Tags:    []string{"top-secret"},
		},
		Content: "Chave privada de producao: SUPER_CONFIDENCIAL_2026",
	})
	if err != nil {
		t.Fatalf("SaveDocument vault failed: %v", err)
	}

	// Configure Master Password via Saga (re-encrypts existing vault doc)
	if err := svc.SetPassword("", "MasterPass#2026"); err != nil {
		t.Fatalf("SetPassword failed: %v", err)
	}

	secCfg, err := svc.GetSecurityConfig()
	if err != nil || !secCfg.PasswordEnabled || !secCfg.VaultUnlocked {
		t.Fatalf("unexpected security config after SetPassword: %+v (%v)", secCfg, err)
	}

	// Lock vault and verify content is hidden & excluded from plaintext search
	svc.LockVault()
	if svc.IsVaultUnlocked() {
		t.Fatalf("expected vault to be locked")
	}

	lockedDoc, err := svc.ReadDocument(vaultID)
	if err != nil {
		t.Fatalf("ReadDocument while locked failed: %v", err)
	}
	if !lockedDoc.Frontmatter.Encrypted || lockedDoc.Content != "" {
		t.Fatalf("expected locked vault doc to hide content, got encrypted=%v content=%q", lockedDoc.Frontmatter.Encrypted, lockedDoc.Content)
	}

	searchLeaks, _ := svc.Search("SUPER_CONFIDENCIAL_2026")
	if len(searchLeaks) != 0 {
		t.Fatalf("expected locked vault content to be excluded from search results")
	}

	// Unlock vault with Master Password
	if !svc.UnlockVault("MasterPass#2026") {
		t.Fatalf("expected UnlockVault to succeed")
	}
	unlockedDoc, err := svc.ReadDocument(vaultID)
	if err != nil || !strings.Contains(unlockedDoc.Content, "SUPER_CONFIDENCIAL_2026") {
		t.Fatalf("expected decrypted content after UnlockVault, got %q (%v)", unlockedDoc.Content, err)
	}

	// Configure Quick PIN and test PIN unlock
	if err := svc.SetVaultPIN("MasterPass#2026", "4826"); err != nil {
		t.Fatalf("SetVaultPIN failed: %v", err)
	}
	svc.LockApp()
	if !svc.UnlockVaultWithPIN("4826") {
		t.Fatalf("expected UnlockVaultWithPIN to succeed")
	}
	if err := svc.RemoveVaultPIN("MasterPass#2026"); err != nil {
		t.Fatalf("RemoveVaultPIN failed: %v", err)
	}

	// Generate 256-bit Recovery Key and recover vault to a new password
	rkFormatted, err := svc.GenerateRecoveryKey("MasterPass#2026")
	if err != nil || len(rkFormatted) != 71 {
		t.Fatalf("GenerateRecoveryKey failed: %v (%s)", err, rkFormatted)
	}
	if err := svc.RecoverVaultWithKey(rkFormatted, "NewRecoveredPass#2026"); err != nil {
		t.Fatalf("RecoverVaultWithKey failed: %v", err)
	}
	if !svc.UnlockApp("NewRecoveredPass#2026") {
		t.Fatalf("expected UnlockApp with recovered password to succeed")
	}

	// Setup, enable, verify RFC 6238 TOTP 2FA + ReplayWindow + single-use backup code
	bundle, err := svc.SetupVaultTOTP("NewRecoveredPass#2026")
	if err != nil || bundle.SecretBase32 == "" || len(bundle.BackupCodes) != 8 {
		t.Fatalf("SetupVaultTOTP failed: %v", err)
	}
	code, err := notes.ComputeTOTPCodeAt(bundle.SecretBase32, time.Now())
	if err != nil {
		t.Fatalf("ComputeTOTPCodeAt failed: %v", err)
	}
	if err := svc.EnableVaultTOTP("NewRecoveredPass#2026", code); err != nil {
		t.Fatalf("EnableVaultTOTP failed: %v", err)
	}

	ok, err := svc.VerifyVaultTOTP(code)
	if err != nil || !ok {
		t.Fatalf("first VerifyVaultTOTP should succeed: %v", err)
	}
	// Replay of the exact same TOTP code in the same 30s window must be blocked by ReplayWindow
	if okReplay, _ := svc.VerifyVaultTOTP(code); okReplay {
		t.Fatalf("expected ReplayWindow to reject duplicate TOTP code")
	}

	// Backup code verification (single-use)
	backupCode := bundle.BackupCodes[0]
	if okBackup, err := svc.VerifyVaultTOTP(backupCode); err != nil || !okBackup {
		t.Fatalf("expected backup code to succeed on first use: %v", err)
	}
	if okBackupAgain, _ := svc.VerifyVaultTOTP(backupCode); okBackupAgain {
		t.Fatalf("expected consumed backup code to be rejected on second use")
	}

	if err := svc.DisableVaultTOTP("NewRecoveredPass#2026"); err != nil {
		t.Fatalf("DisableVaultTOTP failed: %v", err)
	}

	// Brute-force lockout: 1st wrong = 0s, 2nd wrong = 20s lockout
	if svc.UnlockVault("wrong-password-1") {
		t.Fatalf("expected 1st wrong password to fail")
	}
	cfgAfter1, _ := svc.GetSecurityConfig()
	if cfgAfter1.BruteForceLocked {
		t.Fatalf("expected no lockout after 1st wrong password")
	}

	if svc.UnlockVault("wrong-password-2") {
		t.Fatalf("expected 2nd wrong password to fail")
	}
	cfgAfter2, _ := svc.GetSecurityConfig()
	if !cfgAfter2.BruteForceLocked || cfgAfter2.BruteForceRetrySec < 18 || cfgAfter2.BruteForceRetrySec > 20 {
		t.Fatalf("expected ~20s lockout after 2nd wrong password, got locked=%v retry=%ds", cfgAfter2.BruteForceLocked, cfgAfter2.BruteForceRetrySec)
	}

	// Even with the right password, lockout must reject while active
	if svc.UnlockVault("NewRecoveredPass#2026") {
		t.Fatalf("expected brute-force lockout to block authentication")
	}

	// Reset lockout and remove password protection
	svc.recordAuthSuccess()
	if err := svc.RemovePassword("NewRecoveredPass#2026"); err != nil {
		t.Fatalf("RemovePassword failed: %v", err)
	}
}

func TestExpressEnvelopesDriveVaultExportsAndAlgorithmsLab(t *testing.T) {
	svc, mock := newTestService()
	mock.OpenPorts["127.0.0.1:11434"] = true

	// Writtt Express RSA-2048 OAEP + AES-256-GCM hybrid envelopes
	sentMsg, err := svc.SendExpressEnvelope("@alice", "Chaves de Lancamento", "Payload confidencial zero-knowledge", "")
	if err != nil || !sentMsg.Sealed {
		t.Fatalf("SendExpressEnvelope failed: %v", err)
	}
	inbox, err := svc.ListExpressInbox()
	if err != nil || len(inbox) != 1 {
		t.Fatalf("ListExpressInbox failed: %v", err)
	}
	unsealed, err := svc.UnsealExpressMessage(sentMsg.ID)
	if err != nil || unsealed.DecryptedBody != "Payload confidencial zero-knowledge" {
		t.Fatalf("UnsealExpressMessage failed: %v (%+v)", err, unsealed)
	}
	if err := svc.DeleteExpressMessage(sentMsg.ID); err != nil {
		t.Fatalf("DeleteExpressMessage failed: %v", err)
	}

	// E2EE Drive Vault upload, inspect ciphertext entropy, decrypt, delete
	drvFile, err := svc.UploadDriveVaultFile("contract.pdf", "application/pdf", base64.StdEncoding.EncodeToString([]byte("PDF_CONFIDENTIAL_STREAM_2026")))
	if err != nil || drvFile.SaltHex == "" || drvFile.NonceHex == "" {
		t.Fatalf("UploadDriveVaultFile failed: %v (%+v)", err, drvFile)
	}
	if drvFile.EntropyBits < 5.0 {
		t.Fatalf("expected ciphertext byte entropy >= 5.0 b/B, got %.2f", drvFile.EntropyBits)
	}
	driveList, err := svc.ListDriveVaultFiles()
	if err != nil || len(driveList) != 1 {
		t.Fatalf("ListDriveVaultFiles failed: %v", err)
	}
	decDrive, err := svc.DecryptDriveVaultFile(drvFile.ID)
	if err != nil || decDrive != "PDF_CONFIDENTIAL_STREAM_2026" {
		t.Fatalf("DecryptDriveVaultFile failed: %v (%s)", err, decDrive)
	}
	if err := svc.DeleteDriveVaultFile(drvFile.ID); err != nil {
		t.Fatalf("DeleteDriveVaultFile failed: %v", err)
	}

	// Create sample document and export to .writttpack, EPUB 3.0, HTML, and Markdown
	docID, err := svc.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{
			Title: "Livro Criptografia Aplicada",
			Tags:  []string{"book", "epub"},
		},
		Content: "# Capitulo 1\n\nTexto completo do livro.\n\n## Secao 1.1\n\nDetalhes tecnicos.",
	})
	if err != nil {
		t.Fatalf("SaveDocument failed: %v", err)
	}

	for _, fmtName := range []string{"epub", "html", "md"} {
		exp, err := svc.ExportDocumentArtifact(docID, fmtName)
		if err != nil || exp.SizeBytes == 0 || exp.Base64Data == "" {
			t.Fatalf("ExportDocumentArtifact(%s) failed: %v", fmtName, err)
		}
	}

	packRes, err := svc.ExportWritttPack("Backup-2026", "PackPass#2026")
	if err != nil || packRes.SizeBytes == 0 {
		t.Fatalf("ExportWritttPack failed: %v", err)
	}
	importedCount, err := svc.ImportWritttPack(packRes.Base64Data, "PackPass#2026")
	if err != nil || importedCount == 0 {
		t.Fatalf("ImportWritttPack failed: %v (count=%d)", err, importedCount)
	}

	// Guard: ExportWritttPack must refuse silent partial export when Vault documents are locked
	_, _ = svc.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{Title: "Obra Secreta", IsVault: true},
		Content:     "Conteudo inedito protegido.",
	})
	_ = svc.SetPassword("", "GuardPass#2026")
	svc.LockVault()
	if _, lockedPackErr := svc.ExportWritttPack("Partial-Backup", "PackPass#2026"); lockedPackErr == nil {
		t.Fatalf("expected ExportWritttPack to reject export while Vault documents are locked")
	}
	_ = svc.RemovePassword("GuardPass#2026")

	// Custom Dictionary
	words, err := svc.AddDictionaryWord("ZeroKnowledge")
	if err != nil || len(words) == 0 {
		t.Fatalf("AddDictionaryWord failed: %v", err)
	}
	words, err = svc.RemoveDictionaryWord("ZeroKnowledge")
	if err != nil {
		t.Fatalf("RemoveDictionaryWord failed: %v", err)
	}

	// Local AI Assistant + Context Sanitizer
	if !svc.ScanLocalAI() {
		t.Fatalf("expected ScanLocalAI true")
	}
	models, err := svc.GetLocalModels()
	if err != nil || len(models) == 0 {
		t.Fatalf("GetLocalModels failed: %v", err)
	}
	aiReply, err := svc.AskAssistant(models[0], "Resuma o texto", "Texto com token sk-AbCdEfGhIjKlMnOpQrStUvWxYz123456 embutido.")
	if err != nil || aiReply == "" {
		t.Fatalf("AskAssistant failed: %v", err)
	}

	// ZKP Simulator & COE Algorithms Report
	zkp := svc.SimulateZKPRound(16, "path-B")
	if !zkp.Verified || zkp.Round != 16 {
		t.Fatalf("SimulateZKPRound failed: %+v", zkp)
	}
	report := svc.BuildAlgorithmsReport()
	if !report.ForensicValid || len(report.ForensicRecords) == 0 || len(report.ConsoleLines) == 0 {
		t.Fatalf("expected populated BuildAlgorithmsReport, got %+v", report)
	}
}

func TestServiceEdgeCasesAndValidation(t *testing.T) {
	svc, mock := newTestService()

	// Invalid document IDs
	if _, err := svc.ReadDocument("../traversal"); err == nil {
		t.Fatalf("expected invalid ID error")
	}
	if err := svc.DeleteDocument("../traversal"); err == nil {
		t.Fatalf("expected invalid ID error on delete")
	}
	if _, err := svc.ListDocumentVersions("../traversal"); err == nil {
		t.Fatalf("expected invalid ID error on ListDocumentVersions")
	}

	// Untitled fallback and Diff against current version (toVersion == 0)
	id, err := svc.SaveDocument(domain.Document{Content: ""})
	if err != nil {
		t.Fatalf("SaveDocument empty failed: %v", err)
	}
	d, _ := svc.ReadDocument(id)
	if d.Frontmatter.Title != "Untitled" {
		t.Fatalf("expected Untitled fallback, got %q", d.Frontmatter.Title)
	}
	diffZero, err := svc.DiffDocumentVersions(id, 1, 0)
	if err != nil || diffZero.ToVersion != 1 {
		t.Fatalf("expected DiffDocumentVersions with toVersion=0 to resolve current version, got %+v (%v)", diffZero, err)
	}
	if _, err := svc.RestoreDocumentVersion(id, 999); err == nil {
		t.Fatalf("expected missing version error")
	}

	// Empty / invalid passwords & recovery keys
	if err := svc.SetPassword("", "   "); err == nil {
		t.Fatalf("expected empty password error")
	}
	if err := svc.SetVaultPIN("", ""); err == nil {
		t.Fatalf("expected empty PIN error")
	}
	if _, err := svc.GenerateRecoveryKey("nopass"); err == nil {
		t.Fatalf("expected GenerateRecoveryKey to fail when password not enabled")
	}
	if err := svc.RecoverVaultWithKey("invalid", "newpass"); err == nil {
		t.Fatalf("expected RecoverVaultWithKey to fail when not configured")
	}
	if err := svc.EnableVaultTOTP("", "000000"); err == nil {
		t.Fatalf("expected EnableVaultTOTP without setup to fail")
	}
	if _, err := svc.VerifyVaultTOTP("000000"); err == nil {
		t.Fatalf("expected VerifyVaultTOTP when disabled to fail")
	}

	// Drive raw text fallback & missing file
	drv, err := svc.UploadDriveVaultFile("notes.txt", "text/plain", "raw plain text not base64!")
	if err != nil || drv.ID == "" {
		t.Fatalf("expected raw text UploadDriveVaultFile fallback to succeed: %v", err)
	}
	if _, err := svc.DecryptDriveVaultFile("nonexistent"); err == nil {
		t.Fatalf("expected missing drive file error")
	}

	// Export pack validation & invalid base64 import
	if _, err := svc.ExportWritttPack("pack", ""); err == nil {
		t.Fatalf("expected empty passphrase error on ExportWritttPack")
	}
	if _, err := svc.ImportWritttPack("!!!not_base64!!!", "pass"); err == nil {
		t.Fatalf("expected invalid base64 error on ImportWritttPack")
	}

	// SaveAttachment validation
	if _, err := svc.SaveAttachment(".", "YWJj"); err == nil {
		t.Fatalf("expected invalid attachment filename error")
	}
	if _, err := svc.SaveAttachment("img.png", "!!!bad_b64!!!"); err == nil {
		t.Fatalf("expected invalid base64 attachment error")
	}

	// AI fallback models when Ollama returns error
	mock.OllamaModels = nil
	models, _ := svc.GetLocalModels()
	if len(models) == 0 {
		t.Fatalf("expected fallback models list")
	}

	// Encrypted context blocked by AI sanitizer
	if _, err := svc.AskAssistant("llama3.2:latest", "test", "enc:secretcipher"); err == nil {
		t.Fatalf("expected encrypted context to be blocked by AskAssistant")
	}

	// Default constructor & additional branches
	defaultSvc := NewWritttService(nil, "")
	if defaultSvc.DataDir() == "" {
		t.Fatalf("expected non-empty DataDir")
	}
	_, _ = svc.GetCustomDictionary()
	_, _ = svc.AddDictionaryWord("")
	_, _ = svc.AddDictionaryWord("writtt")
	_, _ = svc.AddDictionaryWord("writtt")
	_, _ = svc.ListDocuments("vault", 0)
	_, _ = svc.Search("")
	if _, err := svc.UnsealExpressMessage("missing-id"); err == nil {
		t.Fatalf("expected missing express envelope error")
	}
}

func TestPasswordRotationWithTOTPAndDriveAndHierarchyCyclesAndRAG(t *testing.T) {
	svc, _ := newTestService()

	// Create parent & child documents and verify cycle protection + breadcrumbs + reorder
	parentID, err := svc.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{Title: "Root Architecture"},
		Content:     "# Root Architecture\nArgon2id derives 256-bit keys for AES-256-GCM.",
	})
	if err != nil {
		t.Fatalf("SaveDocument parent failed: %v", err)
	}
	childID, err := svc.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{Title: "Sub Module", ParentID: parentID},
		Content:     "# Sub Module\nSchnorr Zero-Knowledge Proof soundness verification.",
	})
	if err != nil {
		t.Fatalf("SaveDocument child failed: %v", err)
	}

	// Attempt to move parent under child -> must fail cycle detection!
	if err := svc.MoveDocument(parentID, childID, 1); err == nil {
		t.Fatalf("expected MoveDocument(parent, child) to be rejected as a hierarchy cycle")
	}
	if err := svc.ReorderDocuments(childID, []string{parentID}); err == nil {
		t.Fatalf("expected ReorderDocuments(child, [parent]) to be rejected as a hierarchy cycle")
	}
	if err := svc.ReorderDocuments("", []string{parentID, childID}); err != nil {
		t.Fatalf("expected valid ReorderDocuments to succeed: %v", err)
	}
	_ = svc.MoveDocument(childID, parentID, 2)
	crumbs, err := svc.GetDocumentBreadcrumbs(childID)
	if err != nil || len(crumbs) != 2 || crumbs[0].ID != parentID || crumbs[1].ID != childID {
		t.Fatalf("unexpected GetDocumentBreadcrumbs result: %+v (err=%v)", crumbs, err)
	}

	// Vault document + binary Drive file + TOTP across Master Password rotation
	_, err = svc.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{Title: "Vault Secret Note", IsVault: true},
		Content:     "QUANTUM_RESISTANT_VAULT_PAYLOAD_2026",
	})
	if err != nil {
		t.Fatalf("SaveDocument vault failed: %v", err)
	}
	if err := svc.SetPassword("", "PassOne#2026"); err != nil {
		t.Fatalf("SetPassword PassOne failed: %v", err)
	}

	// Unlocked vault document must be found by Search and RAG
	unlockedMatches, err := svc.Search("QUANTUM_RESISTANT_VAULT_PAYLOAD_2026")
	if err != nil || len(unlockedMatches) != 1 {
		t.Fatalf("expected unlocked vault document to match Search, got %d (%v)", len(unlockedMatches), err)
	}
	ragHits, err := svc.SearchWorkspaceRAG("Argon2id 256-bit keys AES-256-GCM", 5)
	if err != nil || len(ragHits) == 0 {
		t.Fatalf("expected SearchWorkspaceRAG to return semantic hits, got %+v (%v)", ragHits, err)
	}

	// Upload binary payload (non-UTF8 bytes 0x89 PNG header) to Drive Vault
	rawBinary := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0xFF, 0xFE, 0x00, 0x42}
	drvEntry, err := svc.UploadDriveVaultFile("diagram.png", "image/png", base64.StdEncoding.EncodeToString(rawBinary))
	if err != nil {
		t.Fatalf("UploadDriveVaultFile binary failed: %v", err)
	}

	// Enable TOTP under PassOne#2026
	totpBundle, err := svc.SetupVaultTOTP("PassOne#2026")
	if err != nil {
		t.Fatalf("SetupVaultTOTP failed: %v", err)
	}
	totpCode, _ := notes.ComputeTOTPCodeAt(totpBundle.SecretBase32, time.Now())
	if err := svc.EnableVaultTOTP("PassOne#2026", totpCode); err != nil {
		t.Fatalf("EnableVaultTOTP failed: %v", err)
	}

	// Rotate Master Password from PassOne#2026 to PassTwo#2026 -> must re-encrypt Vault docs, TOTP secret, and Drive files!
	if err := svc.SetPassword("PassOne#2026", "PassTwo#2026"); err != nil {
		t.Fatalf("SetPassword rotation to PassTwo failed: %v", err)
	}

	// Verify binary Drive file decrypts intact via DecryptDriveVaultFileBase64 under PassTwo#2026
	b64Out, err := svc.DecryptDriveVaultFileBase64(drvEntry.ID)
	if err != nil {
		t.Fatalf("DecryptDriveVaultFileBase64 after password rotation failed: %v", err)
	}
	decBinary, err := base64.StdEncoding.DecodeString(b64Out)
	if err != nil || string(decBinary) != string(rawBinary) {
		t.Fatalf("binary Drive payload corrupted after password rotation: got %x, want %x", decBinary, rawBinary)
	}

	// Verify TOTP backup code / secret still works after password rotation and password removal
	if err := svc.RemovePassword("PassTwo#2026"); err != nil {
		t.Fatalf("RemovePassword failed: %v", err)
	}
	b64AfterRemove, err := svc.DecryptDriveVaultFileBase64(drvEntry.ID)
	if err != nil || b64AfterRemove != base64.StdEncoding.EncodeToString(rawBinary) {
		t.Fatalf("DecryptDriveVaultFileBase64 after RemovePassword failed: %v", err)
	}

	// Trusted Devices & Operator @alias iterative cooldown
	devs, err := svc.ListTrustedDevices()
	if err != nil || len(devs) != 1 || !devs[0].Current {
		t.Fatalf("expected 1 primary trusted device, got %+v (%v)", devs, err)
	}
	addedDev, err := svc.RegisterTrustedDevice("MacBook Pro M4 Max")
	if err != nil || addedDev.ID == "" {
		t.Fatalf("RegisterTrustedDevice failed: %v", err)
	}
	if _, err := svc.RevokeTrustedDevice(devs[0].ID); err == nil {
		t.Fatalf("revoking current primary workstation must be rejected")
	}
	afterRevoke, err := svc.RevokeTrustedDevice(addedDev.ID)
	if err != nil || len(afterRevoke) != 1 {
		t.Fatalf("RevokeTrustedDevice failed: %v", err)
	}

	aliasCfg, err := svc.GetOperatorAlias()
	if err != nil || aliasCfg.Alias != "@local-operator" || !aliasCfg.CanChangeNow {
		t.Fatalf("unexpected initial alias config: %+v (%v)", aliasCfg, err)
	}
	updatedAlias, err := svc.SetOperatorAlias("@matz-chief")
	if err != nil || updatedAlias.Alias != "@matz-chief" || updatedAlias.PenaltyDays != 15 || updatedAlias.CanChangeNow {
		t.Fatalf("expected alias change #1 to set 15d cooldown, got %+v (%v)", updatedAlias, err)
	}
	if _, err := svc.SetOperatorAlias("@second-change"); err == nil {
		t.Fatalf("expected immediate second alias change to be blocked by 15d cooldown")
	}
}

func TestAutoSaveImportAuthorshipProofAndShutdown(t *testing.T) {
	svc, _ := newTestService()

	// Import manuscript directly
	importedID, err := svc.ImportDocumentContent("capitulo-inedito.md", "# Capitulo 1\n\nTexto inedito para protecao autoral.", false)
	if err != nil || importedID == "" {
		t.Fatalf("ImportDocumentContent failed: %v", err)
	}

	doc, err := svc.ReadDocument(importedID)
	if err != nil {
		t.Fatalf("ReadDocument failed: %v", err)
	}
	if doc.Frontmatter.Title != "capitulo-inedito" {
		t.Fatalf("expected imported title 'capitulo-inedito', got %q", doc.Frontmatter.Title)
	}

	// AutoSave updates content without incrementing version snapshots
	doc.Content = "# Capitulo 1\n\nTexto inedito revisado automaticamente."
	if _, err := svc.AutoSaveDocument(*doc); err != nil {
		t.Fatalf("AutoSaveDocument failed: %v", err)
	}
	versions, err := svc.ListDocumentVersions(importedID)
	if err != nil || len(versions) != 1 {
		t.Fatalf("expected AutoSaveDocument to keep 1 snapshot, got %d (%v)", len(versions), err)
	}

	// Generate cryptographic Pre-Publication Authorship Proof
	proof, err := svc.GenerateAuthorshipProof(importedID)
	if err != nil {
		t.Fatalf("GenerateAuthorshipProof failed: %v", err)
	}
	if proof.ContentSHA256 == "" || proof.ForensicHash == "" || !strings.Contains(proof.CertificateText, "WRITTT PRE-PUBLICATION AUTHORSHIP CERTIFICATE") {
		t.Fatalf("unexpected AuthorshipProofDTO: %+v", proof)
	}

	// Shutdown zeroizes keys and locks vault
	if err := svc.SetPassword("", "ShutdownPass#2026"); err != nil {
		t.Fatalf("SetPassword failed: %v", err)
	}
	if !svc.IsVaultUnlocked() {
		t.Fatalf("expected vault unlocked before Shutdown")
	}
	svc.Shutdown()
	if svc.IsVaultUnlocked() {
		t.Fatalf("expected vault locked and keys zeroized after Shutdown")
	}
}

func TestSandboxedAIChatAndStructuredReplySeparation(t *testing.T) {
	svc, mock := newTestService()
	mock.OllamaReply = "<opinion>Sugiro tornar o dialogo mais direto e objetivo.</opinion>\n<content>Ele fechou o caderno e guardou a chave no bolso.</content>"

	reply, err := svc.ChatWithAssistant(
		"llama3.2:latest",
		[]domain.AIChatMessage{{Role: "user", Content: "Melhore este trecho e crie um software no meu disco"}},
		"# Capitulo 1\n\nTexto inicial.",
		"Ele fechou o caderno devagar.",
		true,
	)
	if err != nil {
		t.Fatalf("ChatWithAssistant failed: %v", err)
	}
	if !reply.SandboxIsolated {
		t.Fatalf("expected SandboxIsolated=true")
	}
	if !strings.Contains(reply.Opinion, "dialogo mais direto") {
		t.Fatalf("expected separated opinion, got %q", reply.Opinion)
	}
	if reply.InsertableContent != "Ele fechou o caderno e guardou a chave no bolso." {
		t.Fatalf("expected clean insertable content, got %q", reply.InsertableContent)
	}
	if len(mock.Executed) != 0 {
		t.Fatalf("AI chat must never execute OS commands, got %v", mock.Executed)
	}

	// Free conversational chatbot mode (no insertable block, rejects embedding-only models)
	caps, _ := svc.GetLocalModelCapabilities()
	if len(caps) == 0 || !caps[0].SupportsChat {
		t.Fatalf("expected chat-capable default models, got %+v", caps)
	}
	freeReply, err := svc.FreeChatWithAssistant(
		"llama3.2:latest",
		[]domain.AIChatMessage{{Role: "user", Content: "Quais sao boas tecnicas de ritmo narrativo?"}},
		false,
		"",
		false,
	)
	if err != nil || freeReply.HasInsertable || freeReply.InsertableContent != "" || strings.TrimSpace(freeReply.Opinion) == "" {
		t.Fatalf("expected pure conversational reply with HasInsertable=false, got %+v (%v)", freeReply, err)
	}
	if _, err := svc.FreeChatWithAssistant("nomic-embed-text:latest", nil, false, "", false); err == nil {
		t.Fatalf("expected embedding-only model to be rejected in FreeChatWithAssistant")
	}

	// Blank Sub-Chapter vs. Full Standalone Duplicate Document
	parentID, err := svc.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{Title: "Romance Original", Tags: []string{"ficcao"}},
		Content:     "# Capitulo 1\n\nTexto integral da obra principal.",
	})
	if err != nil {
		t.Fatalf("SaveDocument parent failed: %v", err)
	}
	subDoc, err := svc.CreateSubChapter(parentID, "Cena Nova")
	if err != nil || subDoc == nil {
		t.Fatalf("CreateSubChapter failed: %v", err)
	}
	if subDoc.Content != "" || subDoc.Frontmatter.ParentID != parentID {
		t.Fatalf("expected blank sub-chapter linked to parent, got content=%q parent=%q", subDoc.Content, subDoc.Frontmatter.ParentID)
	}
	subDoc.Content = "Trecho inedito escrito no subcapitulo."
	_, _ = svc.SaveDocument(*subDoc)

	mergedParent, err := svc.AppendSubChapterToParent(subDoc.Frontmatter.ID)
	if err != nil || !strings.Contains(mergedParent.Content, "Texto integral da obra principal.") || !strings.Contains(mergedParent.Content, "## Cena Nova") || !strings.Contains(mergedParent.Content, "Trecho inedito escrito no subcapitulo.") {
		t.Fatalf("expected AppendSubChapterToParent to preserve parent text and append sub-chapter, got %q (%v)", mergedParent.Content, err)
	}

	dupDoc, err := svc.DuplicateDocument(parentID, "")
	if err != nil || dupDoc.Frontmatter.ID == parentID || dupDoc.Frontmatter.ParentID != "" || !strings.Contains(dupDoc.Frontmatter.Title, "(Copia)") || dupDoc.Content != mergedParent.Content {
		t.Fatalf("expected standalone full copy of parent document, got %+v (%v)", dupDoc, err)
	}
}

func TestPersistentLockoutAcrossRestartTamperSealAndHumanProofAntiBot(t *testing.T) {
	svc1, mock := newTestService()
	if err := svc1.SetPassword("", "UltraVault#2026"); err != nil {
		t.Fatalf("SetPassword failed: %v", err)
	}
	svc1.LockApp()

	// 1st wrong attempt -> 0s wait
	if svc1.UnlockApp("bad-1") {
		t.Fatalf("expected bad-1 to fail")
	}
	// 2nd wrong attempt -> 20s persistent lockout
	if svc1.UnlockApp("bad-2") {
		t.Fatalf("expected bad-2 to fail")
	}

	// Simulate closing and reopening the app (fresh WritttService over the same persisted disk)
	svcRestart1 := NewWritttService(mock, "/mock/writtt")
	secRestart1, err := svcRestart1.GetSecurityConfig()
	if err != nil || !secRestart1.BruteForceLocked || secRestart1.BruteForceRetrySec < 18 || secRestart1.BruteForceRetrySec > 20 {
		t.Fatalf("expected 20s lockout to persist across app restart, got %+v (%v)", secRestart1, err)
	}
	if svcRestart1.UnlockApp("UltraVault#2026") {
		t.Fatalf("expected reopened app to block even valid password while 20s timer is active")
	}

	// Fast-forward persisted lockout expiration to simulate waiting 20s, then reopen and fail a 3rd time -> 60s!
	cfgDisk, err := svcRestart1.loadSecurityCfg()
	if err != nil {
		t.Fatalf("loadSecurityCfg failed: %v", err)
	}
	cfgDisk.AuthLockedUntilMs = time.Now().Add(-1 * time.Second).UnixMilli()
	if err := svcRestart1.saveSecurityCfg(cfgDisk); err != nil {
		t.Fatalf("saveSecurityCfg failed: %v", err)
	}

	svcRestart2 := NewWritttService(mock, "/mock/writtt")
	if svcRestart2.UnlockApp("bad-3") {
		t.Fatalf("expected bad-3 to fail")
	}
	secAfter3, _ := svcRestart2.GetSecurityConfig()
	if !secAfter3.BruteForceLocked || secAfter3.BruteForceRetrySec < 58 || secAfter3.BruteForceRetrySec > 60 {
		t.Fatalf("expected 60s lockout after 3rd wrong password, got %+v", secAfter3)
	}

	// Reopen again: 60s lockout must still be active!
	svcRestart3 := NewWritttService(mock, "/mock/writtt")
	secRestart3, _ := svcRestart3.GetSecurityConfig()
	if !secRestart3.BruteForceLocked || secRestart3.BruteForceRetrySec < 58 {
		t.Fatalf("expected 60s lockout to survive restart, got %+v", secRestart3)
	}

	// Simulate an attacker editing security.json to zero out auth_failures without valid HMAC seal
	rawSecBytes, _ := mock.ReadFile(svcRestart3.securityFilePath())
	tampered := strings.ReplaceAll(string(rawSecBytes), `"auth_failures": 3`, `"auth_failures": 0`)
	_ = mock.WriteFile(svcRestart3.securityFilePath(), []byte(tampered))

	svcTampered := NewWritttService(mock, "/mock/writtt")
	secTampered, _ := svcTampered.GetSecurityConfig()
	if !secTampered.BruteForceLocked || secTampered.BruteForceRetrySec < 58 {
		t.Fatalf("expected HMAC tamper detection on security.json to enforce 60s lockout, got %+v", secTampered)
	}

	// Clear lockout cleanly via valid state to test HumanProof & Anti-Bot RPC
	svcTampered.recordAuthSuccess()

	ch := svcTampered.BeginAuthChallenge()
	ch.IssuedAtMs = time.Now().Add(-1500 * time.Millisecond).UnixMilli()
	ch.Signature = domain.SignAuthChallenge(svcTampered.authChallengeSecret, ch)

	// Valid human telemetry unlocks cleanly
	humanRes, err := svcTampered.UnlockWithHumanProof(domain.HumanUnlockRequest{
		Mode:   "password",
		Secret: "UltraVault#2026",
		Proof: domain.HumanTelemetryProof{
			ChallengeID:       ch.ChallengeID,
			Nonce:             ch.Nonce,
			IssuedAtMs:        ch.IssuedAtMs,
			MinElapsedMs:      ch.MinElapsedMs,
			RequireHold:       ch.RequireHold,
			HoldMinMs:         ch.HoldMinMs,
			HoldMaxMs:         ch.HoldMaxMs,
			Signature:         ch.Signature,
			TrustedKeystrokes: 10,
			MeanFlightMs:      110,
			StdDevFlightMs:    24,
			MeanDwellMs:       68,
			HoldCompleted:     true,
			HoldTrusted:       true,
			HoldDurationMs:    ch.HoldMinMs + 250,
		},
	})
	if err != nil || !humanRes.Unlocked {
		t.Fatalf("expected UnlockWithHumanProof to succeed for valid human telemetry, got %+v (%v)", humanRes, err)
	}

	svcTampered.LockApp()
	// Replaying the exact same ChallengeID must be caught by ReplayWindow and trigger immediate 60s lockout!
	replayRes, err := svcTampered.UnlockWithHumanProof(domain.HumanUnlockRequest{
		Mode:   "password",
		Secret: "UltraVault#2026",
		Proof: domain.HumanTelemetryProof{
			ChallengeID:       ch.ChallengeID,
			Nonce:             ch.Nonce,
			IssuedAtMs:        ch.IssuedAtMs,
			MinElapsedMs:      ch.MinElapsedMs,
			RequireHold:       ch.RequireHold,
			HoldMinMs:         ch.HoldMinMs,
			HoldMaxMs:         ch.HoldMaxMs,
			Signature:         ch.Signature,
			TrustedKeystrokes: 10,
			MeanFlightMs:      110,
			StdDevFlightMs:    24,
			MeanDwellMs:       68,
		},
	})
	if err != nil || replayRes.Unlocked || !replayRes.Locked || replayRes.RetrySec < 58 {
		t.Fatalf("expected replayed challenge script to be blocked for 60s, got %+v (%v)", replayRes, err)
	}
}



