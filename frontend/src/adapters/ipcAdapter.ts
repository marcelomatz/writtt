/**
 * Camada 3 — Adaptador de Plataforma / IPC HAL (Writtt Studio & Zero-Knowledge Vault)
 * Isola toda comunicacao Wails v3 (Call.ByName) com fallback transparente para /api/writtt/invoke
 * e integra LRUCache (@matz/ui/algorithms) para leituras O(1).
 */
import { Browser, Call } from "@wailsio/runtime";
import { LRUCache } from "@matz/ui";
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

const SERVICE = "main.App";
let docClientCache = new LRUCache<string, Document>(32);

function resetClientCache(): void {
  docClientCache = new LRUCache<string, Document>(32);
}

async function invokeBackend<T>(method: string, ...args: unknown[]): Promise<T> {
  try {
    const res = await Call.ByName(`${SERVICE}.${method}`, ...args);
    return res as T;
  } catch (wailsErr) {
    // Transparent HTTP fallback (/api/writtt/invoke) per Rule #9
    try {
      const httpRes = await fetch("/api/writtt/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, args }),
      });
      const payload = await httpRes.json();
      if (!httpRes.ok || payload.error) {
        throw new Error(payload.error || `HTTP ${httpRes.status}`);
      }
      return payload.result as T;
    } catch {
      throw wailsErr;
    }
  }
}

export const WritttIPC = {
  invalidateCache(id?: string): void {
    if (id) {
      docClientCache.invalidate(id);
    } else {
      resetClientCache();
    }
  },

  async getVersion(): Promise<string> {
    return await invokeBackend<string>("GetVersion");
  },

  async checkForUpdates(): Promise<ReleaseUpdateDTO> {
    try {
      return await invokeBackend<ReleaseUpdateDTO>("CheckForUpdates");
    } catch {
      return {
        hasUpdate: false,
        currentVersion: "0.2.0",
        latestVersion: "0.2.0",
        downloadUrl: "https://www.writtt.com/#download",
        releaseUrl: "https://github.com/marcelomatz/writtt/releases/latest",
      };
    }
  },

  async openExternalUrl(url: string): Promise<void> {
    const clean = (url || "").trim();
    if (!clean.startsWith("https://")) return;
    try {
      await Browser.OpenURL(clean);
    } catch {
      window.open(clean, "_blank", "noopener,noreferrer");
    }
  },

  async openDetachedAIWindow(): Promise<boolean> {
    try {
      return Boolean(await invokeBackend<boolean>("OpenDetachedAIWindow"));
    } catch {
      return false;
    }
  },

  async closeDetachedAIWindow(redockInMain = false): Promise<void> {
    try {
      await invokeBackend<void>("CloseDetachedAIWindow", redockInMain);
    } catch {
      // ignore
    }
  },

  async setDetachedAIAlwaysOnTop(pinned: boolean): Promise<void> {
    try {
      await invokeBackend<void>("SetDetachedAIAlwaysOnTop", pinned);
    } catch {
      // ignore
    }
  },

  async setActiveEditorBridgeDoc(docId: string): Promise<void> {
    try {
      await invokeBackend<void>("SetActiveEditorBridgeDoc", docId);
    } catch {
      // ignore
    }
  },

  async getActiveEditorBridgeDoc(): Promise<string> {
    try {
      return (await invokeBackend<string>("GetActiveEditorBridgeDoc")) || "";
    } catch {
      return "";
    }
  },

  async insertFromDetachedAIWindow(text: string): Promise<void> {
    await invokeBackend<void>("InsertFromDetachedAIWindow", text);
  },

  // ── Document Studio CRUD, Hierarchy & Split-Screen ───────────────────────

  async listDocuments(filter = "all", limit = 150): Promise<SearchResult[]> {
    const list = await invokeBackend<SearchResult[]>("ListDocuments", filter, limit);
    return Array.isArray(list) ? list : [];
  },

  async search(query: string): Promise<SearchResult[]> {
    const list = await invokeBackend<SearchResult[]>("Search", query);
    return Array.isArray(list) ? list : [];
  },

  async readDocument(id: string, bypassCache = false): Promise<Document> {
    if (!bypassCache) {
      const cached = docClientCache.get(id, Date.now());
      if (cached && !cached.frontmatter?.encrypted) {
        return cached;
      }
    }
    const doc = await invokeBackend<Document>("ReadDocument", id);
    if (doc && !doc.frontmatter?.encrypted) {
      docClientCache.put(id, doc, 30_000, Date.now());
    }
    return doc;
  },

  async saveDocument(doc: Document): Promise<string> {
    const id = await invokeBackend<string>("SaveDocument", doc);
    docClientCache.invalidate(id);
    return id;
  },

  async autoSaveDocument(doc: Document): Promise<string> {
    const id = await invokeBackend<string>("AutoSaveDocument", doc);
    docClientCache.invalidate(id);
    return id;
  },

  async importDocumentContent(filename: string, content: string, isVault = false): Promise<string> {
    const id = await invokeBackend<string>("ImportDocumentContent", filename, content, isVault);
    resetClientCache();
    return id;
  },

  async generateAuthorshipProof(docId: string): Promise<AuthorshipProofDTO> {
    return await invokeBackend<AuthorshipProofDTO>("GenerateAuthorshipProof", docId);
  },

  async setWindowTitle(title: string): Promise<void> {
    try {
      await invokeBackend<void>("SetWindowTitle", title);
    } catch {
      // ignore in browser fallback
    }
  },

  async saveExportArtifactDialog(docId: string, format: "epub" | "html" | "md"): Promise<string> {
    return await invokeBackend<string>("SaveExportArtifactDialog", docId, format);
  },

  async exportWritttPackDialog(packName: string, passphrase: string): Promise<string> {
    return await invokeBackend<string>("ExportWritttPackDialog", packName, passphrase);
  },

  async importWritttPackDialog(passphrase: string): Promise<number> {
    const count = await invokeBackend<number>("ImportWritttPackDialog", passphrase);
    resetClientCache();
    return Number(count) || 0;
  },

  async importDocumentDialog(isVault = false): Promise<string> {
    const id = await invokeBackend<string>("ImportDocumentDialog", isVault);
    resetClientCache();
    return id;
  },

  async uploadDriveFileDialog(): Promise<DriveVaultFile | null> {
    return await invokeBackend<DriveVaultFile | null>("UploadDriveFileDialog");
  },

  async saveDecryptedDriveFileDialog(id: string): Promise<string> {
    return await invokeBackend<string>("SaveDecryptedDriveFileDialog", id);
  },

  async deleteDocument(id: string): Promise<void> {
    await invokeBackend<void>("DeleteDocument", id);
    docClientCache.invalidate(id);
  },

  async updateMetadata(id: string, tags: string[], isVault: boolean): Promise<void> {
    await invokeBackend<void>("UpdateMetadata", id, tags, isVault);
    docClientCache.invalidate(id);
  },

  async renameDocument(id: string, newTitle: string): Promise<void> {
    await invokeBackend<void>("RenameDocument", id, newTitle);
    docClientCache.invalidate(id);
  },

  async moveDocument(id: string, parentId: string, sortOrder: number): Promise<void> {
    await invokeBackend<void>("MoveDocument", id, parentId, sortOrder);
    docClientCache.invalidate(id);
  },

  async reorderDocuments(parentId: string, orderedIds: string[]): Promise<void> {
    await invokeBackend<void>("ReorderDocuments", parentId, orderedIds);
    resetClientCache();
  },

  async getDocumentBreadcrumbs(id: string): Promise<BreadcrumbItem[]> {
    const list = await invokeBackend<BreadcrumbItem[]>("GetDocumentBreadcrumbs", id);
    return Array.isArray(list) ? list : [];
  },

  async createSplitDoc(parentId: string, title: string): Promise<SplitDocResult> {
    return await invokeBackend<SplitDocResult>("CreateSplitDoc", parentId, title);
  },

  async createSubChapter(parentId: string, title: string): Promise<Document> {
    const doc = await invokeBackend<Document>("CreateSubChapter", parentId, title);
    resetClientCache();
    return doc;
  },

  async appendSubChapterToParent(subChapterId: string): Promise<Document> {
    const doc = await invokeBackend<Document>("AppendSubChapterToParent", subChapterId);
    resetClientCache();
    return doc;
  },

  async duplicateDocument(sourceId: string, newTitle = ""): Promise<Document> {
    const doc = await invokeBackend<Document>("DuplicateDocument", sourceId, newTitle);
    resetClientCache();
    return doc;
  },

  async listChildren(parentId: string): Promise<SearchResult[]> {
    const list = await invokeBackend<SearchResult[]>("ListChildren", parentId);
    return Array.isArray(list) ? list : [];
  },

  async mergeToParent(parentId: string, mergedContent: string): Promise<void> {
    await invokeBackend<void>("MergeToParent", parentId, mergedContent);
    docClientCache.invalidate(parentId);
  },

  async saveAttachment(filename: string, base64Data: string): Promise<string> {
    return await invokeBackend<string>("SaveAttachment", filename, base64Data);
  },

  // ── Version History & Diff Engine ────────────────────────────────────────

  async listDocumentVersions(docId: string): Promise<DocumentVersion[]> {
    const list = await invokeBackend<DocumentVersion[]>("ListDocumentVersions", docId);
    return Array.isArray(list) ? list : [];
  },

  async restoreDocumentVersion(docId: string, version: number): Promise<Document> {
    const doc = await invokeBackend<Document>("RestoreDocumentVersion", docId, version);
    docClientCache.invalidate(docId);
    return doc;
  },

  async diffDocumentVersions(docId: string, fromVersion: number, toVersion: number): Promise<VersionDiffReport> {
    return await invokeBackend<VersionDiffReport>("DiffDocumentVersions", docId, fromVersion, toVersion);
  },

  // ── Zero-Knowledge Security, Argon2id, PIN, Recovery Key & TOTP 2FA ──────

  async getSecurityConfig(): Promise<SecurityConfigDTO> {
    return await invokeBackend<SecurityConfigDTO>("GetSecurityConfig");
  },

  async setPassword(currentPassword: string, newPassword: string): Promise<void> {
    await invokeBackend<void>("SetPassword", currentPassword, newPassword);
    resetClientCache();
  },

  async removePassword(currentPassword: string): Promise<void> {
    await invokeBackend<void>("RemovePassword", currentPassword);
    resetClientCache();
  },

  async unlockVault(password: string): Promise<boolean> {
    const ok = await invokeBackend<boolean>("UnlockVault", password);
    if (ok) resetClientCache();
    return Boolean(ok);
  },

  async unlockApp(password: string): Promise<boolean> {
    const ok = await invokeBackend<boolean>("UnlockApp", password);
    if (ok) resetClientCache();
    return Boolean(ok);
  },

  async beginAuthChallenge(): Promise<AuthChallengeDTO> {
    return await invokeBackend<AuthChallengeDTO>("BeginAuthChallenge");
  },

  async unlockWithHumanProof(req: HumanUnlockRequest): Promise<HumanUnlockResult> {
    const res = await invokeBackend<HumanUnlockResult>("UnlockWithHumanProof", req);
    if (res?.unlocked) resetClientCache();
    return res;
  },

  async lockVault(): Promise<void> {
    await invokeBackend<void>("LockVault");
    resetClientCache();
  },

  async lockApp(): Promise<void> {
    await invokeBackend<void>("LockApp");
    resetClientCache();
  },

  async isVaultUnlocked(): Promise<boolean> {
    return Boolean(await invokeBackend<boolean>("IsVaultUnlocked"));
  },

  async setVaultPIN(currentPassword: string, pin: string): Promise<void> {
    await invokeBackend<void>("SetVaultPIN", currentPassword, pin);
  },

  async removeVaultPIN(currentPassword: string): Promise<void> {
    await invokeBackend<void>("RemoveVaultPIN", currentPassword);
  },

  async unlockVaultWithPIN(pin: string): Promise<boolean> {
    const ok = await invokeBackend<boolean>("UnlockVaultWithPIN", pin);
    if (ok) resetClientCache();
    return Boolean(ok);
  },

  async generateRecoveryKey(currentPassword: string): Promise<string> {
    return await invokeBackend<string>("GenerateRecoveryKey", currentPassword);
  },

  async recoverVaultWithKey(recoveryKeyFormatted: string, newPassword: string): Promise<void> {
    await invokeBackend<void>("RecoverVaultWithKey", recoveryKeyFormatted, newPassword);
    resetClientCache();
  },

  async setupVaultTOTP(currentPassword: string): Promise<TOTPEnrollmentBundle> {
    return await invokeBackend<TOTPEnrollmentBundle>("SetupVaultTOTP", currentPassword);
  },

  async enableVaultTOTP(currentPassword: string, code: string): Promise<void> {
    await invokeBackend<void>("EnableVaultTOTP", currentPassword, code);
  },

  async verifyVaultTOTP(code: string): Promise<boolean> {
    return Boolean(await invokeBackend<boolean>("VerifyVaultTOTP", code));
  },

  async disableVaultTOTP(currentPassword: string): Promise<void> {
    await invokeBackend<void>("DisableVaultTOTP", currentPassword);
  },

  // ── Writtt Express (RSA-2048 OAEP + AES-256-GCM Envelopes) ───────────────

  async sendExpressEnvelope(
    senderAlias: string,
    subject: string,
    body: string,
    recipientPubKeyPEM = ""
  ): Promise<ExpressMessageDTO> {
    return await invokeBackend<ExpressMessageDTO>(
      "SendExpressEnvelope",
      senderAlias,
      subject,
      body,
      recipientPubKeyPEM
    );
  },

  async listExpressInbox(): Promise<ExpressMessageDTO[]> {
    const list = await invokeBackend<ExpressMessageDTO[]>("ListExpressInbox");
    return Array.isArray(list) ? list : [];
  },

  async unsealExpressMessage(id: string): Promise<ExpressMessageDTO> {
    return await invokeBackend<ExpressMessageDTO>("UnsealExpressMessage", id);
  },

  async deleteExpressMessage(id: string): Promise<void> {
    await invokeBackend<void>("DeleteExpressMessage", id);
  },

  // ── E2EE Drive Vault & Cryptographic Metadata Inspector ──────────────────

  async uploadDriveVaultFile(
    filename: string,
    mimeType: string,
    base64Data: string
  ): Promise<DriveVaultFile> {
    return await invokeBackend<DriveVaultFile>("UploadDriveVaultFile", filename, mimeType, base64Data);
  },

  async listDriveVaultFiles(): Promise<DriveVaultFile[]> {
    const list = await invokeBackend<DriveVaultFile[]>("ListDriveVaultFiles");
    return Array.isArray(list) ? list : [];
  },

  async decryptDriveVaultFile(id: string): Promise<string> {
    return await invokeBackend<string>("DecryptDriveVaultFile", id);
  },

  async decryptDriveVaultFileBase64(id: string): Promise<string> {
    return await invokeBackend<string>("DecryptDriveVaultFileBase64", id);
  },

  async deleteDriveVaultFile(id: string): Promise<void> {
    await invokeBackend<void>("DeleteDriveVaultFile", id);
  },

  // ── .writttpack Zero-Knowledge Bundle & EPUB3/HTML/Markdown Export ───────

  async exportWritttPack(packName: string, passphrase: string): Promise<ExportBundleResult> {
    return await invokeBackend<ExportBundleResult>("ExportWritttPack", packName, passphrase);
  },

  async importWritttPack(base64Pack: string, passphrase: string): Promise<number> {
    const count = await invokeBackend<number>("ImportWritttPack", base64Pack, passphrase);
    resetClientCache();
    return Number(count) || 0;
  },

  async exportDocumentArtifact(docId: string, format: "epub" | "html" | "md"): Promise<ExportBundleResult> {
    return await invokeBackend<ExportBundleResult>("ExportDocumentArtifact", docId, format);
  },

  // ── Custom Dictionary, Local AI Assistant, ZKP & COE Algorithms Lab ──────

  async getCustomDictionary(): Promise<string[]> {
    const list = await invokeBackend<string[]>("GetCustomDictionary");
    return Array.isArray(list) ? list : [];
  },

  async addDictionaryWord(word: string): Promise<string[]> {
    return await invokeBackend<string[]>("AddDictionaryWord", word);
  },

  async removeDictionaryWord(word: string): Promise<string[]> {
    return await invokeBackend<string[]>("RemoveDictionaryWord", word);
  },

  async scanLocalAI(): Promise<boolean> {
    return Boolean(await invokeBackend<boolean>("ScanLocalAI"));
  },

  async getLocalModels(): Promise<string[]> {
    const list = await invokeBackend<string[]>("GetLocalModels");
    return Array.isArray(list) ? list : [];
  },

  async getLocalModelCapabilities(): Promise<AIModelCapabilityDTO[]> {
    const list = await invokeBackend<AIModelCapabilityDTO[]>("GetLocalModelCapabilities");
    return Array.isArray(list) ? list : [];
  },

  async askAssistant(model: string, prompt: string, contextStr: string): Promise<string> {
    return await invokeBackend<string>("AskAssistant", model, prompt, contextStr);
  },

  async chatWithAssistant(
    model: string,
    history: AIChatMessage[],
    docContext: string,
    selectedExcerpt = "",
    useRAG = true
  ): Promise<AIChatReplyDTO> {
    const cleanHistory = history.map((m) => ({ role: m.role, content: m.content }));
    return await invokeBackend<AIChatReplyDTO>(
      "ChatWithAssistant",
      model,
      cleanHistory,
      docContext,
      selectedExcerpt,
      useRAG
    );
  },

  async freeChatWithAssistant(
    model: string,
    history: AIChatMessage[],
    includeDocContext = false,
    docContext = "",
    useRAG = false
  ): Promise<AIChatReplyDTO> {
    const cleanHistory = history.map((m) => ({ role: m.role, content: m.content }));
    return await invokeBackend<AIChatReplyDTO>(
      "FreeChatWithAssistant",
      model,
      cleanHistory,
      includeDocContext,
      docContext,
      useRAG
    );
  },

  async searchWorkspaceRAG(query: string, topK = 5): Promise<RAGSearchResult[]> {
    const list = await invokeBackend<RAGSearchResult[]>("SearchWorkspaceRAG", query, topK);
    return Array.isArray(list) ? list : [];
  },

  async listTrustedDevices(): Promise<TrustedDeviceDTO[]> {
    const list = await invokeBackend<TrustedDeviceDTO[]>("ListTrustedDevices");
    return Array.isArray(list) ? list : [];
  },

  async registerTrustedDevice(label: string): Promise<TrustedDeviceDTO> {
    return await invokeBackend<TrustedDeviceDTO>("RegisterTrustedDevice", label);
  },

  async revokeTrustedDevice(id: string): Promise<TrustedDeviceDTO[]> {
    const list = await invokeBackend<TrustedDeviceDTO[]>("RevokeTrustedDevice", id);
    return Array.isArray(list) ? list : [];
  },

  async getOperatorAlias(): Promise<AliasConfigDTO> {
    return await invokeBackend<AliasConfigDTO>("GetOperatorAlias");
  },

  async setOperatorAlias(alias: string): Promise<AliasConfigDTO> {
    return await invokeBackend<AliasConfigDTO>("SetOperatorAlias", alias);
  },

  async simulateZKPRound(round: number, challengePath: string): Promise<ZKPSoundnessProof> {
    return await invokeBackend<ZKPSoundnessProof>("SimulateZKPRound", round, challengePath);
  },

  async getAlgorithmsLabReport(): Promise<WritttAlgorithmsReport> {
    return await invokeBackend<WritttAlgorithmsReport>("GetAlgorithmsLabReport");
  },
};
