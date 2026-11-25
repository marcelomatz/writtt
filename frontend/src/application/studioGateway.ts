/**
 * Layer 2 — Application Gateway Port (Dependency Inversion Boundary)
 * Defines the pure TypeScript contract between Presentation/Application use-cases
 * and Layer 3 Infrastructure Adapters (`adapters/ipcAdapter.ts`), wired at the
 * Composition Root (`main.ts`) so neither Layer 2 nor Layer 4 ever imports Layer 3.
 */
import {
  AIChatMessage,
  AIChatReplyDTO,
  AIModelCapabilityDTO,
  AliasConfigDTO,
  AuthChallengeDTO,
  AuthorshipProofDTO,
  BreadcrumbItem,
  Document,
  DocumentVersion,
  DriveVaultFile,
  ExportBundleResult,
  ExpressMessageDTO,
  HumanUnlockRequest,
  HumanUnlockResult,
  RAGSearchResult,
  ReleaseUpdateDTO,
  SearchResult,
  SecurityConfigDTO,
  SplitDocResult,
  TOTPEnrollmentBundle,
  TrustedDeviceDTO,
  VersionDiffReport,
  WritttAlgorithmsReport,
  ZKPSoundnessProof,
} from "../domain";

export interface StudioGatewayPort {
  invalidateCache(id?: string): void;
  getVersion(): Promise<string>;
  checkForUpdates(): Promise<ReleaseUpdateDTO>;
  openExternalUrl(url: string): Promise<void>;
  openDetachedAIWindow(): Promise<boolean>;
  closeDetachedAIWindow(redockInMain?: boolean): Promise<void>;
  setDetachedAIAlwaysOnTop(pinned: boolean): Promise<void>;
  setActiveEditorBridgeDoc(docId: string): Promise<void>;
  getActiveEditorBridgeDoc(): Promise<string>;
  insertFromDetachedAIWindow(text: string): Promise<void>;
  listDocuments(filter?: string, limit?: number): Promise<SearchResult[]>;
  search(query: string): Promise<SearchResult[]>;
  readDocument(id: string, bypassCache?: boolean): Promise<Document>;
  saveDocument(doc: Document): Promise<string>;
  autoSaveDocument(doc: Document): Promise<string>;
  importDocumentContent(filename: string, content: string, isVault?: boolean): Promise<string>;
  generateAuthorshipProof(docId: string): Promise<AuthorshipProofDTO>;
  setWindowTitle(title: string): Promise<void>;
  saveExportArtifactDialog(docId: string, format: "epub" | "html" | "md"): Promise<string>;
  exportWritttPackDialog(packName: string, passphrase: string): Promise<string>;
  importWritttPackDialog(passphrase: string): Promise<number>;
  importDocumentDialog(isVault?: boolean): Promise<string>;
  uploadDriveFileDialog(): Promise<DriveVaultFile | null>;
  saveDecryptedDriveFileDialog(id: string): Promise<string>;
  deleteDocument(id: string): Promise<void>;
  updateMetadata(id: string, tags: string[], isVault: boolean): Promise<void>;
  renameDocument(id: string, newTitle: string): Promise<void>;
  moveDocument(id: string, parentId: string, sortOrder: number): Promise<void>;
  reorderDocuments(parentId: string, orderedIds: string[]): Promise<void>;
  getDocumentBreadcrumbs(id: string): Promise<BreadcrumbItem[]>;
  createSplitDoc(parentId: string, title: string): Promise<SplitDocResult>;
  createSubChapter(parentId: string, title: string): Promise<Document>;
  appendSubChapterToParent(subChapterId: string): Promise<Document>;
  duplicateDocument(sourceId: string, newTitle?: string): Promise<Document>;
  listChildren(parentId: string): Promise<SearchResult[]>;
  mergeToParent(parentId: string, mergedContent: string): Promise<void>;
  saveAttachment(filename: string, base64Data: string): Promise<string>;
  listDocumentVersions(docId: string): Promise<DocumentVersion[]>;
  restoreDocumentVersion(docId: string, version: number): Promise<Document>;
  diffDocumentVersions(docId: string, fromVersion: number, toVersion: number): Promise<VersionDiffReport>;
  getSecurityConfig(): Promise<SecurityConfigDTO>;
  setPassword(currentPassword: string, newPassword: string): Promise<void>;
  removePassword(currentPassword: string): Promise<void>;
  unlockVault(password: string): Promise<boolean>;
  unlockApp(password: string): Promise<boolean>;
  beginAuthChallenge(): Promise<AuthChallengeDTO>;
  unlockWithHumanProof(req: HumanUnlockRequest): Promise<HumanUnlockResult>;
  lockVault(): Promise<void>;
  lockApp(): Promise<void>;
  isVaultUnlocked(): Promise<boolean>;
  setVaultPIN(currentPassword: string, pin: string): Promise<void>;
  removeVaultPIN(currentPassword: string): Promise<void>;
  unlockVaultWithPIN(pin: string): Promise<boolean>;
  generateRecoveryKey(currentPassword: string): Promise<string>;
  recoverVaultWithKey(recoveryKeyFormatted: string, newPassword: string): Promise<void>;
  setupVaultTOTP(currentPassword: string): Promise<TOTPEnrollmentBundle>;
  enableVaultTOTP(currentPassword: string, code: string): Promise<void>;
  verifyVaultTOTP(code: string): Promise<boolean>;
  disableVaultTOTP(currentPassword: string): Promise<void>;
  sendExpressEnvelope(
    senderAlias: string,
    subject: string,
    body: string,
    recipientPubKeyPEM?: string
  ): Promise<ExpressMessageDTO>;
  listExpressInbox(): Promise<ExpressMessageDTO[]>;
  unsealExpressMessage(id: string): Promise<ExpressMessageDTO>;
  deleteExpressMessage(id: string): Promise<void>;
  uploadDriveVaultFile(filename: string, mimeType: string, base64Data: string): Promise<DriveVaultFile>;
  listDriveVaultFiles(): Promise<DriveVaultFile[]>;
  decryptDriveVaultFile(id: string): Promise<string>;
  decryptDriveVaultFileBase64(id: string): Promise<string>;
  deleteDriveVaultFile(id: string): Promise<void>;
  exportWritttPack(packName: string, passphrase: string): Promise<ExportBundleResult>;
  importWritttPack(base64Pack: string, passphrase: string): Promise<number>;
  exportDocumentArtifact(docId: string, format: "epub" | "html" | "md"): Promise<ExportBundleResult>;
  getCustomDictionary(): Promise<string[]>;
  addDictionaryWord(word: string): Promise<string[]>;
  removeDictionaryWord(word: string): Promise<string[]>;
  scanLocalAI(): Promise<boolean>;
  getLocalModels(): Promise<string[]>;
  getLocalModelCapabilities(): Promise<AIModelCapabilityDTO[]>;
  askAssistant(model: string, prompt: string, contextStr: string): Promise<string>;
  chatWithAssistant(
    model: string,
    history: AIChatMessage[],
    docContext: string,
    selectedExcerpt?: string,
    useRAG?: boolean
  ): Promise<AIChatReplyDTO>;
  freeChatWithAssistant(
    model: string,
    history: AIChatMessage[],
    includeDocContext?: boolean,
    docContext?: string,
    useRAG?: boolean
  ): Promise<AIChatReplyDTO>;
  searchWorkspaceRAG(query: string, topK?: number): Promise<RAGSearchResult[]>;
  listTrustedDevices(): Promise<TrustedDeviceDTO[]>;
  registerTrustedDevice(label: string): Promise<TrustedDeviceDTO>;
  revokeTrustedDevice(id: string): Promise<TrustedDeviceDTO[]>;
  getOperatorAlias(): Promise<AliasConfigDTO>;
  setOperatorAlias(alias: string): Promise<AliasConfigDTO>;
  simulateZKPRound(round: number, challengePath: string): Promise<ZKPSoundnessProof>;
  getAlgorithmsLabReport(): Promise<WritttAlgorithmsReport>;
}

let boundAdapter: StudioGatewayPort | null = null;

export function bindStudioGatewayAdapter(adapter: StudioGatewayPort): void {
  boundAdapter = adapter;
}

export const StudioGateway: StudioGatewayPort = new Proxy({} as StudioGatewayPort, {
  get(_target, prop: keyof StudioGatewayPort) {
    if (!boundAdapter) {
      throw new Error(`StudioGatewayPort not initialized before calling ${String(prop)}`);
    }
    const fn = boundAdapter[prop];
    return typeof fn === "function" ? fn.bind(boundAdapter) : fn;
  },
});
