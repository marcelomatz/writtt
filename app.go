package main

import (
	"context"
	"fmt"
	"log"

	"writtt/backend/models"
	"writtt/backend/network"
	"writtt/backend/storage"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize SQLite and Index
	if err := storage.InitDB(); err != nil {
		log.Printf("Failed to init DB: %v", err)
	}
	if err := storage.SyncIndex(); err != nil {
		log.Printf("Failed to sync index: %v", err)
	}

	// Start File Watcher
	go storage.StartWatcher(ctx, func(id string) {
		runtime.EventsEmit(ctx, "file-updated", id)
	})
}

const (
	MaxFreeDocuments = 20
	MaxFreeVault     = 3
)

// SaveDocument saves a document via the Wails bridge
func (a *App) SaveDocument(doc models.Document) (string, error) {
	// Check limits for NEW documents
	if doc.Frontmatter.ID == "" {
		count, _ := storage.GetDocumentCount(false)
		if count >= MaxFreeDocuments {
			return "", fmt.Errorf("limite de documentos do plano gratuito atingido (%d)", MaxFreeDocuments)
		}
	}

	// Check Vault limit
	if doc.Frontmatter.IsVault {
		count, _ := storage.GetDocumentCount(true)
		if count >= MaxFreeVault {
			// If it's already in vault (updating), allow it.
			// If it's moving TO vault, check limit.
			existing, err := storage.ReadDisk(doc.Frontmatter.ID)
			if err != nil || !existing.Frontmatter.IsVault {
				return "", fmt.Errorf("limite do cofre gratuito atingido (%d)", MaxFreeVault)
			}
		}
	}

	log.Printf("Saving document: ID=%s, Title=%s\n", doc.Frontmatter.ID, doc.Frontmatter.Title)
	id, err := storage.WriteDisk(doc)
	if err != nil {
		log.Printf("Error saving document: %v\n", err)
		return "", err
	}
	storage.SyncSingleFile(id)
	return id, nil
}

// UpdateMetadata allows updating tags and vault status without full save
func (a *App) UpdateMetadata(id string, tags []string, isVault bool) error {
	doc, err := storage.ReadDisk(id)
	if err != nil {
		return err
	}
	doc.Frontmatter.Tags = tags
	doc.Frontmatter.IsVault = isVault
	_, err = storage.WriteDisk(*doc)
	if err == nil {
		storage.SyncSingleFile(id)
	}
	return err
}

// RenameDocument updates only the title
func (a *App) RenameDocument(id string, newTitle string) error {
	doc, err := storage.ReadDisk(id)
	if err != nil {
		return err
	}
	doc.Frontmatter.Title = newTitle
	_, err = storage.WriteDisk(*doc)
	if err == nil {
		storage.SyncSingleFile(id)
	}
	return err
}

// DeleteDocument completely removes a document
func (a *App) DeleteDocument(id string) error {
	return storage.DeleteDocument(id)
}

// ReadDocument loads a document by ID
func (a *App) ReadDocument(id string) (*models.Document, error) {
	return storage.ReadDisk(id)
}

// Search performs full text search
func (a *App) Search(query string) ([]models.SearchResult, error) {
	return storage.Search(query)
}

// ListDocuments returns documents based on a filter string
func (a *App) ListDocuments(filter string, limit int) ([]models.SearchResult, error) {
	return storage.ListDocuments(filter, limit)
}

// SplitDocResult is returned by CreateSplitDoc.
// Using a struct ensures Wails maps both fields to the TypeScript layer
// (Wails only serialises the first non-error value from a multi-return func).
type SplitDocResult struct {
	SplitID         string `json:"split_id"`
	OriginalContent string `json:"original_content"`
}

// CreateSplitDoc creates a child document linked to a parent,
// copying the parent's current content into the new split document.
// The new document gets doc_type="split" and parent_id=parentID.
// Returns a SplitDocResult with the new split doc ID and the parent's content
// so the frontend can initialise the diff baseline correctly.
func (a *App) CreateSplitDoc(parentID string, title string) (SplitDocResult, error) {
	parent, err := storage.ReadDisk(parentID)
	if err != nil {
		return SplitDocResult{}, fmt.Errorf("reading parent doc: %w", err)
	}

	splitDoc := models.Document{
		Frontmatter: models.Frontmatter{
			Title:    title,
			ParentID: parentID,
			DocType:  "split",
		},
		Content: parent.Content, // start as an exact copy of the original
	}
	id, err := storage.WriteDisk(splitDoc)
	if err != nil {
		return SplitDocResult{}, err
	}
	storage.SyncSingleFile(id)
	return SplitDocResult{SplitID: id, OriginalContent: parent.Content}, nil
}

// ListChildren returns sub-documents linked to a given parent ID.
func (a *App) ListChildren(parentID string) ([]models.SearchResult, error) {
	return storage.ListChildren(parentID)
}

// MergeToParent overwrites a parent document's content with the merged result.
func (a *App) MergeToParent(parentID string, mergedContent string) error {
	doc, err := storage.ReadDisk(parentID)
	if err != nil {
		return err
	}
	doc.Content = mergedContent
	_, err = storage.WriteDisk(*doc)
	if err == nil {
		storage.SyncSingleFile(parentID)
	}
	return err
}

// ScanLocalAI checks if a local LLM is alive
func (a *App) ScanLocalAI() bool {
	return network.ScanLocalAI()
}

// SaveAttachment saves a base64 encoded file to disk and returns the relative URL
func (a *App) SaveAttachment(filename string, base64Data string) (string, error) {
	return storage.SaveAttachment(filename, base64Data)
}

// ─── Security / Vault Methods ─────────────────────────────────────────────────

// GetSecurityConfig returns the current security configuration (safe, no hashes).
func (a *App) GetSecurityConfig() (*storage.SecurityConfigDTO, error) {
	cfg, err := storage.LoadSecurityConfig()
	if err != nil {
		return nil, err
	}
	return &storage.SecurityConfigDTO{
		PasswordEnabled: cfg.PasswordEnabled,
		VaultPINEnabled: cfg.VaultPINEnabled,
	}, nil
}

// SetVaultPIN defines or changes the vault PIN.
// Requires the current app password for authorization.
// The PIN is hashed with Argon2id and stored separately from the app password.
func (a *App) SetVaultPIN(currentPassword, pin string) error {
	if pin == "" {
		return fmt.Errorf("o PIN não pode estar vazio")
	}

	cfg, err := storage.LoadSecurityConfig()
	if err != nil {
		return err
	}

	// Require the app password to authorize PIN changes
	if cfg.PasswordEnabled && cfg.PasswordHash != "" {
		if !storage.VerifyPassword(currentPassword, cfg.PasswordHash) {
			return fmt.Errorf("senha incorreta")
		}
	}

	hash, err := storage.HashPassword(pin)
	if err != nil {
		return fmt.Errorf("hashing PIN: %w", err)
	}

	cfg.VaultPINEnabled = true
	cfg.VaultPINHash = hash
	return storage.SaveSecurityConfig(cfg)
}

// RemoveVaultPIN disables the vault PIN.
// Requires the current app password for authorization.
func (a *App) RemoveVaultPIN(currentPassword string) error {
	cfg, err := storage.LoadSecurityConfig()
	if err != nil {
		return err
	}

	if !cfg.VaultPINEnabled {
		return nil // already disabled
	}

	// Require the app password to authorize PIN removal
	if cfg.PasswordEnabled && cfg.PasswordHash != "" {
		if !storage.VerifyPassword(currentPassword, cfg.PasswordHash) {
			return fmt.Errorf("senha incorreta")
		}
	}

	cfg.VaultPINEnabled = false
	cfg.VaultPINHash = ""
	return storage.SaveSecurityConfig(cfg)
}

// UnlockVaultWithPIN verifies the PIN and unlocks the vault (stores decryption key in memory).
// The vault encryption key is the app password; the PIN is just a gate to load that key from memory/config.
// NOTE: The vault decryption key is the app password. The PIN only gates access to it in-session.
func (a *App) UnlockVaultWithPIN(pin string) bool {
	// L-3: enforce brute-force lockout.
	if err := storage.CheckBruteForce(); err != nil {
		log.Printf("UnlockVaultWithPIN blocked: %v", err)
		return false
	}

	cfg, err := storage.LoadSecurityConfig()
	if err != nil || !cfg.VaultPINEnabled || cfg.VaultPINHash == "" {
		return false
	}

	if !storage.VerifyPassword(pin, cfg.VaultPINHash) {
		storage.RecordAuthFailure()
		return false
	}

	storage.RecordAuthSuccess()
	// PIN verified — re-activate the vault key stored at startup.
	storage.RestoreVaultKey()
	return storage.IsVaultUnlocked()
}

// SetPassword enables or changes the app password.
// If a password was previously set, currentPassword must be provided and correct.
// All vault documents will be re-encrypted with the new password.
func (a *App) SetPassword(currentPassword, newPassword string) error {
	if newPassword == "" {
		return fmt.Errorf("a nova senha não pode estar vazia")
	}

	cfg, err := storage.LoadSecurityConfig()
	if err != nil {
		return err
	}

	// If password was already enabled, verify current before allowing change
	if cfg.PasswordEnabled && cfg.PasswordHash != "" {
		if !storage.VerifyPassword(currentPassword, cfg.PasswordHash) {
			return fmt.Errorf("senha atual incorreta")
		}
	}

	// Re-encrypt vault documents (old → new password)
	oldPassword := ""
	if cfg.PasswordEnabled {
		oldPassword = currentPassword
	}
	if err := storage.ReEncryptAllVaultDocs(oldPassword, newPassword); err != nil {
		log.Printf("SetPassword: re-encryption error: %v", err)
	}

	hash, err := storage.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	cfg.PasswordEnabled = true
	cfg.PasswordHash = hash
	if err := storage.SaveSecurityConfig(cfg); err != nil {
		return err
	}

	// Unlock immediately so the user doesn't have to re-enter
	storage.SetActivePassword(newPassword)
	return nil
}

// RemovePassword disables password protection.
// Requires the current password for verification.
// All vault documents will be decrypted to plaintext.
func (a *App) RemovePassword(currentPassword string) error {
	cfg, err := storage.LoadSecurityConfig()
	if err != nil {
		return err
	}

	if !cfg.PasswordEnabled {
		return nil // already disabled
	}

	if !storage.VerifyPassword(currentPassword, cfg.PasswordHash) {
		return fmt.Errorf("senha incorreta")
	}

	// Decrypt all vault documents
	if err := storage.ReEncryptAllVaultDocs(currentPassword, ""); err != nil {
		log.Printf("RemovePassword: decryption error: %v", err)
	}

	cfg.PasswordEnabled = false
	cfg.PasswordHash = ""
	if err := storage.SaveSecurityConfig(cfg); err != nil {
		return err
	}

	storage.ClearActivePassword()
	storage.ClearVaultKey() // also wipe the stored key
	return nil
}

// UnlockVault verifies the password and stores it in memory, giving access to vault documents.
func (a *App) UnlockVault(password string) bool {
	// L-3: enforce brute-force lockout.
	if err := storage.CheckBruteForce(); err != nil {
		log.Printf("UnlockVault blocked: %v", err)
		return false
	}

	cfg, err := storage.LoadSecurityConfig()
	if err != nil || !cfg.PasswordEnabled {
		return false
	}

	if !storage.VerifyPassword(password, cfg.PasswordHash) {
		storage.RecordAuthFailure()
		return false
	}

	storage.RecordAuthSuccess()
	storage.SetActivePassword(password)
	storage.StoreVaultKey(password) // allow PIN restore later
	return true
}

// UnlockApp verifies the password and marks the app as open (startup gate).
// Also stores the vault key so PIN-based restore works mid-session.
func (a *App) UnlockApp(password string) bool {
	// L-3: enforce brute-force lockout on startup gate too.
	if err := storage.CheckBruteForce(); err != nil {
		log.Printf("UnlockApp blocked: %v", err)
		return false
	}

	cfg, err := storage.LoadSecurityConfig()
	if err != nil || !cfg.PasswordEnabled {
		return false
	}

	if !storage.VerifyPassword(password, cfg.PasswordHash) {
		storage.RecordAuthFailure()
		return false
	}

	storage.RecordAuthSuccess()
	storage.SetAppUnlocked(true)
	storage.StoreVaultKey(password) // stored for PIN-based vault re-unlock
	return true
}

// LockVault removes the active password from memory, locking vault documents.
func (a *App) LockVault() {
	storage.ClearActivePassword()
}

// LockApp locks the whole application: clears the vault key, revokes the
// app-unlocked flag, and emits "app-locked" so the frontend shows LockScreen.
func (a *App) LockApp() {
	storage.ClearActivePassword()
	storage.SetAppUnlocked(false)
	runtime.EventsEmit(a.ctx, "app-locked")
}

// IsVaultUnlocked returns whether the vault is currently accessible.
func (a *App) IsVaultUnlocked() bool {
	return storage.IsVaultUnlocked()
}
