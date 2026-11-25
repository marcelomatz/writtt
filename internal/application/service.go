// Package application orchestrates all Writtt Studio & Zero-Knowledge Vault use-cases,
// bridging pure domain logic (internal/domain), platform HAL (internal/adapters),
// cryptography (matz-core/notes), and the 8 COE Framework algorithm modules (matz-core/algorithms).
package application

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/marcelomatz/matz-core/algorithms"
	"github.com/marcelomatz/matz-core/notes"
	"github.com/oklog/ulid/v2"

	"writtt/internal/domain"
)

type persistedSecurityConfig struct {
	PasswordEnabled    bool                      `json:"password_enabled"`
	PasswordHash       string                    `json:"password_hash,omitempty"`
	VaultPINEnabled    bool                      `json:"vault_pin_enabled"`
	VaultPINHash       string                    `json:"vault_pin_hash,omitempty"`
	TOTPEnabled        bool                      `json:"totp_enabled"`
	TOTPSecretEnc      string                    `json:"totp_secret_enc,omitempty"`
	TOTPBackupHashes   []string                  `json:"totp_backup_hashes,omitempty"`
	RecoveryWrappedKey string                    `json:"recovery_wrapped_key,omitempty"`
	RSAKeyPair         *notes.RSAKeyPairBundle   `json:"rsa_key_pair,omitempty"`
	TrustedDevices     []domain.TrustedDeviceDTO `json:"trusted_devices,omitempty"`
	OperatorAlias      string                    `json:"operator_alias,omitempty"`
	AliasChangeCount   int                       `json:"alias_change_count,omitempty"`
	AliasLastChanged   string                    `json:"alias_last_changed,omitempty"`
	AuthFailures       int                       `json:"auth_failures,omitempty"`
	AuthLockedUntilMs  int64                     `json:"auth_locked_until_ms,omitempty"`
	AuthBotSuspected   bool                      `json:"auth_bot_suspected,omitempty"`
	AuthLockoutMAC     string                    `json:"auth_lockout_mac,omitempty"`
}

type persistedDriveStore struct {
	Files    []domain.DriveVaultFile `json:"files"`
	Payloads map[string]string       `json:"payloads"` // id -> enc:...
}

// nopCommandRunner provides a safe null-object fallback when NewWritttService is called with a nil port.
type nopCommandRunner struct{}

func (nopCommandRunner) RunCommand(string, time.Duration, string, ...string) (string, error) {
	return "", os.ErrNotExist
}
func (nopCommandRunner) ReadFile(string) ([]byte, error)     { return nil, os.ErrNotExist }
func (nopCommandRunner) WriteFile(string, []byte) error      { return nil }
func (nopCommandRunner) RemoveFile(string) error             { return nil }
func (nopCommandRunner) ListFiles(string) ([]string, error)  { return nil, nil }
func (nopCommandRunner) CheckTCPPort(string, time.Duration) bool { return false }
func (nopCommandRunner) QueryOllamaModels(string) ([]string, error) { return nil, os.ErrNotExist }
func (nopCommandRunner) GenerateOllamaText(string, string, string, string) (string, error) {
	return "", os.ErrNotExist
}
func (nopCommandRunner) ChatOllama(string, string, []domain.OllamaChatMessage) (string, error) {
	return "", os.ErrNotExist
}
func (nopCommandRunner) FetchRemoteRelease(string, string, time.Duration) (domain.ReleaseUpdateDTO, error) {
	return domain.ReleaseUpdateDTO{}, os.ErrNotExist
}

// WritttService coordinates editorial, cryptographic, version-control, and sandboxed AI workflows.
type WritttService struct {
	mu                  sync.Mutex
	hal                 domain.CommandRunner
	baseDir             string
	lockManager         *algorithms.StripedLockManager
	rateLimiter         *algorithms.GCRALimiter
	authLimiter         *algorithms.GCRALimiter
	docCache            *algorithms.LRUCache[string, domain.Document]
	consoleRing         *algorithms.RingBuffer[string]
	forensicChain       *algorithms.ForensicChain
	totpReplayWindow    *algorithms.ReplayWindow
	authChallengeReplay *algorithms.ReplayWindow
	docCoalescer        *algorithms.WriteBehindCoalescer
	latencyCUSUM        *algorithms.WelfordCUSUM
	authCadenceCUSUM    *algorithms.WelfordCUSUM
	lastCUSUMObs        algorithms.WelfordCUSUMObservation
	spatialGrid         *algorithms.SpatialGrid[string]
	priorityAlias       *algorithms.AliasSampler[string]

	// Ephemeral zeroized session keys (never written in plaintext to disk)
	activePassword []byte
	storedVaultKey []byte
	appUnlocked    bool
	pendingTOTPSec string
	pendingBackups []string

	// Persistent brute-force lockout & anti-automation challenge state
	bfFailures          int
	bfLockedUntil       time.Time
	bfBotSuspected      bool
	authChallengeSeq    uint64
	authChallengeSecret string
	lastAuthAttemptMs   int64
}

// NewWritttService constructs a WritttService wired with all 8 COE Framework algorithm modules.
func NewWritttService(hal domain.CommandRunner, baseDir string) *WritttService {
	if hal == nil {
		hal = nopCommandRunner{}
	}
	if baseDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			home = "."
		}
		baseDir = filepath.Join(home, ".writtt")
	}

	var chSeed [32]byte
	_, _ = rand.Read(chSeed[:])

	svc := &WritttService{
		hal:                 hal,
		baseDir:             baseDir,
		lockManager:         algorithms.NewLockManager(nil),
		rateLimiter:         algorithms.NewGCRA(80, 400),
		authLimiter:         algorithms.NewGCRA(650, 650),
		docCache:            algorithms.NewLRUCache[string, domain.Document](64),
		consoleRing:         algorithms.NewRingBuffer[string](128),
		forensicChain:       algorithms.NewForensicChain("WRITTT_ZERO_KNOWLEDGE_GENESIS_2026"),
		totpReplayWindow:    algorithms.NewReplayWindow(),
		authChallengeReplay: algorithms.NewReplayWindow(),
		latencyCUSUM:        algorithms.NewWelfordCUSUM(8.0, 4.0, 25.0, 0.25),
		authCadenceCUSUM:    algorithms.NewWelfordCUSUM(2400.0, 250.0, 2000.0, 0.3),
		spatialGrid:         algorithms.NewSpatialGrid[string](25.0),
		authChallengeSecret: hex.EncodeToString(chSeed[:]),
		priorityAlias: algorithms.NewAliasTable([]algorithms.AliasEntry[string]{
			{Item: "vault-crypto", Weight: 45, Unique: true},
			{Item: "markdown-studio", Weight: 25, Unique: true},
			{Item: "version-ledger", Weight: 15, Unique: true},
			{Item: "express-rsa", Weight: 15, Unique: true},
		}),
	}

	svc.docCoalescer = algorithms.NewWriteBehindCoalescer(func(batch []algorithms.CoalescedItem) {
		for _, item := range batch {
			if rawBytes, ok := item.Data["bytes"].([]byte); ok {
				_ = svc.hal.WriteFile(item.Key, rawBytes)
			}
		}
	})

	svc.hydrateLockoutFromDisk()
	svc.AppendConsoleAndAudit("system", "writtt.startup", "Writtt v0.2.0 inicializado com motor COE Algorithms (8 modulos ativos) e Cofre Argon2id + AES-256-GCM.")
	return svc
}

// Shutdown flushes any pending coalesced writes and zeroizes all cryptographic keys in RAM.
func (s *WritttService) Shutdown() {
	if s.docCoalescer != nil {
		s.docCoalescer.Flush()
	}
	s.mu.Lock()
	zeroBytes(s.activePassword)
	s.activePassword = nil
	zeroBytes(s.storedVaultKey)
	s.storedVaultKey = nil
	s.appUnlocked = false
	s.docCache = algorithms.NewLRUCache[string, domain.Document](64)
	s.appendAuditLocked("system", "writtt.shutdown", "Writtt encerrado com flush seguro e zeragem de chaves em RAM")
	s.mu.Unlock()
}

// DataDir returns the local directory holding Markdown documents and attachments.
func (s *WritttService) DataDir() string {
	return filepath.Join(s.baseDir, "data")
}

func (s *WritttService) securityFilePath() string {
	return filepath.Join(s.baseDir, "security.json")
}

func (s *WritttService) versionsFilePath(docID string) string {
	return filepath.Join(s.baseDir, "versions", docID+".json")
}

func (s *WritttService) dictionaryFilePath() string {
	return filepath.Join(s.baseDir, "dictionary.json")
}

func (s *WritttService) driveFilePath() string {
	return filepath.Join(s.baseDir, "drive_vault.json")
}

func (s *WritttService) expressFilePath() string {
	return filepath.Join(s.baseDir, "express_inbox.json")
}

// AppendConsoleAndAudit pushes a log entry to the O(1) RingBuffer and appends a SHA-256 block to the ForensicChain.
func (s *WritttService) AppendConsoleAndAudit(resource, eventName, message string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.appendAuditLocked(resource, eventName, message)
}

func (s *WritttService) appendAuditLocked(resource, eventName, message string) string {
	ts := time.Now().Format("15:04:05")
	line := fmt.Sprintf("[%s] [%s] %s", ts, eventName, message)
	s.consoleRing.Push(line)
	hash, _, _ := s.forensicChain.Append(time.Now().UnixMicro(), resource, "writtt-operator", eventName, message)
	return hash
}

func (s *WritttService) observeLatency(start time.Time) {
	ms := float64(time.Since(start).Microseconds()) / 1000.0
	s.mu.Lock()
	s.lastCUSUMObs = s.latencyCUSUM.Observe(ms)
	s.mu.Unlock()
}

// CheckRateLimit enforces GCRA O(1) rate limiting on sensitive operations.
func (s *WritttService) CheckRateLimit(actionKey string, cost int64) error {
	s.mu.Lock()
	allowed, retryMs, violations := s.rateLimiter.Allow(actionKey, time.Now().UnixMilli(), cost)
	s.mu.Unlock()
	if !allowed {
		return fmt.Errorf("rate_limited (%s): aguarde %dms (violacao #%d)", actionKey, retryMs, violations)
	}
	return nil
}

// AcquireDocLock acquires a StripedLockManager guard with a monotonic 64-bit FencingToken.
func (s *WritttService) AcquireDocLock(keys ...string) (*algorithms.LockGuard, error) {
	return s.lockManager.AcquireMulti(keys, 3000, 1)
}

func zeroBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

func generateULID() string {
	t := time.Now()
	entropy := ulid.Monotonic(rand.Reader, 0)
	return ulid.MustNew(ulid.Timestamp(t), entropy).String()
}

// SimulateZKPRound runs an audited Schnorr / Ali Baba Cave Zero-Knowledge Proof verification round.
func (s *WritttService) SimulateZKPRound(round int, challengePath string) domain.ZKPSoundnessProof {
	proof := domain.ComputeZKPRound(round, "WRITTT_SCHNORR_WITNESS_2026", challengePath)
	s.AppendConsoleAndAudit("zkp", "zkp.verify", fmt.Sprintf("Rodada ZKP #%d (%s) verificada (P_fraude=%s)", proof.Round, proof.ChallengePath, proof.CheatingProbability))
	return proof
}

// BuildAlgorithmsReport aggregates live telemetry across all 8 COE Framework modules.
func (s *WritttService) BuildAlgorithmsReport() domain.WritttAlgorithmsReport {
	docs, _ := s.ListDocuments("all", 200)
	dagPlan, cascadePlan := domain.BuildDocumentHierarchyDAG(docs)

	var combined strings.Builder
	for _, d := range docs {
		combined.WriteString(d.Title + " " + d.Snippet + "\n")
	}
	entBits := domain.ComputeStringEntropy(combined.String())

	s.mu.Lock()
	records := s.forensicChain.Records()
	forensicValid := s.forensicChain.Verify()
	lines := s.consoleRing.ToSlice()
	cacheEntries := s.docCache.Size()
	cusumObs := s.lastCUSUMObs
	s.mu.Unlock()

	nearby := s.spatialGrid.QueryRadius(50, 50, 0, 150, 0)
	sampled := s.priorityAlias.SampleBatch(3, nil, nil)

	return domain.WritttAlgorithmsReport{
		DAGPlan:         dagPlan,
		CascadeImpact:   cascadePlan,
		EntropyBits:     entBits,
		EntropyClass:    domain.ClassifyEntropy(entBits),
		CUSUMMeanMs:     cusumObs.Mean,
		CUSUMStdDevMs:   cusumObs.StdDev,
		CUSUMAnomaly:    cusumObs.IsAlarm,
		ForensicRecords: records,
		ForensicValid:   forensicValid,
		ConsoleLines:    lines,
		CacheEntries:    cacheEntries,
		SpatialNodes:    len(nearby),
		SampledDocIDs:   sampled,
	}
}
