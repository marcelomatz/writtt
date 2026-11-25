/**
 * Layer 2 — Application Persistence & Vault-Safe AI Session Store
 * Isolates localStorage serialization and guarantees that Vault manuscript AI sessions
 * remain strictly in ephemeral RAM and are never persisted to browser storage.
 */
import {
  AIChatMessage,
  AIConversationSession,
  EditorialPreferences,
} from "../domain";

const PREFS_KEY = "writtt-editorial-prefs-v2";
const AI_SESSIONS_KEY = "writtt-ai-sessions-v1";
const ONBOARDING_KEY = "writtt-onboarded-v1";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export const DEFAULT_PREFERENCES: EditorialPreferences = {
  fontFamily: "serif",
  fontSize: 16,
  pageWidth: "comfortable",
  brightness: 100,
  focusMode: false,
  autoSave: true,
  autoLockMinutes: 15,
  wordGoal: 1000,
  showHomeHeader: true,
  showHomeCapabilities: true,
  checkUpdatesAutomatically: true,
};

export function loadPreferences(store: KeyValueStorage | null = defaultStorage()): EditorialPreferences {
  if (!store) return { ...DEFAULT_PREFERENCES };
  try {
    const raw = store.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  prefs: EditorialPreferences,
  store: KeyValueStorage | null = defaultStorage()
): void {
  if (!store) return;
  try {
    store.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

export function shouldShowOnboarding(
  currentAlias: string,
  store: KeyValueStorage | null = defaultStorage()
): boolean {
  if (store) {
    try {
      if (store.getItem(ONBOARDING_KEY) === "true") return false;
    } catch {
      return false;
    }
  }
  return !currentAlias || currentAlias === "@local-operator";
}

export function markOnboardingDone(store: KeyValueStorage | null = defaultStorage()): void {
  if (!store) return;
  try {
    store.setItem(ONBOARDING_KEY, "true");
  } catch {
    // ignore
  }
}

export class AISessionRepository {
  private sessions: AIConversationSession[] = [];
  private vaultDocIds = new Set<string>();
  private store: KeyValueStorage | null;

  constructor(store: KeyValueStorage | null = defaultStorage()) {
    this.store = store;
    this.sessions = this.loadPersisted();
  }

  private loadPersisted(): AIConversationSession[] {
    if (!this.store) return [];
    try {
      const raw = this.store.getItem(AI_SESSIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private flushPublicSessions(): void {
    if (!this.store) return;
    try {
      const publicOnly = this.sessions
        .filter((s) => !this.vaultDocIds.has(s.docId))
        .slice(0, 40);
      this.store.setItem(AI_SESSIONS_KEY, JSON.stringify(publicOnly));
    } catch {
      // ignore storage quota errors
    }
  }

  markDocumentVaultState(docId: string, isVault: boolean): void {
    if (!docId) return;
    if (isVault) {
      this.vaultDocIds.add(docId);
      this.flushPublicSessions();
    } else {
      this.vaultDocIds.delete(docId);
    }
  }

  clearEphemeralVaultSessions(): void {
    this.sessions = this.sessions.filter((s) => !this.vaultDocIds.has(s.docId));
  }

  listForDocument(docId: string): AIConversationSession[] {
    return this.sessions.filter((s) => s.docId === docId && s.source !== "chatbot");
  }

  listChatbotSessions(docId: string): AIConversationSession[] {
    return this.sessions.filter(
      (s) => s.source === "chatbot" && (s.docId === docId || s.docId === "__global_chatbot__")
    );
  }

  getById(sessionId: string): AIConversationSession | undefined {
    return this.sessions.find((s) => s.id === sessionId);
  }

  upsert(params: {
    docId: string;
    isVault: boolean;
    activeSessionId: string;
    source: "chat" | "inline" | "chatbot";
    titleSeed: string;
    messages: AIChatMessage[];
    forceNew?: boolean;
  }): AIConversationSession {
    const { docId, isVault, activeSessionId, source, titleSeed, messages, forceNew } = params;
    this.markDocumentVaultState(docId, isVault);

    const now = new Date().toISOString();
    const targetId = forceNew ? "" : activeSessionId;
    const existing = targetId
      ? this.sessions.find((s) => s.id === targetId && s.docId === docId)
      : undefined;

    if (existing) {
      existing.messages = [...messages];
      existing.updatedAt = now;
      this.sessions = [existing, ...this.sessions.filter((s) => s.id !== existing.id)];
      this.flushPublicSessions();
      return existing;
    }

    const id = `ais-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cleanTitle = (titleSeed || "Conversa IA").replace(/\s+/g, " ").trim().slice(0, 48);
    const created: AIConversationSession = {
      id,
      docId,
      title: cleanTitle || "Conversa IA",
      source,
      updatedAt: now,
      messages: [...messages],
    };
    this.sessions = [created, ...this.sessions];
    this.flushPublicSessions();
    return created;
  }

  remove(sessionId: string): void {
    this.sessions = this.sessions.filter((s) => s.id !== sessionId);
    this.flushPublicSessions();
  }
}
