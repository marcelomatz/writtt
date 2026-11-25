package application

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/marcelomatz/matz-core/algorithms"
	"github.com/marcelomatz/matz-core/notes"

	"writtt/internal/domain"
)

func (s *WritttService) lockoutSealSeed(cfg *persistedSecurityConfig) string {
	return fmt.Sprintf("%s|%s|%s|WRITTT_LOCKOUT_HMAC_V1", cfg.PasswordHash, cfg.VaultPINHash, s.baseDir)
}

func (s *WritttService) loadSecurityCfg() (*persistedSecurityConfig, error) {
	data, err := s.hal.ReadFile(s.securityFilePath())
	if err != nil {
		return &persistedSecurityConfig{}, nil
	}
	var cfg persistedSecurityConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if cfg.PasswordEnabled {
		hasLockoutState := cfg.AuthLockoutMAC != "" || cfg.AuthFailures > 0 || cfg.AuthLockedUntilMs > 0 || cfg.AuthBotSuspected
		if hasLockoutState && !domain.VerifyLockoutSealMAC(
			s.lockoutSealSeed(&cfg),
			cfg.AuthFailures,
			cfg.AuthLockedUntilMs,
			cfg.AuthBotSuspected,
			cfg.AuthLockoutMAC,
		) {
			if cfg.AuthFailures < 3 {
				cfg.AuthFailures = 3
			}
			cfg.AuthBotSuspected = true
			cfg.AuthLockedUntilMs = time.Now().Add(60 * time.Second).UnixMilli()
			_ = s.saveSecurityCfg(&cfg)
		}
	}
	return &cfg, nil
}

func (s *WritttService) saveSecurityCfg(cfg *persistedSecurityConfig) error {
	if cfg.PasswordEnabled {
		cfg.AuthLockoutMAC = domain.ComputeLockoutSealMAC(
			s.lockoutSealSeed(cfg),
			cfg.AuthFailures,
			cfg.AuthLockedUntilMs,
			cfg.AuthBotSuspected,
		)
	} else {
		cfg.AuthFailures = 0
		cfg.AuthLockedUntilMs = 0
		cfg.AuthBotSuspected = false
		cfg.AuthLockoutMAC = ""
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return s.hal.WriteFile(s.securityFilePath(), data)
}

func (s *WritttService) hydrateLockoutFromDisk() {
	cfg, err := s.loadSecurityCfg()
	if err != nil || cfg == nil {
		return
	}
	s.mu.Lock()
	s.bfFailures = cfg.AuthFailures
	s.bfBotSuspected = cfg.AuthBotSuspected
	if cfg.AuthLockedUntilMs > 0 {
		s.bfLockedUntil = time.UnixMilli(cfg.AuthLockedUntilMs)
	} else {
		s.bfLockedUntil = time.Time{}
	}
	s.mu.Unlock()
}

func (s *WritttService) currentLockoutStatus() (locked bool, retrySec int, requireHold bool) {
	cfg, _ := s.loadSecurityCfg()

	s.mu.Lock()
	defer s.mu.Unlock()

	if cfg != nil && cfg.PasswordEnabled {
		if cfg.AuthFailures > s.bfFailures {
			s.bfFailures = cfg.AuthFailures
		}
		if cfg.AuthBotSuspected {
			s.bfBotSuspected = true
		}
		if cfg.AuthLockedUntilMs > 0 {
			diskUntil := time.UnixMilli(cfg.AuthLockedUntilMs)
			if diskUntil.After(s.bfLockedUntil) {
				s.bfLockedUntil = diskUntil
			}
		}
	}

	now := time.Now()
	if !s.bfLockedUntil.IsZero() && now.Before(s.bfLockedUntil) {
		rem := int(math.Ceil(s.bfLockedUntil.Sub(now).Seconds()))
		if rem < 1 {
			rem = 1
		}
		return true, rem, true
	}
	return false, 0, s.bfFailures >= 1 || s.bfBotSuspected
}

func (s *WritttService) checkBruteForce() error {
	locked, rem, _ := s.currentLockoutStatus()
	if locked {
		return fmt.Errorf("acesso temporariamente bloqueado - aguarde %ds", rem)
	}
	return nil
}

func (s *WritttService) recordAuthFailureWithStatus(botDetected bool, reason string) (locked bool, retrySec int) {
	cfg, _ := s.loadSecurityCfg()
	if cfg == nil {
		cfg = &persistedSecurityConfig{}
	}

	s.mu.Lock()
	if cfg.AuthFailures > s.bfFailures {
		s.bfFailures = cfg.AuthFailures
	}
	s.bfFailures++
	if botDetected {
		s.bfBotSuspected = true
		if s.bfFailures < 3 {
			s.bfFailures = 3
		}
	}

	cooldown := domain.ComputeAuthCooldownDuration(s.bfFailures, botDetected)
	now := time.Now()
	if cooldown > 0 {
		s.bfLockedUntil = now.Add(cooldown)
		locked = true
		retrySec = int(math.Ceil(cooldown.Seconds()))
	} else {
		s.bfLockedUntil = time.Time{}
	}

	lockedMs := int64(0)
	if !s.bfLockedUntil.IsZero() {
		lockedMs = s.bfLockedUntil.UnixMilli()
	}
	failuresSnap := s.bfFailures
	botSnap := s.bfBotSuspected

	if botDetected {
		s.appendAuditLocked("vault", "security.bot_blocked", fmt.Sprintf("Automacao bloqueada (%s) - espera de %ds (falhas=%d)", reason, retrySec, failuresSnap))
	} else if locked {
		s.appendAuditLocked("vault", "security.lockout", fmt.Sprintf("Bloqueio anti-forca bruta ativado por %ds apos %d falhas", retrySec, failuresSnap))
	} else {
		s.appendAuditLocked("vault", "security.auth_failed", fmt.Sprintf("Tentativa de autenticacao recusada (#%d)", failuresSnap))
	}
	s.mu.Unlock()

	if cfg.PasswordEnabled {
		cfg.AuthFailures = failuresSnap
		cfg.AuthLockedUntilMs = lockedMs
		cfg.AuthBotSuspected = botSnap
		_ = s.saveSecurityCfg(cfg)
	}
	return locked, retrySec
}

func (s *WritttService) recordAuthFailure() {
	_, _ = s.recordAuthFailureWithStatus(false, "invalid_credential")
}

func (s *WritttService) recordAuthSuccess() {
	cfg, _ := s.loadSecurityCfg()

	s.mu.Lock()
	s.bfFailures = 0
	s.bfLockedUntil = time.Time{}
	s.bfBotSuspected = false
	s.lastAuthAttemptMs = 0
	if s.authLimiter != nil {
		s.authLimiter.Reset("auth-attempt")
	}
	if s.authCadenceCUSUM != nil {
		s.authCadenceCUSUM.ResetCUSUM()
	}
	s.mu.Unlock()

	if cfg != nil && cfg.PasswordEnabled {
		cfg.AuthFailures = 0
		cfg.AuthLockedUntilMs = 0
		cfg.AuthBotSuspected = false
		_ = s.saveSecurityCfg(cfg)
	}
}

func cryptoRandRange(maxExclusive int64) int64 {
	if maxExclusive <= 1 {
		return 0
	}
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return time.Now().UnixNano() % maxExclusive
	}
	return int64(binary.LittleEndian.Uint64(buf[:]) % uint64(maxExclusive))
}

// BeginAuthChallenge issues a single-use HMAC-signed human-presence challenge with randomized hold bounds.
func (s *WritttService) BeginAuthChallenge() domain.AuthChallengeDTO {
	_, _, requireHold := s.currentLockoutStatus()

	var nonceBytes [16]byte
	_, _ = rand.Read(nonceBytes[:])
	nonce := hex.EncodeToString(nonceBytes[:])

	s.mu.Lock()
	s.authChallengeSeq++
	seq := s.authChallengeSeq
	secret := s.authChallengeSecret
	s.mu.Unlock()

	holdMinMs := int64(900) + cryptoRandRange(420) // [900ms..1319ms]
	holdMaxMs := holdMinMs + 1050                  // ~1.05s target release window
	minElapsedMs := int64(280)
	if requireHold {
		minElapsedMs = holdMinMs
	}

	ch := domain.AuthChallengeDTO{
		ChallengeID:  seq,
		Nonce:        nonce,
		IssuedAtMs:   time.Now().UnixMilli(),
		MinElapsedMs: minElapsedMs,
		RequireHold:  requireHold,
		HoldMinMs:    holdMinMs,
		HoldMaxMs:    holdMaxMs,
	}
	ch.Signature = domain.SignAuthChallenge(secret, ch)
	return ch
}

// GetSecurityConfig returns the sanitized security state without exposing Argon2id hashes or private keys.
func (s *WritttService) GetSecurityConfig() (*domain.SecurityConfigDTO, error) {
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return nil, err
	}
	bfLocked, retrySec, holdReq := s.currentLockoutStatus()

	s.mu.Lock()
	vaultUnlocked := len(s.activePassword) > 0
	pinReady := cfg.VaultPINEnabled && len(s.storedVaultKey) > 0
	appUnlocked := s.appUnlocked || !cfg.PasswordEnabled
	s.mu.Unlock()

	rsaFP := ""
	rsaPub := ""
	if cfg.RSAKeyPair != nil {
		rsaFP = cfg.RSAKeyPair.Fingerprint
		rsaPub = cfg.RSAKeyPair.PublicKeyPEM
	}

	return &domain.SecurityConfigDTO{
		PasswordEnabled:    cfg.PasswordEnabled,
		VaultPINEnabled:    cfg.VaultPINEnabled,
		VaultPINReady:      pinReady,
		VaultUnlocked:      vaultUnlocked,
		AppUnlocked:        appUnlocked,
		TOTPEnabled:        cfg.TOTPEnabled,
		RecoveryConfigured: cfg.RecoveryWrappedKey != "",
		RSAFingerprint:     rsaFP,
		RSAPublicKeyPEM:    rsaPub,
		BruteForceLocked:   bfLocked,
		BruteForceRetrySec: retrySec,
		HumanHoldRequired:  holdReq,
		KDFSpec:            "Argon2id (m=64MB, t=3, p=2) + AES-256-GCM",
		BackupCodesLeft:    len(cfg.TOTPBackupHashes),
	}, nil
}

// SetPassword rotates or sets the Master Password using COE ExecuteSaga for atomic re-encryption of all vault docs.
func (s *WritttService) SetPassword(currentPassword, newPassword string) error {
	if strings.TrimSpace(newPassword) == "" {
		return fmt.Errorf("a nova senha nao pode estar vazia")
	}
	if err := s.checkBruteForce(); err != nil {
		return err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return err
	}
	if cfg.PasswordEnabled && cfg.PasswordHash != "" {
		if !notes.VerifyPassword(currentPassword, cfg.PasswordHash) {
			s.recordAuthFailure()
			return fmt.Errorf("acesso negado")
		}
	}

	oldPassword := ""
	if cfg.PasswordEnabled {
		oldPassword = currentPassword
	}

	backupDocs := make(map[string][]byte)
	backupTOTPSec := cfg.TOTPSecretEnc
	backupDriveRaw, hadDriveRawErr := s.hal.ReadFile(s.driveFilePath())
	var newHash string

	steps := []algorithms.SagaStep[string]{
		{
			Name: "snapshot_and_reencrypt_vault_docs",
			Action: func(_ string) (any, error) {
				files, _ := s.hal.ListFiles(s.DataDir())
				for _, f := range files {
					if filepath.Ext(f) != ".md" {
						continue
					}
					p := filepath.Join(s.DataDir(), f)
					raw, readErr := s.hal.ReadFile(p)
					if readErr != nil {
						continue
					}
					backupDocs[p] = raw
					id := strings.TrimSuffix(f, ".md")
					doc := parseMarkdownDocument(id, raw)
					if !doc.Frontmatter.IsVault {
						continue
					}
					content := doc.Content
					if oldPassword != "" && notes.IsEncrypted(content) {
						plain, decErr := notes.Decrypt(oldPassword, content)
						if decErr != nil {
							return nil, decErr
						}
						content = string(plain)
					}
					if newPassword != "" && !notes.IsEncrypted(content) {
						enc, encErr := notes.Encrypt(newPassword, []byte(content))
						if encErr != nil {
							return nil, encErr
						}
						content = enc
						doc.Frontmatter.Encrypted = true
					}
					doc.Content = content
					encoded, encErr := encodeMarkdownDocument(doc)
					if encErr != nil {
						return nil, encErr
					}
					if err := s.hal.WriteFile(p, encoded); err != nil {
						return nil, err
					}
				}
				return len(backupDocs), nil
			},
			Compensate: func(_ string, _ any) {
				for p, raw := range backupDocs {
					_ = s.hal.WriteFile(p, raw)
				}
			},
		},
		{
			Name: "reencrypt_totp_and_drive_vault",
			Action: func(_ string) (any, error) {
				if cfg.TOTPEnabled && cfg.TOTPSecretEnc != "" {
					totpPlain := cfg.TOTPSecretEnc
					if notes.IsEncrypted(totpPlain) && oldPassword != "" {
						dec, decErr := notes.Decrypt(oldPassword, totpPlain)
						if decErr != nil {
							return nil, decErr
						}
						totpPlain = string(dec)
					}
					encTotp, encErr := notes.Encrypt(newPassword, []byte(totpPlain))
					if encErr != nil {
						return nil, encErr
					}
					cfg.TOTPSecretEnc = encTotp
				}

				st, _ := s.loadDriveStore()
				if len(st.Payloads) > 0 {
					oldDriveKey := oldPassword
					if oldDriveKey == "" {
						oldDriveKey = "writtt-local-ephemeral-drive-key"
					}
					for id, encPayload := range st.Payloads {
						plain, decErr := notes.Decrypt(oldDriveKey, encPayload)
						if decErr != nil && oldDriveKey != "writtt-local-ephemeral-drive-key" {
							plain, decErr = notes.Decrypt("writtt-local-ephemeral-drive-key", encPayload)
						}
						if decErr != nil {
							return nil, decErr
						}
						reenc, encErr := notes.Encrypt(newPassword, plain)
						if encErr != nil {
							return nil, encErr
						}
						st.Payloads[id] = reenc
					}
					if err := s.saveDriveStore(st); err != nil {
						return nil, err
					}
				}
				return len(st.Payloads), nil
			},
			Compensate: func(_ string, _ any) {
				cfg.TOTPSecretEnc = backupTOTPSec
				if hadDriveRawErr == nil {
					_ = s.hal.WriteFile(s.driveFilePath(), backupDriveRaw)
				}
			},
		},
		{
			Name: "hash_and_persist_argon2id_config",
			Action: func(_ string) (any, error) {
				h, hashErr := notes.HashPassword(newPassword)
				if hashErr != nil {
					return nil, hashErr
				}
				newHash = h
				cfg.PasswordEnabled = true
				cfg.PasswordHash = newHash
				cfg.AuthFailures = 0
				cfg.AuthLockedUntilMs = 0
				cfg.AuthBotSuspected = false
				return newHash, s.saveSecurityCfg(cfg)
			},
		},
	}

	ok, failedStep, errReason := algorithms.ExecuteSaga(steps, "set_password")
	if !ok {
		return fmt.Errorf("saga %s failed: %s", failedStep, errReason)
	}

	s.mu.Lock()
	s.bfFailures = 0
	s.bfLockedUntil = time.Time{}
	s.bfBotSuspected = false
	zeroBytes(s.activePassword)
	s.activePassword = []byte(newPassword)
	zeroBytes(s.storedVaultKey)
	s.storedVaultKey = []byte(newPassword)
	s.appUnlocked = true
	s.docCache = algorithms.NewLRUCache[string, domain.Document](64)
	s.appendAuditLocked("vault", "security.password_set", "Senha Mestra Argon2id configurada e documentos/TOTP/Drive re-criptografados via Saga")
	s.mu.Unlock()
	return nil
}

// RemovePassword decrypts all Vault documents and disables Master Password, PIN, and Recovery Key protection.
func (s *WritttService) RemovePassword(currentPassword string) error {
	if err := s.checkBruteForce(); err != nil {
		return err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return err
	}
	if !cfg.PasswordEnabled {
		return nil
	}
	if !notes.VerifyPassword(currentPassword, cfg.PasswordHash) {
		s.recordAuthFailure()
		return fmt.Errorf("acesso negado")
	}

	files, _ := s.hal.ListFiles(s.DataDir())
	for _, f := range files {
		if filepath.Ext(f) != ".md" {
			continue
		}
		p := filepath.Join(s.DataDir(), f)
		raw, readErr := s.hal.ReadFile(p)
		if readErr != nil {
			continue
		}
		doc := parseMarkdownDocument(strings.TrimSuffix(f, ".md"), raw)
		if doc.Frontmatter.IsVault && notes.IsEncrypted(doc.Content) {
			if plain, decErr := notes.Decrypt(currentPassword, doc.Content); decErr == nil {
				doc.Content = string(plain)
				doc.Frontmatter.Encrypted = false
				if encoded, encErr := encodeMarkdownDocument(doc); encErr == nil {
					_ = s.hal.WriteFile(p, encoded)
				}
			}
		}
	}

	if cfg.TOTPEnabled && notes.IsEncrypted(cfg.TOTPSecretEnc) {
		if dec, decErr := notes.Decrypt(currentPassword, cfg.TOTPSecretEnc); decErr == nil {
			cfg.TOTPSecretEnc = string(dec)
		}
	}

	st, _ := s.loadDriveStore()
	if len(st.Payloads) > 0 {
		for id, encPayload := range st.Payloads {
			if plain, decErr := notes.Decrypt(currentPassword, encPayload); decErr == nil {
				if reenc, encErr := notes.Encrypt("writtt-local-ephemeral-drive-key", plain); encErr == nil {
					st.Payloads[id] = reenc
				}
			}
		}
		_ = s.saveDriveStore(st)
	}

	cfg.PasswordEnabled = false
	cfg.PasswordHash = ""
	cfg.VaultPINEnabled = false
	cfg.VaultPINHash = ""
	cfg.RecoveryWrappedKey = ""
	if err := s.saveSecurityCfg(cfg); err != nil {
		return err
	}

	s.mu.Lock()
	s.bfFailures = 0
	s.bfLockedUntil = time.Time{}
	s.bfBotSuspected = false
	zeroBytes(s.activePassword)
	s.activePassword = nil
	zeroBytes(s.storedVaultKey)
	s.storedVaultKey = nil
	s.docCache = algorithms.NewLRUCache[string, domain.Document](64)
	s.appendAuditLocked("vault", "security.password_removed", "Protecao por Senha Mestra desativada e cofre descriptografado")
	s.mu.Unlock()
	return nil
}

// UnlockWithHumanProof verifies signed human-presence telemetry, anti-replay state, GCRA/CUSUM cadence,
// primary credential (Master Password or Quick PIN), and optional TOTP 2FA atomically without oracle hints.
func (s *WritttService) UnlockWithHumanProof(req domain.HumanUnlockRequest) (*domain.HumanUnlockResult, error) {
	if locked, retrySec, _ := s.currentLockoutStatus(); locked {
		return &domain.HumanUnlockResult{
			Unlocked:    false,
			Locked:      true,
			RetrySec:    retrySec,
			RequireHold: true,
		}, nil
	}

	nowMs := time.Now().UnixMilli()
	botDetected := false
	botReason := ""

	s.mu.Lock()
	allowed, _, _ := s.authLimiter.Allow("auth-attempt", nowMs, 1)
	if !allowed {
		botDetected = true
		botReason = "gcra_burst_exceeded"
	}
	if s.lastAuthAttemptMs > 0 {
		dt := float64(nowMs - s.lastAuthAttemptMs)
		obs := s.authCadenceCUSUM.Observe(dt)
		if dt < 450 {
			botDetected = true
			botReason = "subhuman_attempt_interval"
		} else if obs.Count >= 3 && obs.StdDev < 18.0 && dt < 1500 {
			botDetected = true
			botReason = "robotic_periodic_cadence"
		}
	}
	s.lastAuthAttemptMs = nowMs
	secret := s.authChallengeSecret
	replayAccepted, replayReason := s.authChallengeReplay.VerifyAndMark(req.Proof.ChallengeID)
	s.mu.Unlock()

	if !domain.VerifyAuthChallengeSignature(secret, req.Proof) {
		botDetected = true
		botReason = "invalid_challenge_hmac"
	} else if !replayAccepted {
		botDetected = true
		botReason = "challenge_replay_" + replayReason
	} else if okHuman, reason := domain.EvaluateHumanPresence(req.Proof, nowMs); !okHuman {
		botDetected = true
		botReason = reason
	}

	if botDetected {
		locked, retrySec := s.recordAuthFailureWithStatus(true, botReason)
		return &domain.HumanUnlockResult{
			Unlocked:    false,
			Locked:      locked,
			RetrySec:    retrySec,
			RequireHold: true,
		}, nil
	}

	cfg, err := s.loadSecurityCfg()
	if err != nil || !cfg.PasswordEnabled {
		return &domain.HumanUnlockResult{Unlocked: false, RequireHold: true}, nil
	}

	var candidateKey []byte
	isPinMode := req.Mode == "pin" || req.Mode == "vault-pin"
	if isPinMode {
		pinValid := cfg.VaultPINEnabled && cfg.VaultPINHash != "" && notes.VerifyPassword(req.Secret, cfg.VaultPINHash)
		s.mu.Lock()
		if len(s.storedVaultKey) > 0 {
			candidateKey = make([]byte, len(s.storedVaultKey))
			copy(candidateKey, s.storedVaultKey)
		}
		s.mu.Unlock()
		if !pinValid || len(candidateKey) == 0 {
			zeroBytes(candidateKey)
			locked, retrySec := s.recordAuthFailureWithStatus(false, "invalid_pin_or_cold_session")
			return &domain.HumanUnlockResult{
				Unlocked:    false,
				Locked:      locked,
				RetrySec:    retrySec,
				RequireHold: true,
			}, nil
		}
	} else {
		if !notes.VerifyPassword(req.Secret, cfg.PasswordHash) {
			locked, retrySec := s.recordAuthFailureWithStatus(false, "invalid_master_password")
			return &domain.HumanUnlockResult{
				Unlocked:    false,
				Locked:      locked,
				RetrySec:    retrySec,
				RequireHold: true,
			}, nil
		}
		candidateKey = []byte(req.Secret)
	}

	if cfg.TOTPEnabled {
		okTotp, _ := s.verifyTOTPWithCandidateKey(cfg, string(candidateKey), req.TOTPCode)
		if !okTotp {
			zeroBytes(candidateKey)
			locked, retrySec := s.recordAuthFailureWithStatus(false, "invalid_2fa")
			return &domain.HumanUnlockResult{
				Unlocked:    false,
				Locked:      locked,
				RetrySec:    retrySec,
				RequireHold: true,
			}, nil
		}
	}

	s.recordAuthSuccess()

	s.mu.Lock()
	zeroBytes(s.activePassword)
	s.activePassword = make([]byte, len(candidateKey))
	copy(s.activePassword, candidateKey)
	if !isPinMode {
		zeroBytes(s.storedVaultKey)
		s.storedVaultKey = make([]byte, len(candidateKey))
		copy(s.storedVaultKey, candidateKey)
	}
	s.appUnlocked = true
	s.docCache = algorithms.NewLRUCache[string, domain.Document](64)
	s.appendAuditLocked("vault", "vault.human_unlock", "Acesso autorizado apos verificacao criptografica e prova de presenca humana")
	s.mu.Unlock()

	zeroBytes(candidateKey)
	return &domain.HumanUnlockResult{
		Unlocked:    true,
		Locked:      false,
		RetrySec:    0,
		RequireHold: false,
	}, nil
}

// UnlockVault verifies password against Argon2id hash with brute-force lockout protection.
func (s *WritttService) UnlockVault(password string) bool {
	if err := s.checkBruteForce(); err != nil {
		return false
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil || !cfg.PasswordEnabled {
		return false
	}
	if !notes.VerifyPassword(password, cfg.PasswordHash) {
		s.recordAuthFailure()
		return false
	}
	s.recordAuthSuccess()

	s.mu.Lock()
	zeroBytes(s.activePassword)
	s.activePassword = []byte(password)
	zeroBytes(s.storedVaultKey)
	s.storedVaultKey = []byte(password)
	s.appUnlocked = true
	s.docCache = algorithms.NewLRUCache[string, domain.Document](64)
	s.appendAuditLocked("vault", "vault.unlock", "Cofre Zero-Knowledge desbloqueado com Senha Mestra Argon2id")
	s.mu.Unlock()
	return true
}

// UnlockApp unlocks both application access and the Zero-Knowledge Vault.
func (s *WritttService) UnlockApp(password string) bool {
	return s.UnlockVault(password)
}

// LockVault zeroizes activePassword in RAM while keeping storedVaultKey for mid-session PIN unlock.
func (s *WritttService) LockVault() {
	s.mu.Lock()
	zeroBytes(s.activePassword)
	s.activePassword = nil
	s.docCache = algorithms.NewLRUCache[string, domain.Document](64)
	s.appendAuditLocked("vault", "vault.lock", "Cofre bloqueado e chave AES-256-GCM zerada da memoria")
	s.mu.Unlock()
}

// LockApp engages full application LOCK mode and flushes decrypted document cache.
func (s *WritttService) LockApp() {
	s.mu.Lock()
	zeroBytes(s.activePassword)
	s.activePassword = nil
	s.appUnlocked = false
	s.docCache = algorithms.NewLRUCache[string, domain.Document](64)
	s.appendAuditLocked("vault", "app.lock", "Aplicacao bloqueada manualmente (Ctrl+L)")
	s.mu.Unlock()
}

// IsVaultUnlocked returns true when activePassword is present in memory.
func (s *WritttService) IsVaultUnlocked() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.activePassword) > 0
}

// SetVaultPIN configures a Quick PIN after verifying the Master Password.
func (s *WritttService) SetVaultPIN(currentPassword, pin string) error {
	if strings.TrimSpace(pin) == "" {
		return fmt.Errorf("o PIN nao pode estar vazio")
	}
	if err := s.checkBruteForce(); err != nil {
		return err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return err
	}
	if cfg.PasswordEnabled && cfg.PasswordHash != "" {
		if !notes.VerifyPassword(currentPassword, cfg.PasswordHash) {
			s.recordAuthFailure()
			return fmt.Errorf("acesso negado")
		}
	}
	hash, err := notes.HashPassword(pin)
	if err != nil {
		return err
	}
	cfg.VaultPINEnabled = true
	cfg.VaultPINHash = hash
	cfg.AuthFailures = 0
	cfg.AuthLockedUntilMs = 0
	cfg.AuthBotSuspected = false
	if err := s.saveSecurityCfg(cfg); err != nil {
		return err
	}
	s.recordAuthSuccess()
	if currentPassword != "" {
		s.mu.Lock()
		zeroBytes(s.storedVaultKey)
		s.storedVaultKey = []byte(currentPassword)
		s.appendAuditLocked("vault", "security.pin_set", "PIN rapido configurado no Cofre")
		s.mu.Unlock()
	}
	return nil
}

// RemoveVaultPIN disables Quick PIN unlock after verifying the Master Password.
func (s *WritttService) RemoveVaultPIN(currentPassword string) error {
	if err := s.checkBruteForce(); err != nil {
		return err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return err
	}
	if !cfg.VaultPINEnabled {
		return nil
	}
	if cfg.PasswordEnabled && cfg.PasswordHash != "" {
		if !notes.VerifyPassword(currentPassword, cfg.PasswordHash) {
			s.recordAuthFailure()
			return fmt.Errorf("acesso negado")
		}
	}
	cfg.VaultPINEnabled = false
	cfg.VaultPINHash = ""
	cfg.AuthFailures = 0
	cfg.AuthLockedUntilMs = 0
	cfg.AuthBotSuspected = false
	s.AppendConsoleAndAudit("vault", "security.pin_removed", "PIN rapido removido")
	if err := s.saveSecurityCfg(cfg); err != nil {
		return err
	}
	s.recordAuthSuccess()
	return nil
}

// UnlockVaultWithPIN restores activePassword from ephemeral session memory upon valid PIN verification.
func (s *WritttService) UnlockVaultWithPIN(pin string) bool {
	if err := s.checkBruteForce(); err != nil {
		return false
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil || !cfg.VaultPINEnabled || cfg.VaultPINHash == "" {
		return false
	}
	pinValid := notes.VerifyPassword(pin, cfg.VaultPINHash)

	s.mu.Lock()
	hasSessionKey := len(s.storedVaultKey) > 0
	s.mu.Unlock()

	if !pinValid || !hasSessionKey {
		s.recordAuthFailure()
		return false
	}
	s.recordAuthSuccess()

	s.mu.Lock()
	zeroBytes(s.activePassword)
	s.activePassword = make([]byte, len(s.storedVaultKey))
	copy(s.activePassword, s.storedVaultKey)
	s.appUnlocked = true
	s.docCache = algorithms.NewLRUCache[string, domain.Document](64)
	s.appendAuditLocked("vault", "vault.pin_unlock", "Cofre desbloqueado via PIN rapido")
	s.mu.Unlock()
	return true
}

// GenerateRecoveryKey creates a 256-bit Recovery Key and wraps the Master Password using AES-256-GCM.
func (s *WritttService) GenerateRecoveryKey(currentPassword string) (string, error) {
	if err := s.checkBruteForce(); err != nil {
		return "", err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return "", err
	}
	if !cfg.PasswordEnabled || !notes.VerifyPassword(currentPassword, cfg.PasswordHash) {
		s.recordAuthFailure()
		return "", fmt.Errorf("acesso negado")
	}
	rkBytes, formatted, err := notes.GenerateRecoveryKey()
	if err != nil {
		return "", err
	}
	wrapped, err := notes.WrapSecretWithRecoveryKey(rkBytes, []byte(currentPassword))
	if err != nil {
		return "", err
	}
	cfg.RecoveryWrappedKey = wrapped
	cfg.AuthFailures = 0
	cfg.AuthLockedUntilMs = 0
	cfg.AuthBotSuspected = false
	if err := s.saveSecurityCfg(cfg); err != nil {
		return "", err
	}
	s.recordAuthSuccess()
	s.AppendConsoleAndAudit("vault", "security.recovery_generated", "Chave de Recuperacao 256-bit (rk:) gerada e selada com AES-256-GCM")
	return formatted, nil
}

// RecoverVaultWithKey unwraps the Master Password with recoveryKeyFormatted and rotates to newPassword via Saga.
func (s *WritttService) RecoverVaultWithKey(recoveryKeyFormatted, newPassword string) error {
	if strings.TrimSpace(newPassword) == "" {
		return fmt.Errorf("a nova senha nao pode estar vazia")
	}
	if err := s.checkBruteForce(); err != nil {
		return err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return err
	}
	if cfg.RecoveryWrappedKey == "" {
		s.recordAuthFailure()
		return fmt.Errorf("acesso negado")
	}
	rkBytes, err := notes.ParseRecoveryKey(recoveryKeyFormatted)
	if err != nil {
		s.recordAuthFailure()
		return fmt.Errorf("acesso negado")
	}
	oldPasswordBytes, err := notes.UnwrapSecretWithRecoveryKey(rkBytes, cfg.RecoveryWrappedKey)
	if err != nil {
		s.recordAuthFailure()
		return fmt.Errorf("acesso negado")
	}
	defer zeroBytes(oldPasswordBytes)

	if err := s.SetPassword(string(oldPasswordBytes), newPassword); err != nil {
		return err
	}
	if rewrapped, wrapErr := notes.WrapSecretWithRecoveryKey(rkBytes, []byte(newPassword)); wrapErr == nil {
		if latestCfg, loadErr := s.loadSecurityCfg(); loadErr == nil {
			latestCfg.RecoveryWrappedKey = rewrapped
			_ = s.saveSecurityCfg(latestCfg)
		}
	}
	s.AppendConsoleAndAudit("vault", "security.recovery_used", "Cofre recuperado com sucesso via Recovery Key 256-bit")
	return nil
}

// SetupVaultTOTP generates an RFC 6238 TOTP Base32 secret and 8 single-use backup codes.
func (s *WritttService) SetupVaultTOTP(currentPassword string) (*domain.TOTPEnrollmentBundle, error) {
	if err := s.checkBruteForce(); err != nil {
		return nil, err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return nil, err
	}
	if cfg.PasswordEnabled && !notes.VerifyPassword(currentPassword, cfg.PasswordHash) {
		s.recordAuthFailure()
		return nil, fmt.Errorf("acesso negado")
	}
	secret, err := notes.GenerateTOTPSecret()
	if err != nil {
		return nil, err
	}
	plainBackups, backupHashes, err := notes.GenerateBackupCodes(8)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.pendingTOTPSec = secret
	s.pendingBackups = backupHashes
	s.appendAuditLocked("vault", "totp.setup_initiated", "Segredo TOTP RFC 6238 e 8 codigos de backup gerados")
	s.mu.Unlock()

	return &domain.TOTPEnrollmentBundle{
		SecretBase32: secret,
		OTPAuthURI:   notes.BuildTOTPURI(secret, "vault@writtt.local", "Writtt Zero-Knowledge"),
		BackupCodes:  plainBackups,
	}, nil
}

// EnableVaultTOTP verifies the initial 6-digit TOTP code and seals the TOTP secret on disk.
func (s *WritttService) EnableVaultTOTP(currentPassword, code string) error {
	if err := s.checkBruteForce(); err != nil {
		return err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return err
	}
	if cfg.PasswordEnabled && !notes.VerifyPassword(currentPassword, cfg.PasswordHash) {
		s.recordAuthFailure()
		return fmt.Errorf("acesso negado")
	}
	s.mu.Lock()
	secret := s.pendingTOTPSec
	backups := append([]string(nil), s.pendingBackups...)
	s.mu.Unlock()

	if secret == "" {
		return fmt.Errorf("inicie a configuracao TOTP primeiro")
	}
	ok, _ := notes.VerifyTOTPCodeAt(secret, code, time.Now())
	if !ok {
		return fmt.Errorf("codigo TOTP de 6 digitos invalido")
	}
	s.mu.Lock()
	s.totpReplayWindow = algorithms.NewReplayWindow()
	s.mu.Unlock()

	encSecret := secret
	if currentPassword != "" {
		if enc, encErr := notes.Encrypt(currentPassword, []byte(secret)); encErr == nil {
			encSecret = enc
		}
	}
	cfg.TOTPEnabled = true
	cfg.TOTPSecretEnc = encSecret
	cfg.TOTPBackupHashes = backups
	cfg.AuthFailures = 0
	cfg.AuthLockedUntilMs = 0
	cfg.AuthBotSuspected = false
	if err := s.saveSecurityCfg(cfg); err != nil {
		return err
	}
	s.recordAuthSuccess()
	s.AppendConsoleAndAudit("vault", "totp.enabled", "Autenticacao TOTP 2FA ativada com ReplayWindow de 64 bits")
	return nil
}

func (s *WritttService) verifyTOTPWithCandidateKey(cfg *persistedSecurityConfig, candidatePwd string, code string) (bool, error) {
	trimmedCode := strings.TrimSpace(code)
	if trimmedCode == "" {
		return false, fmt.Errorf("acesso negado")
	}
	secret := cfg.TOTPSecretEnc
	if notes.IsEncrypted(secret) {
		if candidatePwd == "" {
			return false, fmt.Errorf("acesso negado")
		}
		plain, decErr := notes.Decrypt(candidatePwd, secret)
		if decErr != nil {
			return false, fmt.Errorf("acesso negado")
		}
		secret = string(plain)
	}

	if ok, step := notes.VerifyTOTPCodeAt(secret, trimmedCode, time.Now()); ok {
		s.mu.Lock()
		accepted, reason := s.totpReplayWindow.VerifyAndMark(step)
		s.mu.Unlock()
		if !accepted {
			return false, fmt.Errorf("codigo rejeitado (%s)", reason)
		}
		s.AppendConsoleAndAudit("vault", "totp.verified", "Codigo TOTP 2FA verificado com sucesso")
		return true, nil
	}

	if idx := notes.VerifyBackupCode(trimmedCode, cfg.TOTPBackupHashes); idx >= 0 {
		cfg.TOTPBackupHashes = append(cfg.TOTPBackupHashes[:idx], cfg.TOTPBackupHashes[idx+1:]...)
		cfg.AuthFailures = 0
		cfg.AuthLockedUntilMs = 0
		cfg.AuthBotSuspected = false
		_ = s.saveSecurityCfg(cfg)
		s.AppendConsoleAndAudit("vault", "totp.backup_used", "Codigo de backup de uso unico consumido")
		return true, nil
	}

	return false, fmt.Errorf("acesso negado")
}

// VerifyVaultTOTP validates a 6-digit TOTP code (guarded by 64-bit ReplayWindow) or consumes a backup code.
func (s *WritttService) VerifyVaultTOTP(code string) (bool, error) {
	if err := s.checkBruteForce(); err != nil {
		return false, err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil || !cfg.TOTPEnabled {
		return false, fmt.Errorf("TOTP nao esta ativo")
	}

	s.mu.Lock()
	activePwd := string(s.activePassword)
	s.mu.Unlock()

	ok, verifyErr := s.verifyTOTPWithCandidateKey(cfg, activePwd, code)
	if !ok {
		s.recordAuthFailure()
		return false, verifyErr
	}
	s.recordAuthSuccess()
	return true, nil
}

// DisableVaultTOTP turns off TOTP 2FA after Master Password verification.
func (s *WritttService) DisableVaultTOTP(currentPassword string) error {
	if err := s.checkBruteForce(); err != nil {
		return err
	}
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return err
	}
	if cfg.PasswordEnabled && !notes.VerifyPassword(currentPassword, cfg.PasswordHash) {
		s.recordAuthFailure()
		return fmt.Errorf("acesso negado")
	}
	cfg.TOTPEnabled = false
	cfg.TOTPSecretEnc = ""
	cfg.TOTPBackupHashes = nil
	cfg.AuthFailures = 0
	cfg.AuthLockedUntilMs = 0
	cfg.AuthBotSuspected = false
	s.AppendConsoleAndAudit("vault", "totp.disabled", "TOTP 2FA desativado")
	if err := s.saveSecurityCfg(cfg); err != nil {
		return err
	}
	s.recordAuthSuccess()
	return nil
}

// ListTrustedDevices returns registered device fingerprints in the Device-Aware Vault registry.
func (s *WritttService) ListTrustedDevices() ([]domain.TrustedDeviceDTO, error) {
	cfg, err := s.loadSecurityCfg()
	if err != nil {
		return nil, err
	}
	if len(cfg.TrustedDevices) == 0 {
		host, _ := os.Hostname()
		if host == "" {
			host = "MATZ-Desktop-Workstation"
		}
		fpHex, _ := algorithms.SHA256("device:" + host + ":" + s.baseDir)
		nowStr := time.Now().Format("2006-01-02 15:04:05")
		cfg.TrustedDevices = []domain.TrustedDeviceDTO{
			{
				ID:          "dev-primary",
				Label:       host + " (Local Wails v3)",
				Platform:    "Windows Desktop / WebView2",
				Fingerprint: strings.ToUpper(fpHex[:16]),
				CreatedAt:   nowStr,
				LastSeenAt:  nowStr,
				Current:     true,
			},
		}
		_ = s.saveSecurityCfg(cfg)
	}
	return cfg.TrustedDevices, nil
}

// RegisterTrustedDevice adds a labeled device fingerprint to the Device-Aware Vault registry.
func (s *WritttService) RegisterTrustedDevice(label string) (*domain.TrustedDeviceDTO, error) {
	cleanLabel := strings.TrimSpace(label)
	if cleanLabel == "" {
		return nil, fmt.Errorf("informe o nome do dispositivo autorizado")
	}
	devices, err := s.ListTrustedDevices()
	if err != nil {
		return nil, err
	}
	cfg, _ := s.loadSecurityCfg()
	nowStr := time.Now().Format("2006-01-02 15:04:05")
	id := fmt.Sprintf("dev-%d", time.Now().UnixNano())
	fpHex, _ := algorithms.SHA256(id + ":" + cleanLabel + ":" + nowStr)
	dev := domain.TrustedDeviceDTO{
		ID:          id,
		Label:       cleanLabel,
		Platform:    "Authorized Vault Keychain",
		Fingerprint: strings.ToUpper(fpHex[:16]),
		CreatedAt:   nowStr,
		LastSeenAt:  nowStr,
		Current:     false,
	}
	cfg.TrustedDevices = append(devices, dev)
	if err := s.saveSecurityCfg(cfg); err != nil {
		return nil, err
	}
	s.AppendConsoleAndAudit("vault:"+id, "device.register", fmt.Sprintf("Dispositivo confiavel '%s' registrado (fp=%s)", dev.Label, dev.Fingerprint))
	return &dev, nil
}

// RevokeTrustedDevice removes a non-current device from the Device-Aware Vault registry.
func (s *WritttService) RevokeTrustedDevice(id string) ([]domain.TrustedDeviceDTO, error) {
	devices, err := s.ListTrustedDevices()
	if err != nil {
		return nil, err
	}
	cfg, _ := s.loadSecurityCfg()
	var kept []domain.TrustedDeviceDTO
	for _, d := range devices {
		if d.ID == id && d.Current {
			return nil, fmt.Errorf("nao e permitido revogar a estacao de trabalho atual em uso")
		}
		if d.ID != id {
			kept = append(kept, d)
		}
	}
	cfg.TrustedDevices = kept
	if err := s.saveSecurityCfg(cfg); err != nil {
		return nil, err
	}
	s.AppendConsoleAndAudit("vault:"+id, "device.revoke", fmt.Sprintf("Dispositivo confiavel %s revogado do cofre", id))
	return kept, nil
}
