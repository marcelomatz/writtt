import { describe, expect, it } from "vitest";
import {
  AISessionRepository,
  KeyValueStorage,
  loadPreferences,
  markOnboardingDone,
  savePreferences,
  shouldShowOnboarding,
} from "./storageStore";

function createMemoryStorage(): KeyValueStorage & { dump: Record<string, string> } {
  const dump: Record<string, string> = {};
  return {
    dump,
    getItem(k: string) {
      return k in dump ? dump[k] : null;
    },
    setItem(k: string, v: string) {
      dump[k] = v;
    },
  };
}

describe("Application Storage & Vault-Safe AI Session Repository", () => {
  it("persists editorial preferences and onboarding state cleanly", () => {
    const mem = createMemoryStorage();
    const prefs = loadPreferences(mem);
    expect(prefs.fontFamily).toBe("serif");
    savePreferences({ ...prefs, fontSize: 18, focusMode: true }, mem);
    const reloaded = loadPreferences(mem);
    expect(reloaded.fontSize).toBe(18);
    expect(reloaded.focusMode).toBe(true);

    expect(shouldShowOnboarding("@local-operator", mem)).toBe(true);
    expect(shouldShowOnboarding("@custom-author", mem)).toBe(false);
    markOnboardingDone(mem);
    expect(shouldShowOnboarding("@local-operator", mem)).toBe(false);
  });

  it("never persists Vault manuscript AI sessions to storage and wipes them on lock", () => {
    const mem = createMemoryStorage();
    const repo = new AISessionRepository(mem);

    const pubSession = repo.upsert({
      docId: "doc-public",
      isVault: false,
      activeSessionId: "",
      source: "chat",
      titleSeed: "Revisao publica",
      messages: [{ role: "user", content: "Melhore a introducao" }],
    });

    const vaultSession = repo.upsert({
      docId: "doc-vault",
      isVault: true,
      activeSessionId: "",
      source: "inline",
      titleSeed: "Trecho ultrassecreto",
      messages: [{ role: "user", content: "Segredo confidencial" }],
      forceNew: true,
    });

    expect(repo.listForDocument("doc-public").length).toBe(1);
    expect(repo.listForDocument("doc-vault").length).toBe(1);

    // Inspect raw persisted JSON: vault transcript must NEVER appear in storage!
    const persistedRaw = mem.dump["writtt-ai-sessions-v1"] || "[]";
    expect(persistedRaw).toContain(pubSession.id);
    expect(persistedRaw).not.toContain(vaultSession.id);
    expect(persistedRaw).not.toContain("Segredo confidencial");

    // Locking the app wipes in-memory vault transcripts
    repo.clearEphemeralVaultSessions();
    expect(repo.listForDocument("doc-vault").length).toBe(0);
    expect(repo.listForDocument("doc-public").length).toBe(1);
  });

  it("archives inserted AI deliverables into document history preserving applied metadata", () => {
    const mem = createMemoryStorage();
    const repo = new AISessionRepository(mem);

    const created = repo.upsert({
      docId: "doc-article",
      isVault: false,
      activeSessionId: "",
      source: "chat",
      titleSeed: "Escreva um artigo sobre 2FA",
      messages: [
        { role: "user", content: "Escreva um artigo sobre 2FA" },
        {
          role: "assistant",
          content: "<opinion>Use subtitulos claros.</opinion><content># 2FA Essencial</content>",
          opinion: "Use subtitulos claros.",
          insertableContent: "# 2FA Essencial",
          hasInsertable: true,
        },
      ],
    });

    const archived = repo.upsert({
      docId: "doc-article",
      isVault: false,
      activeSessionId: created.id,
      source: created.source,
      titleSeed: created.title,
      messages: created.messages.map((m, idx) =>
        idx === 1 ? { ...m, appliedAt: "2026-11-25T11:45:00Z", appliedMode: "insert" } : m
      ),
    });

    const history = repo.listForDocument("doc-article");
    expect(history.length).toBe(1);
    expect(history[0].id).toBe(archived.id);
    expect(history[0].messages[1].appliedMode).toBe("insert");
    expect(history[0].messages[1].appliedAt).toBe("2026-11-25T11:45:00Z");
  });

  it("persists Home screen section visibility flags and isolates free chatbot sessions", () => {
    const mem = createMemoryStorage();
    const initial = loadPreferences(mem);
    expect(initial.showHomeHeader).toBe(true);
    expect(initial.showHomeCapabilities).toBe(true);

    savePreferences({ ...initial, showHomeHeader: false, showHomeCapabilities: false }, mem);
    const updated = loadPreferences(mem);
    expect(updated.showHomeHeader).toBe(false);
    expect(updated.showHomeCapabilities).toBe(false);

    const repo = new AISessionRepository(mem);
    repo.upsert({
      docId: "doc-1",
      isVault: false,
      activeSessionId: "",
      source: "chatbot",
      titleSeed: "Brainstorm sobre narrativa",
      messages: [{ role: "user", content: "Como estruturar 3 atos?" }],
    });

    expect(repo.listForDocument("doc-1").length).toBe(0);
    expect(repo.listChatbotSessions("doc-1").length).toBe(1);
  });
});
