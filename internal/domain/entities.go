// Package domain implements Layer 1 (Pure Domain) of Writtt following the COE Framework standard.
// Zero dependencies on operating system I/O, SQLite, networking, or Wails runtime.
package domain

import (
	"time"

	"github.com/marcelomatz/matz-core/algorithms"
	"github.com/marcelomatz/matz-core/diff"
)

// Frontmatter represents the YAML header of a Markdown document.
type Frontmatter struct {
	ID        string    `yaml:"id" json:"id"`
	Type      string    `yaml:"type" json:"type"`
	Title     string    `yaml:"title" json:"title"`
	CreatedAt time.Time `yaml:"created_at" json:"created_at,omitempty"`
	UpdatedAt time.Time `yaml:"updated_at" json:"updated_at,omitempty"`
	Tags      []string  `yaml:"tags" json:"tags"`
	IsVault   bool      `yaml:"is_vault" json:"is_vault"`
	Encrypted bool      `yaml:"encrypted,omitempty" json:"encrypted,omitempty"`
	Version   int       `yaml:"version" json:"version"`
	ParentID  string    `yaml:"parent_id,omitempty" json:"parent_id,omitempty"`
	DocType   string    `yaml:"doc_type,omitempty" json:"doc_type,omitempty"`
	SortOrder int       `yaml:"sort_order,omitempty" json:"sort_order,omitempty"`
}

// Document represents a fully loaded document in the Writtt Studio.
type Document struct {
	Frontmatter Frontmatter `json:"frontmatter"`
	Content     string      `json:"content"`
	Raw         string      `json:"raw"`
}

// SearchResult represents an indexed document item returned from FTS5 or tree queries.
type SearchResult struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Snippet   string    `json:"snippet"`
	Tags      []string  `json:"tags"`
	IsVault   bool      `json:"is_vault"`
	UpdatedAt time.Time `json:"updated_at"`
	ParentID  string    `json:"parent_id,omitempty"`
	DocType   string    `json:"doc_type,omitempty"`
	SortOrder int       `json:"sort_order,omitempty"`
	Version   int       `json:"version,omitempty"`
}

// SplitDocResult represents the response when splitting a chapter into a sub-document.
type SplitDocResult struct {
	SplitID         string `json:"split_id"`
	OriginalContent string `json:"original_content"`
}

// DocumentVersion represents an immutable snapshot in the document version ledger.
type DocumentVersion struct {
	ID        string `json:"id"`
	DocID     string `json:"docId"`
	Version   int    `json:"version"`
	Title     string `json:"title"`
	Content   string `json:"content,omitempty"`
	Encrypted bool   `json:"encrypted"`
	CreatedAt string `json:"createdAt"`
	SHA256    string `json:"sha256"`
}

// VersionDiffReport holds the Unified Diff and line statistics between two document versions.
type VersionDiffReport struct {
	DocID        string          `json:"docId"`
	FromVersion  int             `json:"fromVersion"`
	ToVersion    int             `json:"toVersion"`
	UnifiedPatch string          `json:"unifiedPatch"`
	Additions    int             `json:"additions"`
	Deletions    int             `json:"deletions"`
	Lines        []diff.DiffLine `json:"lines"`
}

// ChapterHeading represents an extracted H1/H2/H3 outline section with word count.
type ChapterHeading struct {
	ID        string `json:"id"`
	Level     int    `json:"level"`
	Text      string `json:"text"`
	Line      int    `json:"line"`
	WordCount int    `json:"wordCount"`
}

// DocumentStats holds deterministic editorial and cryptographic metrics for a document.
type DocumentStats struct {
	Words            int     `json:"words"`
	Chars            int     `json:"chars"`
	Lines            int     `json:"lines"`
	Paragraphs       int     `json:"paragraphs"`
	ReadMinutes      int     `json:"readMinutes"`
	ChapterCount     int     `json:"chapterCount"`
	CodeBlockCount   int     `json:"codeBlockCount"`
	TaskTotal        int     `json:"taskTotal"`
	TaskCompleted    int     `json:"taskCompleted"`
	EntropyBits      float64 `json:"entropyBits"`
	EntropyClass     string  `json:"entropyClass"`
	SecretAlerts     int     `json:"secretAlerts"`
	ContentSHA256Hex string  `json:"contentSha256Hex"`
}

// SecurityConfigDTO exposes complete security & cryptographic state to the frontend without leaking hashes.
type SecurityConfigDTO struct {
	PasswordEnabled    bool   `json:"password_enabled"`
	VaultPINEnabled    bool   `json:"vault_pin_enabled"`
	VaultPINReady      bool   `json:"vault_pin_ready"`
	VaultUnlocked      bool   `json:"vault_unlocked"`
	AppUnlocked        bool   `json:"app_unlocked"`
	TOTPEnabled        bool   `json:"totp_enabled"`
	RecoveryConfigured bool   `json:"recovery_configured"`
	RSAFingerprint     string `json:"rsa_fingerprint"`
	RSAPublicKeyPEM    string `json:"rsa_public_key_pem"`
	BruteForceLocked   bool   `json:"brute_force_locked"`
	BruteForceRetrySec int    `json:"brute_force_retry_sec"`
	HumanHoldRequired  bool   `json:"human_hold_required"`
	KDFSpec            string `json:"kdf_spec"`
	BackupCodesLeft    int    `json:"backup_codes_left"`
}

// AuthChallengeDTO represents a single-use HMAC-signed human-presence challenge for unlock verification.
type AuthChallengeDTO struct {
	ChallengeID  uint64 `json:"challengeId"`
	Nonce        string `json:"nonce"`
	IssuedAtMs   int64  `json:"issuedAtMs"`
	MinElapsedMs int64  `json:"minElapsedMs"`
	RequireHold  bool   `json:"requireHold"`
	HoldMinMs    int64  `json:"holdMinMs"`
	HoldMaxMs    int64  `json:"holdMaxMs"`
	Signature    string `json:"signature"`
}

// HumanTelemetryProof carries signed challenge parameters and client-side input kinematics to defeat scripts.
type HumanTelemetryProof struct {
	ChallengeID       uint64  `json:"challengeId"`
	Nonce             string  `json:"nonce"`
	IssuedAtMs        int64   `json:"issuedAtMs"`
	MinElapsedMs      int64   `json:"minElapsedMs"`
	RequireHold       bool    `json:"requireHold"`
	HoldMinMs         int64   `json:"holdMinMs"`
	HoldMaxMs         int64   `json:"holdMaxMs"`
	Signature         string  `json:"signature"`
	TrustedKeystrokes int     `json:"trustedKeystrokes"`
	UntrustedEvents   int     `json:"untrustedEvents"`
	PasteDetected     bool    `json:"pasteDetected"`
	MeanFlightMs      float64 `json:"meanFlightMs"`
	StdDevFlightMs    float64 `json:"stdDevFlightMs"`
	MeanDwellMs       float64 `json:"meanDwellMs"`
	PointerMoves      int     `json:"pointerMoves"`
	HoldCompleted     bool    `json:"holdCompleted"`
	HoldDurationMs    int64   `json:"holdDurationMs"`
	HoldTrusted       bool    `json:"holdTrusted"`
}

// HumanUnlockRequest encapsulates an atomic credential + optional 2FA + human-presence unlock attempt.
type HumanUnlockRequest struct {
	Mode     string              `json:"mode"` // "password" | "pin" | "vault-password" | "vault-pin"
	Secret   string              `json:"secret"`
	TOTPCode string              `json:"totpCode,omitempty"`
	Proof    HumanTelemetryProof `json:"proof"`
}

// HumanUnlockResult returns uniform zero-hint unlock state and active cooldown seconds.
type HumanUnlockResult struct {
	Unlocked    bool `json:"unlocked"`
	Locked      bool `json:"locked"`
	RetrySec    int  `json:"retrySec"`
	RequireHold bool `json:"requireHold"`
}

// TOTPEnrollmentBundle is returned when initializing TOTP 2FA setup.
type TOTPEnrollmentBundle struct {
	SecretBase32 string   `json:"secret_base32"`
	OTPAuthURI   string   `json:"otpauth_uri"`
	BackupCodes  []string `json:"backup_codes"`
}

// DriveVaultFile represents an encrypted file stored in the local E2EE Drive Vault with full cryptographic telemetry.
type DriveVaultFile struct {
	ID            string  `json:"id"`
	Filename      string  `json:"filename"`
	MimeType      string  `json:"mimeType"`
	Category      string  `json:"category"`
	SizeOriginal  int     `json:"sizeOriginal"`
	SizeEncrypted int     `json:"sizeEncrypted"`
	CreatedAt     string  `json:"createdAt"`
	Algorithm     string  `json:"algorithm"`
	KDF           string  `json:"kdf"`
	SaltHex       string  `json:"saltHex"`
	NonceHex      string  `json:"nonceHex"`
	OverheadBytes int     `json:"overheadBytes"`
	SHA256Hex     string  `json:"sha256Hex"`
	EntropyBits   float64 `json:"entropyBits"`
	EntropyClass  string  `json:"entropyClass"`
	Status        string  `json:"status"`
}

// ExpressMessageDTO represents a zero-knowledge RSA-2048 OAEP + AES-256-GCM message in Writtt Express.
type ExpressMessageDTO struct {
	ID                   string `json:"id"`
	SenderAlias          string `json:"senderAlias"`
	RecipientFingerprint string `json:"recipientFingerprint"`
	Subject              string `json:"subject"`
	DecryptedBody        string `json:"decryptedBody"`
	ContentSHA256        string `json:"contentSha256"`
	CreatedAt            string `json:"createdAt"`
	Read                 bool   `json:"read"`
	Sealed               bool   `json:"sealed"`
}

// ZKPSoundnessProof represents a round of the Zero-Knowledge Proof interactive verifier.
type ZKPSoundnessProof struct {
	Round               int     `json:"round"`
	Successes           int     `json:"successes"`
	CheatingProbability string  `json:"cheatingProbability"`
	SoundnessBits       int     `json:"soundnessBits"`
	ChallengePath       string  `json:"challengePath"`
	CommitmentHex       string  `json:"commitmentHex"`
	ResponseHex         string  `json:"responseHex"`
	Verified            bool    `json:"verified"`
	ProbabilityFloat    float64 `json:"probabilityFloat"`
	SoundnessConfidence float64 `json:"soundnessConfidence"`
}

// ExportBundleResult represents a generated .writttpack, .epub, .html or .md export artifact.
type ExportBundleResult struct {
	Format      string `json:"format"`
	Filename    string `json:"filename"`
	SavedPath   string `json:"savedPath"`
	SizeBytes   int    `json:"sizeBytes"`
	SHA256Hex   string `json:"sha256Hex"`
	Base64Data  string `json:"base64Data"`
	Description string `json:"description"`
}

// DocumentDAGPlan holds the Kahn topological sort and parallel waves for the document hierarchy.
type DocumentDAGPlan struct {
	Order         []string            `json:"order"`
	Waves         [][]string          `json:"waves"`
	BootOrder     []string            `json:"bootOrder"`
	ParallelWaves [][]string          `json:"parallelWaves"`
	Dependencies  map[string][]string `json:"dependencies"`
	CycleNodes    []string            `json:"cycleNodes"`
	HasCycle      bool                `json:"hasCycle"`
}

// DocumentCascadePlan holds the reverse stop and forward restart cascade plan.
type DocumentCascadePlan struct {
	TargetNode    string   `json:"targetNode"`
	StopOrder     []string `json:"stopOrder"`
	StartOrder    []string `json:"startOrder"`
	AffectedOrder []string `json:"affectedOrder"`
	CycleNodes    []string `json:"cycleNodes"`
}

// WritttAlgorithmsReport exposes live telemetry from all 8 COE Framework algorithm modules.
type WritttAlgorithmsReport struct {
	DAGPlan         DocumentDAGPlan             `json:"dagPlan"`
	CascadeImpact   DocumentCascadePlan         `json:"cascadeImpact"`
	EntropyBits     float64                     `json:"entropyBits"`
	EntropyClass    string                      `json:"entropyClass"`
	CUSUMMeanMs     float64                     `json:"cusumMeanMs"`
	CUSUMStdDevMs   float64                     `json:"cusumStdDevMs"`
	CUSUMAnomaly    bool                        `json:"cusumAnomaly"`
	ForensicRecords []algorithms.ForensicRecord `json:"forensicRecords"`
	ForensicValid   bool                        `json:"forensicValid"`
	ConsoleLines    []string                    `json:"consoleLines"`
	CacheEntries    int                         `json:"cacheEntries"`
	SpatialNodes    int                         `json:"spatialNodes"`
	SampledDocIDs   []string                    `json:"sampledDocIds"`
}

// BreadcrumbItem represents an ancestor node in a document's hierarchical path.
type BreadcrumbItem struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	ParentID string `json:"parent_id"`
}

// RAGChunk represents a semantic chunk of an unlocked Markdown document indexed for local RAG retrieval.
type RAGChunk struct {
	DocID     string             `json:"docId"`
	DocTitle  string             `json:"docTitle"`
	ChunkIdx  int                `json:"chunkIdx"`
	Heading   string             `json:"heading"`
	Content   string             `json:"content"`
	TokenFreq map[string]float64 `json:"tokenFreq"`
}

// RAGSearchResult represents a ranked semantic match from the local Zero-Knowledge RAG engine.
type RAGSearchResult struct {
	DocID      string  `json:"docId"`
	DocTitle   string  `json:"docTitle"`
	ChunkIdx   int     `json:"chunkIdx"`
	Heading    string  `json:"heading"`
	Snippet    string  `snippet:"snippet" json:"snippet"`
	Similarity float64 `json:"similarity"`
}

// TrustedDeviceDTO represents an authorized device fingerprint in the Device-Aware Vault registry.
type TrustedDeviceDTO struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Platform    string `json:"platform"`
	Fingerprint string `json:"fingerprint"`
	CreatedAt   string `json:"createdAt"`
	LastSeenAt  string `json:"lastSeenAt"`
	Current     bool   `json:"current"`
}

// AliasConfigDTO represents the operator's public Writtt Express @alias and iterative cooldown state.
type AliasConfigDTO struct {
	Alias          string `json:"alias"`
	ChangeCount    int    `json:"changeCount"`
	PenaltyDays    int    `json:"penaltyDays"`
	LastChangedAt  string `json:"lastChangedAt"`
	NextAllowedAt  string `json:"nextAllowedAt"`
	CanChangeNow   bool   `json:"canChangeNow"`
	RemainingHours int    `json:"remainingHours"`
}

// AuthorshipProofDTO represents a cryptographic pre-publication proof of existence & authorship.
type AuthorshipProofDTO struct {
	DocID            string `json:"docId"`
	Title            string `json:"title"`
	AuthorAlias      string `json:"authorAlias"`
	Version          int    `json:"version"`
	WordCount        int    `json:"wordCount"`
	CharCount        int    `json:"charCount"`
	ContentSHA256    string `json:"contentSha256"`
	ForensicHash     string `json:"forensicHash"`
	ForensicSequence int    `json:"forensicSequence"`
	EncryptedInVault bool   `json:"encryptedInVault"`
	IssuedAtRFC3339  string `json:"issuedAt"`
	CertificateText  string `json:"certificateText"`
}

// AIChatMessage represents a single turn in the isolated Writtt editorial AI chat.
type AIChatMessage struct {
	Role    string `json:"role"` // "user" | "assistant" | "system"
	Content string `json:"content"`
}

// AIChatReplyDTO separates the AI's editorial opinion/commentary from the clean deliverable
// content that can be inserted or substituted directly into the user's manuscript.
type AIChatReplyDTO struct {
	Raw               string `json:"raw"`
	Opinion           string `json:"opinion"`
	InsertableContent string `json:"insertableContent"`
	HasInsertable     bool   `json:"hasInsertable"`
	RedactedCount     int    `json:"redactedCount"`
	RAGChunksUsed     int    `json:"ragChunksUsed"`
	SandboxIsolated   bool   `json:"sandboxIsolated"`
}

// AIModelCapabilityDTO describes an installed local Ollama model and whether it supports conversational chat.
type AIModelCapabilityDTO struct {
	Name         string `json:"name"`
	Family       string `json:"family"`
	SupportsChat bool   `json:"supportsChat"`
}

// OllamaChatMessage represents a low-level message turn exchanged with a local Ollama model.
type OllamaChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ReleaseUpdateDTO carries anonymous version-check metadata to notify users when a newer Writtt release is available.
type ReleaseUpdateDTO struct {
	HasUpdate      bool   `json:"hasUpdate"`
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	DownloadURL    string `json:"downloadUrl"`
	ReleaseURL     string `json:"releaseUrl"`
	PublishedAt    string `json:"publishedAt,omitempty"`
	Summary        string `json:"summary,omitempty"`
}
