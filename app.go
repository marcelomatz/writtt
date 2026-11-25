package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	wailsapp "github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"writtt/internal/adapters"
	"writtt/internal/application"
	"writtt/internal/domain"
)

var CurrentVersion = "0.2.0"

// App is the thin Layer 4 Wails v3 & HTTP presentation facade for Writtt Studio & Zero-Knowledge Vault.
// All business rules reside in internal/domain, orchestration in internal/application, and I/O in internal/adapters.
type App struct {
	ctx           context.Context
	svc           *application.WritttService
	searchIdx     *adapters.SQLiteSearchIndex
	emit          func(name string, data any)
	wailsApp      *wailsapp.App
	mainWin       wailsapp.Window
	aiWin         wailsapp.Window
	aiBridgeMu    sync.RWMutex
	aiBridgeDocID string
}

func NewApp() *App {
	return &App{
		svc: application.NewWritttService(adapters.NewOSCommandRunner(), ""),
	}
}

func (a *App) SetWailsRuntime(app *wailsapp.App, win wailsapp.Window) {
	a.wailsApp = app
	a.mainWin = win
}

func (a *App) SetEventEmitter(emit func(name string, data any)) {
	a.emit = emit
}

func (a *App) emitEvent(name string, data any) {
	if a.emit != nil {
		a.emit(name, data)
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx

	idx, err := adapters.NewSQLiteSearchIndex(a.svc.DataDir())
	if err != nil {
		log.Printf("SQLite search index unavailable: %v", err)
	} else {
		a.searchIdx = idx
		a.syncAllIndex()
	}

	_, _ = a.svc.EnsureRSAKeyPair()

	if err := adapters.StartDirectoryWatcher(ctx, a.svc.DataDir(), func(id string) {
		a.syncDocIndex(id)
		a.emitEvent("file-updated", id)
	}); err != nil {
		log.Printf("Directory watcher unavailable: %v", err)
	}
}

func (a *App) Shutdown() {
	if a.svc != nil {
		a.svc.Shutdown()
	}
	if a.searchIdx != nil {
		_ = a.searchIdx.Close()
	}
}

func (a *App) AttachHTTPRoutes(mux *http.ServeMux) {
	attachDir := filepath.Join(a.svc.DataDir(), "attachments")
	adapters.NewHTTPRPCGateway(
		a,
		attachDir,
		"UnlockApp",
		"UnlockVault",
		"UnlockVaultWithPIN",
	).AttachRoutes(mux)
}

func (a *App) syncDocIndex(id string) {
	if a.searchIdx == nil || strings.TrimSpace(id) == "" {
		return
	}
	if doc, err := a.svc.ReadDocument(id); err == nil && doc != nil {
		_ = a.searchIdx.SyncDocument(*doc)
	}
}

func (a *App) syncAllIndex() {
	if a.searchIdx == nil {
		return
	}
	summaries, err := a.svc.ListDocuments("all", 1000)
	if err != nil {
		return
	}
	docs := make([]domain.Document, 0, len(summaries))
	for _, item := range summaries {
		if doc, readErr := a.svc.ReadDocument(item.ID); readErr == nil && doc != nil {
			docs = append(docs, *doc)
		}
	}
	_ = a.searchIdx.SyncAll(docs)
}

// ── Window Shell & Anonymous Release Update Notification ──────────────────

func (a *App) SetWindowTitle(title string) {
	if a.mainWin != nil && strings.TrimSpace(title) != "" {
		a.mainWin.SetTitle(title)
	}
}

func (a *App) GetVersion() string {
	return CurrentVersion
}

// CheckForUpdates checks whether a newer release of Writtt is available for download.
func (a *App) CheckForUpdates() domain.ReleaseUpdateDTO {
	return a.svc.CheckForUpdates(CurrentVersion)
}

// OpenDetachedAIWindow spawns or focuses an independent native OS Wails v3 window for the AI & RAG Studio
// so the author can drag it freely anywhere on the desktop, including a second physical monitor.
func (a *App) OpenDetachedAIWindow() bool {
	if a.wailsApp == nil {
		return false
	}
	a.aiBridgeMu.Lock()
	defer a.aiBridgeMu.Unlock()

	if a.aiWin != nil {
		a.aiWin.Show()
		a.aiWin.Focus()
		return true
	}

	win := a.wailsApp.Window.NewWithOptions(wailsapp.WebviewWindowOptions{
		Title:            "Writtt - Estudio IA & RAG",
		Width:            520,
		Height:           800,
		MinWidth:         380,
		MinHeight:        500,
		Frameless:        true,
		BackgroundColour: wailsapp.NewRGBA(9, 9, 11, 255),
		Windows: wailsapp.WindowsWindow{
			NonClientRegionSupport: true,
		},
		URL: "/?window=ai-studio",
	})
	win.OnWindowEvent(events.Common.WindowClosing, func(_ *wailsapp.WindowEvent) {
		a.aiBridgeMu.Lock()
		a.aiWin = nil
		a.aiBridgeMu.Unlock()
		a.emitEvent("ai-studio:os-window-closed", "")
	})
	a.aiWin = win
	return true
}

// CloseDetachedAIWindow hides/closes the detached OS AI window and optionally re-docks it in the main window.
func (a *App) CloseDetachedAIWindow(redockInMain bool) {
	a.aiBridgeMu.Lock()
	win := a.aiWin
	if win != nil {
		win.Hide()
	}
	a.aiBridgeMu.Unlock()
	if redockInMain {
		a.emitEvent("ai-studio:redock-main", "")
		if a.mainWin != nil {
			a.mainWin.Focus()
		}
	}
}

// SetDetachedAIAlwaysOnTop pins or unpins the detached AI Studio window above other desktop windows.
func (a *App) SetDetachedAIAlwaysOnTop(pinned bool) {
	a.aiBridgeMu.RLock()
	win := a.aiWin
	a.aiBridgeMu.RUnlock()
	if win != nil {
		win.SetAlwaysOnTop(pinned)
	}
}

// SetActiveEditorBridgeDoc synchronizes the active manuscript ID from the main studio window to any detached AI window.
func (a *App) SetActiveEditorBridgeDoc(docID string) {
	a.aiBridgeMu.Lock()
	a.aiBridgeDocID = strings.TrimSpace(docID)
	a.aiBridgeMu.Unlock()
	a.emitEvent("ai-studio:active-doc-changed", strings.TrimSpace(docID))
}

// GetActiveEditorBridgeDoc returns the manuscript ID currently active in the main studio window.
func (a *App) GetActiveEditorBridgeDoc() string {
	a.aiBridgeMu.RLock()
	defer a.aiBridgeMu.RUnlock()
	return a.aiBridgeDocID
}

// InsertFromDetachedAIWindow broadcasts an insertable AI passage from the second-monitor window into the main editor.
func (a *App) InsertFromDetachedAIWindow(text string) {
	if strings.TrimSpace(text) == "" {
		return
	}
	a.emitEvent("ai-studio:remote-insert", text)
	if a.mainWin != nil {
		a.mainWin.Focus()
	}
}

// ── Document Studio CRUD, Hierarchy & Split-Screen ─────────────────────────

func (a *App) SaveDocument(doc domain.Document) (string, error) {
	id, err := a.svc.SaveDocument(doc)
	if err == nil {
		a.syncDocIndex(id)
	}
	return id, err
}

func (a *App) AutoSaveDocument(doc domain.Document) (string, error) {
	id, err := a.svc.AutoSaveDocument(doc)
	if err == nil {
		a.syncDocIndex(id)
	}
	return id, err
}

func (a *App) ImportDocumentContent(filename, content string, isVault bool) (string, error) {
	id, err := a.svc.ImportDocumentContent(filename, content, isVault)
	if err == nil {
		a.syncDocIndex(id)
	}
	return id, err
}

func (a *App) GenerateAuthorshipProof(docID string) (*domain.AuthorshipProofDTO, error) {
	return a.svc.GenerateAuthorshipProof(docID)
}

func (a *App) ReadDocument(id string) (*domain.Document, error) {
	return a.svc.ReadDocument(id)
}

func (a *App) DeleteDocument(id string) error {
	if err := a.svc.DeleteDocument(id); err != nil {
		return err
	}
	if a.searchIdx != nil {
		_ = a.searchIdx.DeleteDocument(id)
	}
	return nil
}

func (a *App) UpdateMetadata(id string, tags []string, isVault bool) error {
	if err := a.svc.UpdateMetadata(id, tags, isVault); err != nil {
		return err
	}
	a.syncDocIndex(id)
	return nil
}

func (a *App) RenameDocument(id string, newTitle string) error {
	if err := a.svc.RenameDocument(id, newTitle); err != nil {
		return err
	}
	a.syncDocIndex(id)
	return nil
}

func (a *App) MoveDocument(id string, parentID string, sortOrder int) error {
	if err := a.svc.MoveDocument(id, parentID, sortOrder); err != nil {
		return err
	}
	a.syncDocIndex(id)
	return nil
}

func (a *App) ReorderDocuments(parentID string, orderedIDs []string) error {
	return a.svc.ReorderDocuments(parentID, orderedIDs)
}

func (a *App) GetDocumentBreadcrumbs(id string) ([]domain.BreadcrumbItem, error) {
	return a.svc.GetDocumentBreadcrumbs(id)
}

func (a *App) ListDocuments(filter string, limit int) ([]domain.SearchResult, error) {
	return a.svc.ListDocuments(filter, limit)
}

func (a *App) Search(query string) ([]domain.SearchResult, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" || a.searchIdx == nil {
		return a.svc.Search(query)
	}

	cleanTagQuery := strings.TrimPrefix(trimmed, "#")
	ftsResults, ftsErr := a.searchIdx.Search(cleanTagQuery, 50)
	svcResults, svcErr := a.svc.Search(cleanTagQuery)
	if ftsErr != nil && svcErr != nil {
		return nil, svcErr
	}

	stripHighlights := func(s string) string {
		s = strings.ReplaceAll(s, "<b>", "")
		s = strings.ReplaceAll(s, "</b>", "")
		return strings.TrimSpace(s)
	}

	merged := make([]domain.SearchResult, 0, len(ftsResults)+len(svcResults))
	seen := make(map[string]bool, len(ftsResults)+len(svcResults))

	// Primary: SQLite FTS5 ranked full-text results (strictly excludes Vault body plaintext)
	for _, item := range ftsResults {
		if item.ID == "" || seen[item.ID] {
			continue
		}
		// If a Vault document matched by title while locked, hide any snippet leak
		if item.IsVault && !a.svc.IsVaultUnlocked() {
			item.Snippet = "[Cofre E2EE Selado - AES-256-GCM]"
		} else {
			item.Snippet = stripHighlights(item.Snippet)
		}
		seen[item.ID] = true
		merged = append(merged, item)
	}

	// Secondary: tag matches and decrypted in-memory Vault matches when Vault is unlocked
	for _, item := range svcResults {
		if item.ID == "" || seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		merged = append(merged, item)
	}

	return merged, nil
}

func (a *App) CreateSplitDoc(parentID string, title string) (domain.SplitDocResult, error) {
	res, err := a.svc.CreateSplitDoc(parentID, title)
	if err == nil && res.SplitID != "" {
		a.syncDocIndex(res.SplitID)
	}
	return res, err
}

func (a *App) CreateSubChapter(parentID string, title string) (*domain.Document, error) {
	doc, err := a.svc.CreateSubChapter(parentID, title)
	if err == nil && doc != nil {
		a.syncDocIndex(doc.Frontmatter.ID)
	}
	return doc, err
}

func (a *App) AppendSubChapterToParent(subChapterID string) (*domain.Document, error) {
	doc, err := a.svc.AppendSubChapterToParent(subChapterID)
	if err == nil && doc != nil {
		a.syncDocIndex(doc.Frontmatter.ID)
	}
	return doc, err
}

func (a *App) DuplicateDocument(sourceID string, newTitle string) (*domain.Document, error) {
	doc, err := a.svc.DuplicateDocument(sourceID, newTitle)
	if err == nil && doc != nil {
		a.syncDocIndex(doc.Frontmatter.ID)
	}
	return doc, err
}

func (a *App) ListChildren(parentID string) ([]domain.SearchResult, error) {
	return a.svc.ListChildren(parentID)
}

func (a *App) MergeToParent(parentID string, mergedContent string) error {
	err := a.svc.MergeToParent(parentID, mergedContent)
	if err == nil {
		a.syncDocIndex(parentID)
	}
	return err
}

func (a *App) SaveAttachment(filename string, base64Data string) (string, error) {
	return a.svc.SaveAttachment(filename, base64Data)
}

// ── Version History, Diff & Editorial Analysis ─────────────────────────────

func (a *App) ListDocumentVersions(docID string) ([]domain.DocumentVersion, error) {
	return a.svc.ListDocumentVersions(docID)
}

func (a *App) RestoreDocumentVersion(docID string, version int) (*domain.Document, error) {
	doc, err := a.svc.RestoreDocumentVersion(docID, version)
	if err == nil {
		a.syncDocIndex(docID)
	}
	return doc, err
}

func (a *App) DiffDocumentVersions(docID string, fromVersion int, toVersion int) (domain.VersionDiffReport, error) {
	return a.svc.DiffDocumentVersions(docID, fromVersion, toVersion)
}

func (a *App) AnalyzeDocumentContent(content string) map[string]any {
	chapters, stats := domain.ExtractChaptersAndStats(content)
	return map[string]any{
		"stats":    stats,
		"chapters": chapters,
	}
}

// ── Security Config, Argon2id Master Password, PIN, Recovery Key & TOTP ────

func (a *App) GetSecurityConfig() (*domain.SecurityConfigDTO, error) {
	return a.svc.GetSecurityConfig()
}

func (a *App) SetPassword(currentPassword, newPassword string) error {
	err := a.svc.SetPassword(currentPassword, newPassword)
	if err == nil {
		a.syncAllIndex()
	}
	return err
}

func (a *App) RemovePassword(currentPassword string) error {
	err := a.svc.RemovePassword(currentPassword)
	if err == nil {
		a.syncAllIndex()
	}
	return err
}

func (a *App) UnlockVault(password string) bool {
	return a.svc.UnlockVault(password)
}

func (a *App) UnlockApp(password string) bool {
	return a.svc.UnlockApp(password)
}

func (a *App) BeginAuthChallenge() domain.AuthChallengeDTO {
	return a.svc.BeginAuthChallenge()
}

func (a *App) UnlockWithHumanProof(req domain.HumanUnlockRequest) (*domain.HumanUnlockResult, error) {
	return a.svc.UnlockWithHumanProof(req)
}

func (a *App) LockVault() {
	a.svc.LockVault()
}

func (a *App) LockApp() {
	a.svc.LockApp()
	a.emitEvent("app-locked", "")
}

func (a *App) IsVaultUnlocked() bool {
	return a.svc.IsVaultUnlocked()
}

func (a *App) SetVaultPIN(currentPassword, pin string) error {
	return a.svc.SetVaultPIN(currentPassword, pin)
}

func (a *App) RemoveVaultPIN(currentPassword string) error {
	return a.svc.RemoveVaultPIN(currentPassword)
}

func (a *App) UnlockVaultWithPIN(pin string) bool {
	return a.svc.UnlockVaultWithPIN(pin)
}

func (a *App) GenerateRecoveryKey(currentPassword string) (string, error) {
	return a.svc.GenerateRecoveryKey(currentPassword)
}

func (a *App) RecoverVaultWithKey(recoveryKeyFormatted, newPassword string) error {
	err := a.svc.RecoverVaultWithKey(recoveryKeyFormatted, newPassword)
	if err == nil {
		a.syncAllIndex()
	}
	return err
}

func (a *App) SetupVaultTOTP(currentPassword string) (*domain.TOTPEnrollmentBundle, error) {
	return a.svc.SetupVaultTOTP(currentPassword)
}

func (a *App) EnableVaultTOTP(currentPassword, code string) error {
	return a.svc.EnableVaultTOTP(currentPassword, code)
}

func (a *App) VerifyVaultTOTP(code string) (bool, error) {
	return a.svc.VerifyVaultTOTP(code)
}

func (a *App) DisableVaultTOTP(currentPassword string) error {
	return a.svc.DisableVaultTOTP(currentPassword)
}

// ── Writtt Express, E2EE Drive Vault & Export Bundles ──────────────────────

func (a *App) SendExpressEnvelope(senderAlias, subject, body, recipientPubKeyPEM string) (*domain.ExpressMessageDTO, error) {
	return a.svc.SendExpressEnvelope(senderAlias, subject, body, recipientPubKeyPEM)
}

func (a *App) ListExpressInbox() ([]domain.ExpressMessageDTO, error) {
	return a.svc.ListExpressInbox()
}

func (a *App) UnsealExpressMessage(id string) (*domain.ExpressMessageDTO, error) {
	return a.svc.UnsealExpressMessage(id)
}

func (a *App) DeleteExpressMessage(id string) error {
	return a.svc.DeleteExpressMessage(id)
}

func (a *App) UploadDriveVaultFile(filename, mimeType, base64Data string) (*domain.DriveVaultFile, error) {
	return a.svc.UploadDriveVaultFile(filename, mimeType, base64Data)
}

func (a *App) ListDriveVaultFiles() ([]domain.DriveVaultFile, error) {
	return a.svc.ListDriveVaultFiles()
}

func (a *App) DecryptDriveVaultFile(id string) (string, error) {
	return a.svc.DecryptDriveVaultFile(id)
}

func (a *App) DecryptDriveVaultFileBase64(id string) (string, error) {
	return a.svc.DecryptDriveVaultFileBase64(id)
}

func (a *App) DeleteDriveVaultFile(id string) error {
	return a.svc.DeleteDriveVaultFile(id)
}

func (a *App) ExportWritttPack(packName, passphrase string) (*domain.ExportBundleResult, error) {
	return a.svc.ExportWritttPack(packName, passphrase)
}

func (a *App) ImportWritttPack(base64Pack string, passphrase string) (int, error) {
	count, err := a.svc.ImportWritttPack(base64Pack, passphrase)
	if err == nil && count > 0 {
		a.syncAllIndex()
	}
	return count, err
}

func (a *App) ExportDocumentArtifact(docID string, format string) (*domain.ExportBundleResult, error) {
	return a.svc.ExportDocumentArtifact(docID, format)
}

// ── Wails v3 Native OS File Dialog Bridges ─────────────────────────────────

func (a *App) promptSaveDialog(defaultFilename, filterName, filterPattern string) (string, error) {
	if a.wailsApp == nil {
		return "", fmt.Errorf("native file dialog unavailable")
	}
	dlg := a.wailsApp.Dialog.SaveFile().
		SetFilename(defaultFilename).
		AddFilter(filterName, filterPattern)
	if a.mainWin != nil {
		dlg.AttachToWindow(a.mainWin)
	}
	return dlg.PromptForSingleSelection()
}

func (a *App) promptOpenDialog(title, filterName, filterPattern string) (string, error) {
	if a.wailsApp == nil {
		return "", fmt.Errorf("native file dialog unavailable")
	}
	dlg := a.wailsApp.Dialog.OpenFile().
		SetTitle(title).
		AddFilter(filterName, filterPattern)
	if a.mainWin != nil {
		dlg.AttachToWindow(a.mainWin)
	}
	return dlg.PromptForSingleSelection()
}

func (a *App) SaveExportArtifactDialog(docID string, format string) (string, error) {
	res, err := a.svc.ExportDocumentArtifact(docID, format)
	if err != nil {
		return "", err
	}
	if a.wailsApp == nil {
		return res.SavedPath, nil
	}
	filterName, filterPattern := "Markdown (*.md)", "*.md"
	switch strings.ToLower(format) {
	case "epub":
		filterName, filterPattern = "EPUB 3.0 E-Book (*.epub)", "*.epub"
	case "html":
		filterName, filterPattern = "HTML5 Document (*.html)", "*.html"
	}
	targetPath, err := a.promptSaveDialog(res.Filename, filterName, filterPattern)
	if err != nil || strings.TrimSpace(targetPath) == "" {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(res.Base64Data)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(targetPath, raw, 0600); err != nil {
		return "", err
	}
	return targetPath, nil
}

func (a *App) ExportWritttPackDialog(packName, passphrase string) (string, error) {
	res, err := a.svc.ExportWritttPack(packName, passphrase)
	if err != nil {
		return "", err
	}
	if a.wailsApp == nil {
		return res.SavedPath, nil
	}
	targetPath, err := a.promptSaveDialog(res.Filename, "Writtt Encrypted Archive (*.writttpack)", "*.writttpack")
	if err != nil || strings.TrimSpace(targetPath) == "" {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(res.Base64Data)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(targetPath, raw, 0600); err != nil {
		return "", err
	}
	return targetPath, nil
}

func (a *App) ImportWritttPackDialog(passphrase string) (int, error) {
	srcPath, err := a.promptOpenDialog("Import .writttpack Encrypted Archive", "Writtt Encrypted Archive (*.writttpack)", "*.writttpack")
	if err != nil || strings.TrimSpace(srcPath) == "" {
		return 0, err
	}
	raw, err := os.ReadFile(srcPath)
	if err != nil {
		return 0, err
	}
	b64 := base64.StdEncoding.EncodeToString(raw)
	return a.ImportWritttPack(b64, passphrase)
}

func (a *App) ImportDocumentDialog(isVault bool) (string, error) {
	srcPath, err := a.promptOpenDialog("Import Manuscript (.md / .txt)", "Markdown & Text (*.md;*.txt)", "*.md;*.txt")
	if err != nil || strings.TrimSpace(srcPath) == "" {
		return "", err
	}
	raw, err := os.ReadFile(srcPath)
	if err != nil {
		return "", err
	}
	return a.ImportDocumentContent(filepath.Base(srcPath), string(raw), isVault)
}

func (a *App) UploadDriveFileDialog() (*domain.DriveVaultFile, error) {
	srcPath, err := a.promptOpenDialog("Seal File into E2EE Drive Vault", "All Files (*.*)", "*.*")
	if err != nil || strings.TrimSpace(srcPath) == "" {
		return nil, err
	}
	raw, err := os.ReadFile(srcPath)
	if err != nil {
		return nil, err
	}
	mimeType := mime.TypeByExtension(filepath.Ext(srcPath))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	b64 := base64.StdEncoding.EncodeToString(raw)
	return a.svc.UploadDriveVaultFile(filepath.Base(srcPath), mimeType, b64)
}

func (a *App) SaveDecryptedDriveFileDialog(id string) (string, error) {
	b64, err := a.svc.DecryptDriveVaultFileBase64(id)
	if err != nil {
		return "", err
	}
	files, _ := a.svc.ListDriveVaultFiles()
	defaultName := "decrypted.bin"
	for _, f := range files {
		if f.ID == id {
			defaultName = f.Filename
			break
		}
	}
	targetPath, err := a.promptSaveDialog(defaultName, "All Files (*.*)", "*.*")
	if err != nil || strings.TrimSpace(targetPath) == "" {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(targetPath, raw, 0600); err != nil {
		return "", err
	}
	return targetPath, nil
}

// ── Custom Dictionary, Local AI Assistant, ZKP & COE Algorithms Lab ────────

func (a *App) GetCustomDictionary() ([]string, error) {
	return a.svc.GetCustomDictionary()
}

func (a *App) AddDictionaryWord(word string) ([]string, error) {
	return a.svc.AddDictionaryWord(word)
}

func (a *App) RemoveDictionaryWord(word string) ([]string, error) {
	return a.svc.RemoveDictionaryWord(word)
}

func (a *App) ScanLocalAI() bool {
	return a.svc.ScanLocalAI()
}

func (a *App) GetLocalModels() ([]string, error) {
	return a.svc.GetLocalModels()
}

func (a *App) GetLocalModelCapabilities() ([]domain.AIModelCapabilityDTO, error) {
	return a.svc.GetLocalModelCapabilities()
}

func (a *App) AskAssistant(model, prompt, contextStr string) (string, error) {
	return a.svc.AskAssistant(model, prompt, contextStr)
}

func (a *App) ChatWithAssistant(model string, history []domain.AIChatMessage, docContext string, selectedExcerpt string, useRAG bool) (*domain.AIChatReplyDTO, error) {
	return a.svc.ChatWithAssistant(model, history, docContext, selectedExcerpt, useRAG)
}

func (a *App) FreeChatWithAssistant(model string, history []domain.AIChatMessage, includeDocContext bool, docContext string, useRAG bool) (*domain.AIChatReplyDTO, error) {
	return a.svc.FreeChatWithAssistant(model, history, includeDocContext, docContext, useRAG)
}

func (a *App) SearchWorkspaceRAG(query string, topK int) ([]domain.RAGSearchResult, error) {
	return a.svc.SearchWorkspaceRAG(query, topK)
}

func (a *App) ListTrustedDevices() ([]domain.TrustedDeviceDTO, error) {
	return a.svc.ListTrustedDevices()
}

func (a *App) RegisterTrustedDevice(label string) (*domain.TrustedDeviceDTO, error) {
	return a.svc.RegisterTrustedDevice(label)
}

func (a *App) RevokeTrustedDevice(id string) ([]domain.TrustedDeviceDTO, error) {
	return a.svc.RevokeTrustedDevice(id)
}

func (a *App) GetOperatorAlias() (domain.AliasConfigDTO, error) {
	return a.svc.GetOperatorAlias()
}

func (a *App) SetOperatorAlias(alias string) (domain.AliasConfigDTO, error) {
	return a.svc.SetOperatorAlias(alias)
}

func (a *App) SimulateZKPRound(round int, challengePath string) domain.ZKPSoundnessProof {
	return a.svc.SimulateZKPRound(round, challengePath)
}

func (a *App) GetAlgorithmsLabReport() domain.WritttAlgorithmsReport {
	return a.svc.BuildAlgorithmsReport()
}
