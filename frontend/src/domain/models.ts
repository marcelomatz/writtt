/**
 * Layer 1 — Pure Domain Models & Value Contracts (Writtt Studio & Zero-Knowledge Vault)
 * Zero dependencies on DOM, localStorage, network, or Wails runtime.
 */

export type AppViewMode = "home" | "editor" | "settings" | "help";

export type EditorViewMode = "rich" | "markdown" | "dual";

export type EditorialInspectorTab = "outline" | "history" | "export";

export type AIStudioTab = "chatbot" | "editorial" | "rag";

export type AIStudioPlacement = "docked" | "floating";

export interface ChatbotContextExcerpt {
  id: string;
  turnIndex: number;
  userPrompt?: string;
  assistantReply: string;
  preview: string;
}

export type SettingsTabId =
  | "appearance"
  | "security"
  | "drive"
  | "express"
  | "dictionary"
  | "audit";

export type HelpTopicId =
  | "overview"
  | "editor"
  | "chapters"
  | "vault"
  | "ai"
  | "publish"
  | "shortcuts";

export type WritttWorkstationTab =
  | "studio"
  | "outline-versions"
  | "vault-security"
  | "drive-export"
  | "express-zkp"
  | "ai-algorithms";

export type DocFilterMode = "all" | "vault" | "split";

export interface Frontmatter {
  id: string;
  type: string;
  title?: string;
  tags: string[];
  is_vault: boolean;
  encrypted: boolean;
  created_at?: string;
  updated_at?: string;
  parent_id?: string;
  doc_type?: string;
  version?: number;
  sort_order?: number;
}

export interface Document {
  frontmatter: Frontmatter;
  content: string;
  raw?: string;
}

export interface ActiveEditorDoc {
  id: string;
  title: string;
  content: string;
  tags: string[];
  is_vault: boolean;
  encrypted: boolean;
  parent_id: string;
  doc_type: string;
  version: number;
  sort_order: number;
}

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  snippet: string;
  tags: string[];
  is_vault: boolean;
  updated_at: string;
  parent_id?: string;
  doc_type?: string;
  sort_order?: number;
  version?: number;
}

export interface DocumentTreeNode {
  doc: SearchResult;
  children: DocumentTreeNode[];
  depth: number;
}

export interface SplitDocResult {
  split_id: string;
  original_content: string;
}

export interface DocumentVersion {
  id: string;
  docId: string;
  version: number;
  title: string;
  content?: string;
  encrypted: boolean;
  createdAt: string;
  sha256: string;
}

export interface VersionDiffReport {
  docId: string;
  fromVersion: number;
  toVersion: number;
  unifiedPatch: string;
  additions: number;
  deletions: number;
}

export interface ChapterHeading {
  id: string;
  level: number;
  text: string;
  line: number;
  wordCount: number;
}

export interface DocumentStats {
  words: number;
  chars: number;
  lines: number;
  paragraphs: number;
  readMinutes: number;
  chapterCount: number;
  codeBlockCount: number;
  taskTotal: number;
  taskCompleted: number;
  entropyBits: number;
  entropyClass: string;
  secretAlerts: number;
  contentHashHex: string;
}

export interface SecurityConfigDTO {
  password_enabled: boolean;
  vault_pin_enabled: boolean;
  vault_pin_ready?: boolean;
  vault_unlocked: boolean;
  app_unlocked: boolean;
  totp_enabled: boolean;
  recovery_configured: boolean;
  rsa_fingerprint: string;
  rsa_public_key_pem: string;
  brute_force_locked: boolean;
  brute_force_retry_sec: number;
  human_hold_required?: boolean;
  kdf_spec: string;
  backup_codes_left: number;
}

export interface AuthChallengeDTO {
  challengeId: number;
  nonce: string;
  issuedAtMs: number;
  minElapsedMs: number;
  requireHold: boolean;
  holdMinMs: number;
  holdMaxMs: number;
  signature: string;
}

export interface HumanTelemetryProof {
  challengeId: number;
  nonce: string;
  issuedAtMs: number;
  minElapsedMs: number;
  requireHold: boolean;
  holdMinMs: number;
  holdMaxMs: number;
  signature: string;
  trustedKeystrokes: number;
  untrustedEvents: number;
  pasteDetected: boolean;
  meanFlightMs: number;
  stdDevFlightMs: number;
  meanDwellMs: number;
  pointerMoves: number;
  holdCompleted: boolean;
  holdDurationMs: number;
  holdTrusted: boolean;
}

export interface HumanUnlockRequest {
  mode: "password" | "pin" | "vault-password" | "vault-pin";
  secret: string;
  totpCode?: string;
  proof: HumanTelemetryProof;
}

export interface HumanUnlockResult {
  unlocked: boolean;
  locked: boolean;
  retrySec: number;
  requireHold: boolean;
}

export interface TOTPEnrollmentBundle {
  secret_base32: string;
  otpauth_uri: string;
  backup_codes: string[];
}

export interface ExpressMessageDTO {
  id: string;
  senderAlias: string;
  recipientFingerprint: string;
  subject: string;
  decryptedBody?: string;
  contentSha256: string;
  createdAt: string;
  read: boolean;
  sealed: boolean;
}

export interface DriveVaultFile {
  id: string;
  filename: string;
  mimeType: string;
  category: string;
  sizeOriginal: number;
  sizeEncrypted: number;
  createdAt: string;
  algorithm: string;
  kdf: string;
  saltHex: string;
  nonceHex: string;
  overheadBytes: number;
  sha256Hex: string;
  entropyBits: number;
  entropyClass: string;
  status: string;
}

export interface ExportBundleResult {
  format: string;
  filename: string;
  savedPath: string;
  sizeBytes: number;
  sha256Hex: string;
  base64Data: string;
  description: string;
}

export interface ZKPSoundnessProof {
  round: number;
  commitmentHex: string;
  challengePath: string;
  responseHex: string;
  verified: boolean;
  soundnessConfidence: number;
  cheatingProbability: string;
}

export interface ForensicRecord {
  sequence: number;
  timestampUs: number;
  resource: string;
  actorId: string;
  eventName: string;
  canonicalPayload: string;
  prevHash: string;
  currentHash: string;
}

export interface WritttAlgorithmsReport {
  dagPlan: {
    bootOrder: string[];
    parallelWaves: string[][];
    cycleNodes: string[] | null;
    dependencies: Record<string, string[]>;
  };
  cascadeImpact: {
    targetNode: string;
    stopOrder: string[];
    startOrder: string[];
    cycleNodes: string[] | null;
  };
  entropyBits: number;
  entropyClass: string;
  cusumMeanMs: number;
  cusumStdDevMs: number;
  cusumAnomaly: boolean;
  forensicRecords: ForensicRecord[];
  forensicValid: boolean;
  consoleLines: string[];
  cacheEntries: number;
  spatialNodes: number;
  sampledDocIds: string[];
}

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  tool: "pen" | "line" | "rect" | "circle";
  color: string;
  width: number;
  points: DrawingPoint[];
}

export interface SlashCommandItem {
  id: string;
  label: string;
  shortcut: string;
  description: string;
  snippet: string;
}

export interface BreadcrumbItem {
  id: string;
  title: string;
  parent_id: string;
}

export interface RAGSearchResult {
  docId: string;
  docTitle: string;
  chunkIdx: number;
  heading: string;
  snippet: string;
  similarity: number;
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
  opinion?: string;
  insertableContent?: string;
  hasInsertable?: boolean;
  redactedCount?: number;
  ragChunksUsed?: number;
  appliedAt?: string;
  appliedMode?: "replace" | "insert";
}

export interface AIChatReplyDTO {
  raw: string;
  opinion: string;
  insertableContent: string;
  hasInsertable: boolean;
  redactedCount: number;
  ragChunksUsed: number;
  sandboxIsolated: boolean;
  sessionId?: string;
}

export interface AIModelCapabilityDTO {
  name: string;
  family: string;
  supportsChat: boolean;
}

export type AIAssistantMode = "editorial" | "chatbot";

export interface AIConversationSession {
  id: string;
  docId: string;
  title: string;
  source: "chat" | "inline" | "chatbot";
  updatedAt: string;
  messages: AIChatMessage[];
}

export interface TrustedDeviceDTO {
  id: string;
  label: string;
  platform: string;
  fingerprint: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface AliasConfigDTO {
  alias: string;
  changeCount: number;
  penaltyDays: number;
  lastChangedAt: string;
  nextAllowedAt: string;
  canChangeNow: boolean;
  remainingHours: number;
}

export interface AuthorshipProofDTO {
  docId: string;
  title: string;
  authorAlias: string;
  version: number;
  wordCount: number;
  charCount: number;
  contentSha256: string;
  forensicHash: string;
  forensicSequence: number;
  encryptedInVault: boolean;
  issuedAt: string;
  certificateText: string;
}

export type EditorFontFamily = "serif" | "sans" | "mono";
export type EditorPageWidth = "focused" | "comfortable" | "wide";

export interface EditorialPreferences {
  fontFamily: EditorFontFamily;
  fontSize: number;
  pageWidth: EditorPageWidth;
  brightness: number;
  focusMode: boolean;
  autoSave: boolean;
  autoLockMinutes: number;
  wordGoal: number;
  showHomeHeader?: boolean;
  showHomeCapabilities?: boolean;
  checkUpdatesAutomatically?: boolean;
}

export interface ReleaseUpdateDTO {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  releaseUrl: string;
  publishedAt?: string;
  summary?: string;
}
