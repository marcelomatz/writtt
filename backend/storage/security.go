package storage

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// SecurityConfig is persisted to ~/.writtt/security.json
type SecurityConfig struct {
	PasswordEnabled bool   `json:"password_enabled"`
	PasswordHash    string `json:"password_hash,omitempty"`
	VaultPINEnabled bool   `json:"vault_pin_enabled"`
	VaultPINHash    string `json:"vault_pin_hash,omitempty"`
}

// SecurityConfigDTO is safe to send to the frontend (no hashes).
type SecurityConfigDTO struct {
	PasswordEnabled bool `json:"password_enabled"`
	VaultPINEnabled bool `json:"vault_pin_enabled"`
}

var (
	// activePassword holds the vault decryption key when the Vault is unlocked.
	// H-2: stored as []byte so it can be zeroed on clear.
	activePassword   []byte
	activePasswordMu sync.RWMutex

	// storedVaultKey holds the app password for PIN-based restore.
	// H-2: stored as []byte so it can be zeroed on clear.
	storedVaultKey   []byte
	storedVaultKeyMu sync.RWMutex

	// appUnlocked tracks whether the user has passed the startup password gate.
	appUnlocked   bool
	appUnlockedMu sync.RWMutex

	// L-3: brute-force lockout state for vault unlock attempts.
	bfMu       sync.Mutex
	bfFailures int
	bfLockedUntil time.Time
)

// ── App-level gate ─────────────────────────────────────────────────────────

// SetAppUnlocked marks the app as open (startup gate passed).
func SetAppUnlocked(v bool) {
	appUnlockedMu.Lock()
	defer appUnlockedMu.Unlock()
	appUnlocked = v
}

// IsAppUnlocked returns true if the startup password gate has been passed.
func IsAppUnlocked() bool {
	appUnlockedMu.RLock()
	defer appUnlockedMu.RUnlock()
	return appUnlocked
}

// ── Config persistence ──────────────────────────────────────────────────────

func securityConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return filepath.Join(home, ".writtt", "security.json")
}

// LoadSecurityConfig reads the security config from disk.
func LoadSecurityConfig() (*SecurityConfig, error) {
	path := securityConfigPath()
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return &SecurityConfig{PasswordEnabled: false}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading security config: %w", err)
	}

	var cfg SecurityConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing security config: %w", err)
	}
	return &cfg, nil
}

// SaveSecurityConfig writes the security config to disk.
func SaveSecurityConfig(cfg *SecurityConfig) error {
	path := securityConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

// ── Brute-force lockout (L-3) ───────────────────────────────────────────────

// CheckBruteForce returns an error if the vault is currently locked out.
// Call before verifying a vault password/PIN attempt.
func CheckBruteForce() error {
	bfMu.Lock()
	defer bfMu.Unlock()
	if bfFailures >= 5 && time.Now().Before(bfLockedUntil) {
		remaining := time.Until(bfLockedUntil).Round(time.Second)
		return fmt.Errorf("too many failed attempts — try again in %s", remaining)
	}
	return nil
}

// RecordAuthFailure increments the failure counter and, on the 5th failure,
// sets a 30-second lockout window.
func RecordAuthFailure() {
	bfMu.Lock()
	defer bfMu.Unlock()
	bfFailures++
	log.Printf("auth failure #%d", bfFailures)
	if bfFailures >= 5 {
		bfLockedUntil = time.Now().Add(30 * time.Second)
		log.Printf("vault locked for 30 s after %d failures", bfFailures)
	}
}

// RecordAuthSuccess resets the failure counter on a successful authentication.
func RecordAuthSuccess() {
	bfMu.Lock()
	defer bfMu.Unlock()
	bfFailures = 0
	bfLockedUntil = time.Time{}
}

// ── Vault key (in-memory, zeroing) ─────────────────────────────────────────

// zeroBytes overwrites b with zeroes to reduce the key's lifetime in memory.
func zeroBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

// SetActivePassword stores the vault decryption key as bytes.
func SetActivePassword(password string) {
	activePasswordMu.Lock()
	defer activePasswordMu.Unlock()
	// Zeroize the old key before replacing.
	zeroBytes(activePassword)
	activePassword = []byte(password)
}

// GetActivePassword returns the vault decryption key string (empty if locked).
func GetActivePassword() string {
	activePasswordMu.RLock()
	defer activePasswordMu.RUnlock()
	return string(activePassword)
}

// ClearActivePassword zeroes and removes the vault key from memory.
func ClearActivePassword() {
	activePasswordMu.Lock()
	defer activePasswordMu.Unlock()
	zeroBytes(activePassword)
	activePassword = nil
}

// IsVaultUnlocked returns true if the vault decryption key is in memory.
func IsVaultUnlocked() bool {
	return GetActivePassword() != ""
}

// StoreVaultKey saves the app password bytes for PIN-based restore.
func StoreVaultKey(password string) {
	storedVaultKeyMu.Lock()
	defer storedVaultKeyMu.Unlock()
	zeroBytes(storedVaultKey)
	storedVaultKey = []byte(password)
}

// ClearVaultKey zeroes the stored vault key.
func ClearVaultKey() {
	storedVaultKeyMu.Lock()
	defer storedVaultKeyMu.Unlock()
	zeroBytes(storedVaultKey)
	storedVaultKey = nil
}

// RestoreVaultKey re-activates the stored vault key into activePassword.
// Called after a successful PIN verification.
func RestoreVaultKey() {
	storedVaultKeyMu.RLock()
	// H-2: copy the slice so the two halves are independent.
	keyCopy := make([]byte, len(storedVaultKey))
	copy(keyCopy, storedVaultKey)
	storedVaultKeyMu.RUnlock()

	if len(keyCopy) > 0 {
		SetActivePassword(string(keyCopy))
		zeroBytes(keyCopy) // zeroize our local copy too
	}
}

// ReEncryptAllVaultDocs re-encrypts all vault documents from oldPassword to newPassword.
func ReEncryptAllVaultDocs(oldPassword, newPassword string) error {
	dir := GetAppDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("reading data dir: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".md" {
			continue
		}

		id := entry.Name()[:len(entry.Name())-3]
		doc, err := ReadDiskRaw(id)
		if err != nil {
			log.Printf("ReEncrypt: skipping %s: %v", id, err)
			continue
		}

		if !doc.Frontmatter.IsVault {
			continue
		}

		content := doc.Content

		// Step 1: Decrypt with old password (if any)
		if oldPassword != "" && IsEncrypted(content) {
			plain, err := Decrypt(oldPassword, content)
			if err != nil {
				log.Printf("ReEncrypt: failed to decrypt %s: %v", id, err)
				continue
			}
			content = string(plain)
		}

		// Step 2: Encrypt with new password (if any)
		if newPassword != "" {
			encrypted, err := Encrypt(newPassword, []byte(content))
			if err != nil {
				log.Printf("ReEncrypt: failed to encrypt %s: %v", id, err)
				continue
			}
			content = encrypted
		}

		// Step 3: Write back raw (bypassing encrypt logic to avoid double-encryption)
		doc.Content = content
		if err := WriteDiskRaw(*doc); err != nil {
			log.Printf("ReEncrypt: failed to write %s: %v", id, err)
		}
	}

	return nil
}
