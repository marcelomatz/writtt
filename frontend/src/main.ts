/**
 * Writtt v0.2.0 — Application Bootstrapper & Presentation Coordinator
 * Strictly follows the 4-layer Clean / Hexagonal Architecture:
 *   - Layer 1: ./domain (Pure entities, editorial algorithms, i18n, Markdown/SVG formatters)
 *   - Layer 2: ./application (WorkspaceState + Vault-safe AISessionRepository & Preferences)
 *   - Layer 3: ./adapters (Wails v3 IPC + transparent HTTP fallback + O(1) LRUCache)
 *   - Layer 4: ./presentation (Modular shell, Tiptap studio, full-page views, AI Studio & modals)
 */
import "@matz/ui/styles.css";
import "./styles/writtt.css";
import { Events, Window } from "@wailsio/runtime";
import {
  applyMatzThemeFamily,
  attachMatzFloatingWindow,
  getMatzActiveThemeFamily,
  getMatzThemeMode,
  matzIcon,
  onMatzLocaleChange,
  openMatzDialog,
  openMatzDiffModal,
  openRaycastCommandModal,
  renderMatzResizeHandlesHtml,
  showMatzToast,
} from "@matz/ui";
import { WritttIPC as RawWritttIPC } from "./adapters/ipcAdapter";
import {
  AISessionRepository,
  loadPreferences,
  savePreferences,
  shouldShowOnboarding,
} from "./application/storageStore";
import { bindStudioGatewayAdapter, StudioGateway as WritttIPC } from "./application/studioGateway";
import { createInitialWorkspaceState } from "./application/workspaceState";
import {
  AIChatMessage,
  AppViewMode,
  buildChatbotContextExcerpts,
  EditorialInspectorTab,
  extractChaptersAndStats,
  formatChatbotExcerptsForEditorialAI,
  sanitizeContextForAI,
  t,
} from "./domain";
import {
  bindHorizontalResizer,
  bindViewportHoverTooltips,
  esc,
  triggerBase64Download,
} from "./presentation/dom/domUtils";
import { renderEditorStageView } from "./presentation/editor/EditorStageView";
import { TiptapStudio } from "./presentation/editor/TiptapStudio";
import { openDrawingModal } from "./presentation/modals/DrawingModal";
import { openOnboardingModal } from "./presentation/modals/OnboardingModal";
import { renderEditorSidebar } from "./presentation/shell/EditorSidebar";
import { renderLockScreenView } from "./presentation/shell/LockScreen";
import { renderStatusBarView } from "./presentation/shell/StatusBar";
import { renderWritttTitleBar } from "./presentation/shell/TitleBarNav";
import { TopMenuBar } from "./presentation/shell/TopMenuBar";
import { renderAIStudioPanel } from "./presentation/views/AIStudioPanel";
import { renderHelpView } from "./presentation/views/HelpView";
import { renderHomeView } from "./presentation/views/HomeView";
import { renderInspectorPanel } from "./presentation/views/InspectorPanel";
import { renderSettingsView } from "./presentation/views/settings/SettingsView";

// Composition Root: wire Layer 3 Infrastructure Adapter into Layer 2 Application Port
bindStudioGatewayAdapter(RawWritttIPC);

/**
 * Standalone multi-monitor OS window bootstrap (`/?window=ai-studio`).
 * Renders the full Antigravity-style AI & RAG Studio inside an independent frameless Wails v3 window
 * that can be freely dragged to a second monitor while staying synchronized with the main Writtt editor.
 */
async function bootstrapStandaloneAIWindow(root: HTMLElement): Promise<void> {
  applyMatzThemeFamily(getMatzActiveThemeFamily(), undefined, getMatzThemeMode());
  bindViewportHoverTooltips();

  root.innerHTML = `<div class="writtt-standalone-ai-shell" id="writtt-standalone-ai"></div>`;
  const mountEl = document.getElementById("writtt-standalone-ai")!;

  const st = createInitialWorkspaceState(loadPreferences());
  st.aiStudioOpen = true;
  const aiRepo = new AISessionRepository();
  let alwaysOnTop = false;
  let studioAiFeedback = "";

  const loadAiStatus = async () => {
    try {
      const [online, models, caps] = await Promise.all([
        WritttIPC.scanLocalAI(),
        WritttIPC.getLocalModels(),
        WritttIPC.getLocalModelCapabilities().catch(() => []),
      ]);
      st.localAiOnline = online;
      if (models.length > 0) {
        st.aiModels = models;
        if (!st.aiModels.includes(st.selectedAiModel)) st.selectedAiModel = st.aiModels[0];
      }
      st.aiModelCaps =
        caps.length > 0
          ? caps
          : st.aiModels.map((m) => ({
              name: m,
              family: m.split(":")[0] || m,
              supportsChat: !/embed|minilm|bge-|paraphrase-/i.test(m),
            }));
    } catch {
      st.localAiOnline = false;
    }
  };

  const syncBridgeDoc = async (docId: string) => {
    const cleanId = (docId || "").trim();
    if (!cleanId) {
      st.activeDoc = null;
      return;
    }
    try {
      const raw = await WritttIPC.readDocument(cleanId, true);
      if (!raw) return;
      const fm = raw.frontmatter || ({} as any);
      const prevId = st.activeDoc?.id || "";
      st.activeDoc = {
        id: fm.id || cleanId,
        title: fm.title || t("Sem titulo", "Untitled", "Sin titulo"),
        content: Boolean(fm.encrypted) ? "" : raw.content || "",
        tags: Array.isArray(fm.tags) ? fm.tags : [],
        is_vault: Boolean(fm.is_vault),
        encrypted: Boolean(fm.encrypted),
        parent_id: fm.parent_id || "",
        doc_type: fm.doc_type || "document",
        version: fm.version || 1,
        sort_order: fm.sort_order || 0,
      };
      aiRepo.markDocumentVaultState(st.activeDoc.id, st.activeDoc.is_vault);
      if (prevId !== st.activeDoc.id) {
        st.activeAiSessionId = "";
        st.aiChatHistory = [];
        if (st.activeDoc.is_vault) {
          st.activeChatbotSessionId = "";
          st.freeChatbotHistory = [];
        }
      }
    } catch {
      // ignore read errors while locked
    }
  };

  const forwardTurnsToEditorial = (indices: number[]) => {
    const nextExcerpts = buildChatbotContextExcerpts(st.freeChatbotHistory, indices);
    if (nextExcerpts.length === 0) return;
    const byId = new Map(st.attachedChatbotExcerpts.map((ex) => [ex.id, ex]));
    for (const ex of nextExcerpts) byId.set(ex.id, ex);
    st.attachedChatbotExcerpts = Array.from(byId.values());
    st.selectedChatbotTurnIndices = [];
    st.aiStudioTab = "editorial";
    renderStandalone();
    (mountEl.querySelector("#ais-composer-ta") as HTMLTextAreaElement | null)?.focus();
  };

  const renderStandalone = (preserveComposerDraft = false) => {
    const prevDraft = preserveComposerDraft
      ? (mountEl.querySelector("#ais-composer-ta") as HTMLTextAreaElement | null)?.value || ""
      : "";
    const activeFeedback = studioAiFeedback;
    studioAiFeedback = "";
    const docKey = st.activeDoc?.id || "__global_editorial__";

    renderAIStudioPanel(
      mountEl,
      {
        tab: st.aiStudioTab,
        placement: "docked",
        isStandaloneWindow: true,
        alwaysOnTop,
        historyOpen: st.aiHistoryDrawerOpen,
        activeDocId: st.activeDoc?.id || "",
        activeDocTitle: st.activeDoc?.title || "",
        localAiOnline: st.localAiOnline,
        aiModels: st.aiModels,
        aiModelCaps: st.aiModelCaps,
        selectedAiModel: st.selectedAiModel,
        aiSessions: aiRepo.listForDocument(docKey),
        activeAiSessionId: st.activeAiSessionId,
        aiChatHistory: st.aiChatHistory,
        chatbotSessions: aiRepo.listChatbotSessions(st.activeDoc?.id || ""),
        activeChatbotSessionId: st.activeChatbotSessionId,
        freeChatbotHistory: st.freeChatbotHistory,
        selectedChatbotTurnIndices: st.selectedChatbotTurnIndices,
        attachedChatbotExcerpts: st.attachedChatbotExcerpts,
        chatbotIncludeDoc: st.chatbotIncludeDoc,
        aiUseRag: st.aiUseRag,
        aiBusy: st.aiBusy,
        aiAppliedFeedback: activeFeedback,
        ragQuery: st.ragQuery,
        ragResults: st.ragResults,
      },
      {
        onSelectTab: (tab) => {
          st.aiStudioTab = tab;
          renderStandalone();
        },
        onToggleHistory: () => {
          st.aiHistoryDrawerOpen = !st.aiHistoryDrawerOpen;
          renderStandalone(true);
        },
        onToggleFloating: () => {},
        onPopoutOSWindow: () => {},
        onToggleAlwaysOnTop: async () => {
          alwaysOnTop = !alwaysOnTop;
          await WritttIPC.setDetachedAIAlwaysOnTop(alwaysOnTop);
          renderStandalone(true);
          showMatzToast(
            alwaysOnTop
              ? t("Janela fixada sempre no topo.", "Window pinned always on top.", "Ventana fijada siempre visible.")
              : t("Fixacao no topo desativada.", "Always-on-top disabled.", "Modo siempre visible desactivado.")
          );
        },
        onRedockMain: async () => {
          await WritttIPC.closeDetachedAIWindow(true);
          try {
            window.close();
          } catch {
            // native Wails hides window via CloseDetachedAIWindow
          }
        },
        onClose: async () => {
          await WritttIPC.closeDetachedAIWindow(false);
          try {
            window.close();
          } catch {
            // native Wails hides window via CloseDetachedAIWindow
          }
        },
        onSelectAiModel: (m) => {
          st.selectedAiModel = m;
        },
        onTestOllama: async () => {
          await loadAiStatus();
          renderStandalone(true);
          showMatzToast(
            st.localAiOnline
              ? `${t("Ollama conectado!", "Ollama connected!", "Ollama conectado!")} (${st.aiModels.length} modelos)`
              : t("Ollama nao encontrado em localhost:11434.", "Ollama not found on localhost:11434.", "Ollama no encontrado.")
          );
        },
        onToggleAiRag: (enabled) => {
          st.aiUseRag = enabled;
        },
        onToggleChatbotDocCtx: (enabled) => {
          st.chatbotIncludeDoc = enabled;
        },
        onToggleSelectChatbotTurn: (idx) => {
          st.selectedChatbotTurnIndices = st.selectedChatbotTurnIndices.includes(idx)
            ? st.selectedChatbotTurnIndices.filter((i) => i !== idx)
            : [...st.selectedChatbotTurnIndices, idx];
          renderStandalone(true);
        },
        onClearSelectedChatbotTurns: () => {
          st.selectedChatbotTurnIndices = [];
          renderStandalone(true);
        },
        onForwardSelectedToEditorial: () => forwardTurnsToEditorial(st.selectedChatbotTurnIndices),
        onForwardSingleTurnToEditorial: (idx) => forwardTurnsToEditorial([idx]),
        onForwardEntireChatToEditorial: () => {
          const allIdxs = st.freeChatbotHistory
            .map((m, idx) => (m.role === "assistant" ? idx : -1))
            .filter((idx) => idx >= 0);
          forwardTurnsToEditorial(allIdxs);
        },
        onRemoveAttachedExcerpt: (id) => {
          st.attachedChatbotExcerpts = st.attachedChatbotExcerpts.filter((ex) => ex.id !== id);
          renderStandalone(true);
        },
        onClearAttachedExcerpts: () => {
          st.attachedChatbotExcerpts = [];
          renderStandalone(true);
        },
        onSelectAiSession: (sid) => {
          const found = aiRepo.getById(sid);
          if (found) {
            st.activeAiSessionId = found.id;
            st.aiChatHistory = [...found.messages];
            st.aiHistoryDrawerOpen = false;
            renderStandalone(true);
          }
        },
        onNewAiSession: () => {
          st.activeAiSessionId = "";
          st.aiChatHistory = [];
          st.aiHistoryDrawerOpen = false;
          renderStandalone();
        },
        onDeleteAiSession: (sid) => {
          aiRepo.remove(sid);
          if (st.activeAiSessionId === sid) {
            st.activeAiSessionId = "";
            st.aiChatHistory = [];
          }
          renderStandalone(true);
        },
        onSelectChatbotSession: (sid) => {
          const found = aiRepo.getById(sid);
          if (found) {
            st.activeChatbotSessionId = found.id;
            st.freeChatbotHistory = [...found.messages];
            st.selectedChatbotTurnIndices = [];
            st.aiHistoryDrawerOpen = false;
            renderStandalone(true);
          }
        },
        onNewChatbotSession: () => {
          st.activeChatbotSessionId = "";
          st.freeChatbotHistory = [];
          st.selectedChatbotTurnIndices = [];
          st.aiHistoryDrawerOpen = false;
          renderStandalone();
        },
        onDeleteChatbotSession: (sid) => {
          aiRepo.remove(sid);
          if (st.activeChatbotSessionId === sid) {
            st.activeChatbotSessionId = "";
            st.freeChatbotHistory = [];
          }
          renderStandalone(true);
        },
        onEditAiMessageContent: (msgIdx, newContent) => {
          if (msgIdx < 0 || msgIdx >= st.aiChatHistory.length) return;
          st.aiChatHistory = st.aiChatHistory.map((m, i) =>
            i === msgIdx ? { ...m, insertableContent: newContent } : m
          );
          const saved = aiRepo.upsert({
            docId: docKey,
            isVault: Boolean(st.activeDoc?.is_vault),
            activeSessionId: st.activeAiSessionId,
            source: "chat",
            titleSeed: st.aiChatHistory[0]?.content || "Conversa IA",
            messages: st.aiChatHistory,
          });
          st.activeAiSessionId = saved.id;
          renderStandalone(true);
        },
        onClearAiChat: () => {
          st.activeAiSessionId = "";
          st.aiChatHistory = [];
          renderStandalone();
        },
        onAskEditorialAi: async (promptText) => {
          if (!promptText.trim()) return;
          const attachedSnapshot = [...st.attachedChatbotExcerpts];
          const { contextBlock, redactedCount: excerptRedacted } =
            formatChatbotExcerptsForEditorialAI(attachedSnapshot);
          st.attachedChatbotExcerpts = [];

          const userLabel =
            attachedSnapshot.length > 0
              ? `${promptText.trim()}\n\n[${t("Contexto do Chatbot", "Chatbot Context", "Contexto del Chatbot")}: ${attachedSnapshot.length}]`
              : promptText.trim();

          st.aiChatHistory = [...st.aiChatHistory, { role: "user", content: userLabel }];
          st.aiBusy = true;
          renderStandalone();
          try {
            const sanitized =
              st.activeDoc && !st.activeDoc.encrypted
                ? sanitizeContextForAI(st.activeDoc.content)
                : { sanitized: "", redactedCount: 0 };
            const reply = await WritttIPC.chatWithAssistant(
              st.selectedAiModel,
              st.aiChatHistory,
              sanitized.sanitized,
              contextBlock,
              st.aiUseRag
            );
            st.aiChatHistory = [
              ...st.aiChatHistory,
              {
                role: "assistant",
                content: reply.raw,
                opinion: reply.opinion,
                insertableContent: reply.insertableContent,
                hasInsertable: reply.hasInsertable,
                redactedCount: reply.redactedCount + sanitized.redactedCount + excerptRedacted,
                ragChunksUsed: reply.ragChunksUsed,
              },
            ];
            const saved = aiRepo.upsert({
              docId: docKey,
              isVault: Boolean(st.activeDoc?.is_vault),
              activeSessionId: st.activeAiSessionId,
              source: "chat",
              titleSeed: promptText.trim(),
              messages: st.aiChatHistory,
            });
            st.activeAiSessionId = saved.id;
          } catch (e: any) {
            st.aiChatHistory = [
              ...st.aiChatHistory,
              {
                role: "assistant",
                content: `${e?.message || e}`,
                opinion: `${t("Nao foi possivel consultar o Ollama:", "Could not reach Ollama:", "Error de Ollama:")} ${e?.message || e}`,
              },
            ];
          } finally {
            st.aiBusy = false;
            renderStandalone();
          }
        },
        onAskChatbot: async (promptText) => {
          if (!promptText.trim()) return;
          const chatCapable = st.aiModelCaps.filter((c) => c.supportsChat);
          const modelToUse = chatCapable.some((c) => c.name === st.selectedAiModel)
            ? st.selectedAiModel
            : chatCapable[0]?.name || st.selectedAiModel;

          st.freeChatbotHistory = [...st.freeChatbotHistory, { role: "user", content: promptText.trim() }];
          st.aiBusy = true;
          renderStandalone();
          try {
            const docCtx =
              st.chatbotIncludeDoc && st.activeDoc && !st.activeDoc.encrypted
                ? sanitizeContextForAI(st.activeDoc.content).sanitized
                : "";
            const reply = await WritttIPC.freeChatWithAssistant(
              modelToUse,
              st.freeChatbotHistory,
              st.chatbotIncludeDoc,
              docCtx,
              st.aiUseRag
            );
            const botText = reply.opinion || reply.raw;
            st.freeChatbotHistory = [
              ...st.freeChatbotHistory,
              {
                role: "assistant",
                content: botText,
                ragChunksUsed: reply.ragChunksUsed,
                redactedCount: reply.redactedCount,
              },
            ];
            const saved = aiRepo.upsert({
              docId: st.activeDoc?.id || "__global_chatbot__",
              isVault: Boolean(st.activeDoc?.is_vault),
              activeSessionId: st.activeChatbotSessionId,
              source: "chatbot",
              titleSeed: st.freeChatbotHistory[0]?.content || promptText.trim(),
              messages: st.freeChatbotHistory,
            });
            st.activeChatbotSessionId = saved.id;
          } catch (e: any) {
            st.freeChatbotHistory = [
              ...st.freeChatbotHistory,
              {
                role: "assistant",
                content: `${t("Nao foi possivel conversar com o modelo:", "Could not chat with model:", "No se pudo conversar:")} ${e?.message || e}`,
              },
            ];
          } finally {
            st.aiBusy = false;
            renderStandalone();
          }
        },
        onInsertAiText: async (text, msgIndex) => {
          if (!text.trim()) return;
          await WritttIPC.insertFromDetachedAIWindow(text);
          if (st.aiChatHistory.length > 0) {
            const nowIso = new Date().toISOString();
            const targetIdx =
              typeof msgIndex === "number" && msgIndex >= 0 && msgIndex < st.aiChatHistory.length
                ? msgIndex
                : st.aiChatHistory.length - 1;
            const archived = st.aiChatHistory.map((m, i) =>
              i === targetIdx && m.role === "assistant"
                ? { ...m, appliedAt: nowIso, appliedMode: "insert" as const }
                : m
            );
            const existing = st.activeAiSessionId ? aiRepo.getById(st.activeAiSessionId) : undefined;
            aiRepo.upsert({
              docId: docKey,
              isVault: Boolean(st.activeDoc?.is_vault),
              activeSessionId: st.activeAiSessionId,
              source: existing?.source || "chat",
              titleSeed: existing?.title || archived[0]?.content || text.slice(0, 40),
              messages: archived,
            });
          }
          st.activeAiSessionId = "";
          st.aiChatHistory = [];
          studioAiFeedback = t(
            "Trecho enviado para o manuscrito na janela principal e salvo no Historico.",
            "Passage sent to the manuscript in the main window and archived in History.",
            "Texto enviado al manuscrito principal y guardado en el Historial."
          );
          renderStandalone();
        },
        onCopyText: async (text, label) => {
          try {
            await navigator.clipboard.writeText(text);
            showMatzToast(`${label} copiado!`);
          } catch {
            showMatzToast("Nao foi possivel copiar");
          }
        },
        onSearchRag: async (q) => {
          st.ragQuery = q;
          try {
            st.ragResults = await WritttIPC.searchWorkspaceRAG(q, 6);
            renderStandalone();
          } catch (e: any) {
            showMatzToast(`${e?.message || e}`);
          }
        },
        onSelectDoc: async (id) => {
          await syncBridgeDoc(id);
          renderStandalone();
        },
      }
    );

    if (prevDraft) {
      const nextTa = mountEl.querySelector("#ais-composer-ta") as HTMLTextAreaElement | null;
      if (nextTa) nextTa.value = prevDraft;
    }
  };

  mountEl.addEventListener("dblclick", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (
      target?.closest(".writtt-ais-header") &&
      !target.closest("button, input, textarea, select, [data-no-drag]")
    ) {
      try {
        Window.ToggleMaximise();
      } catch {
        // non-Wails preview fallback
      }
    }
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      if (st.aiHistoryDrawerOpen) {
        st.aiHistoryDrawerOpen = false;
        renderStandalone(true);
        return;
      }
      void WritttIPC.closeDetachedAIWindow(false);
    }
  });

  window.addEventListener("storage", () => {
    applyMatzThemeFamily(getMatzActiveThemeFamily(), undefined, getMatzThemeMode());
    renderStandalone(true);
  });

  onMatzLocaleChange(() => renderStandalone(true));

  try {
    Events.On("ai-studio:active-doc-changed", async (ev: any) => {
      const nextId = String(ev?.data ?? ev ?? "");
      await syncBridgeDoc(nextId);
      renderStandalone(true);
    });
    Events.On("file-updated", async () => {
      if (st.activeDoc?.id) {
        await syncBridgeDoc(st.activeDoc.id);
        renderStandalone(true);
      }
    });
    Events.On("app-locked", () => {
      aiRepo.clearEphemeralVaultSessions();
      st.activeDoc = null;
      st.activeAiSessionId = "";
      st.aiChatHistory = [];
      st.activeChatbotSessionId = "";
      st.freeChatbotHistory = [];
      st.attachedChatbotExcerpts = [];
      renderStandalone();
    });
  } catch {
    // HTTP preview fallback
  }

  const initialDocId = await WritttIPC.getActiveEditorBridgeDoc().catch(() => "");
  await Promise.all([loadAiStatus(), syncBridgeDoc(initialDocId)]);
  renderStandalone();
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;

  if (new URLSearchParams(window.location.search).get("window") === "ai-studio") {
    await bootstrapStandaloneAIWindow(root);
    return;
  }

  applyMatzThemeFamily(getMatzActiveThemeFamily(), undefined, getMatzThemeMode());
  bindViewportHoverTooltips();

  root.innerHTML = `
    <div class="writtt-shell" id="writtt-shell">
      <div id="titlebar-mount"></div>
      <div class="writtt-menubar-host" id="menubar-mount"></div>
      <div class="writtt-workspace">
        <aside class="writtt-sidebar is-hidden" id="writtt-sidebar"></aside>
        <div class="writtt-resizer is-hidden" id="writtt-sb-resizer" title="Arraste para redimensionar"></div>
        <main class="writtt-main" id="writtt-main"></main>
        <div class="writtt-resizer is-hidden" id="writtt-ai-resizer" title="Arraste para redimensionar"></div>
        <aside class="writtt-ai-dock is-hidden" id="writtt-ai-dock"></aside>
        <div class="writtt-resizer is-hidden" id="writtt-insp-resizer" title="Arraste para redimensionar"></div>
        <aside class="writtt-inspector is-hidden" id="writtt-inspector"></aside>
      </div>
      <footer class="writtt-statusbar" id="writtt-statusbar"></footer>
      <div class="matz-floating-window writtt-ai-float-window" id="writtt-ai-float">
        <div class="writtt-ai-float-content" id="writtt-ai-float-content"></div>
        ${renderMatzResizeHandlesHtml()}
      </div>
      <div id="writtt-lock-layer"></div>
      <div id="writtt-modal-layer"></div>
    </div>
  `;

  const shellEl = document.getElementById("writtt-shell")!;
  const titlebarEl = document.getElementById("titlebar-mount")!;
  const menubarEl = document.getElementById("menubar-mount")!;
  const sidebarEl = document.getElementById("writtt-sidebar")!;
  const sbResizerEl = document.getElementById("writtt-sb-resizer")!;
  const mainEl = document.getElementById("writtt-main")!;
  const aiResizerEl = document.getElementById("writtt-ai-resizer")!;
  const aiDockEl = document.getElementById("writtt-ai-dock")!;
  const inspResizerEl = document.getElementById("writtt-insp-resizer")!;
  const inspectorEl = document.getElementById("writtt-inspector")!;
  const statusbarEl = document.getElementById("writtt-statusbar")!;
  const aiFloatEl = document.getElementById("writtt-ai-float")!;
  const aiFloatContentEl = document.getElementById("writtt-ai-float-content")!;
  const lockLayerEl = document.getElementById("writtt-lock-layer")!;
  const modalLayerEl = document.getElementById("writtt-modal-layer")!;

  bindHorizontalResizer({
    resizerEl: sbResizerEl,
    targetEl: sidebarEl,
    cssVarName: "--writtt-sb-width",
    minPx: 180,
    maxPx: 440,
    side: "left",
  });
  bindHorizontalResizer({
    resizerEl: aiResizerEl,
    targetEl: aiDockEl,
    cssVarName: "--writtt-ai-width",
    minPx: 340,
    maxPx: 680,
    side: "right",
  });
  bindHorizontalResizer({
    resizerEl: inspResizerEl,
    targetEl: inspectorEl,
    cssVarName: "--writtt-insp-width",
    minPx: 260,
    maxPx: 540,
    side: "right",
  });

  const aiFloatController = attachMatzFloatingWindow(aiFloatEl, {
    defaultWidth: 460,
    minWidth: 360,
    maxWidth: 820,
    minHeight: 460,
    maxHeight: 820,
    storageKey: "writtt-ai-studio-float-v1",
  });

  const st = createInitialWorkspaceState(loadPreferences());
  const aiRepo = new AISessionRepository();
  let tiptap: TiptapStudio | null = null;
  let autoSaveTimer: number | null = null;
  let inspectorAiFeedback = "";
  let lastActivityTs = Date.now();

  shellEl.style.filter = `brightness(${st.prefs.brightness}%)`;

  const syncAiSessionForDoc = (docId: string, isVault: boolean) => {
    aiRepo.markDocumentVaultState(docId, isVault);
    st.activeAiSessionId = "";
    st.aiChatHistory = [];
    st.selectedChatbotTurnIndices = [];
    if (isVault) {
      st.activeChatbotSessionId = "";
      st.freeChatbotHistory = [];
      st.attachedChatbotExcerpts = [];
    }
    inspectorAiFeedback = "";
  };

  const syncEditorSaveButton = () => {
    const saveBtn = document.getElementById("hdr-save") as HTMLButtonElement | null;
    if (!saveBtn) return;
    const iconEl = document.getElementById("hdr-save-icon");
    const lbl = document.getElementById("hdr-save-label");

    if (st.saveState === "saved") {
      saveBtn.className = "writtt-btn writtt-btn-sm writtt-save-btn is-saved";
      saveBtn.setAttribute(
        "data-tip",
        t(
          "Documento salvo no disco (clique ou Ctrl+S para congelar nova versao)",
          "Saved to disk (click or Ctrl+S to freeze a new version snapshot)",
          "Documento guardado en disco (clic o Ctrl+S para nueva version)"
        )
      );
      if (iconEl) iconEl.innerHTML = matzIcon("check", 12);
      if (lbl) lbl.textContent = t("Salvo", "Saved", "Guardado");
    } else if (st.saveState === "saving") {
      saveBtn.className = "writtt-btn writtt-btn-sm writtt-save-btn is-saving";
      if (iconEl) iconEl.innerHTML = matzIcon("refresh", 12);
      if (lbl) lbl.textContent = t("Salvando...", "Saving...", "Guardando...");
    } else {
      saveBtn.className = "matz-btn matz-btn-primary writtt-btn-sm writtt-save-btn is-dirty";
      saveBtn.setAttribute(
        "data-tip",
        t(
          "Alteracoes pendentes — clique para salvar agora (Ctrl+S)",
          "Unsaved changes — click to save now (Ctrl+S)",
          "Cambios pendientes — clic para guardar (Ctrl+S)"
        )
      );
      if (iconEl) iconEl.innerHTML = matzIcon("save", 12);
      if (lbl) lbl.textContent = t("Salvar", "Save", "Guardar");
    }
  };

  const refreshSecurityAndTelemetry = async () => {
    try {
      const [cfg, dict, drv, exp, rep, devs, alias] = await Promise.all([
        WritttIPC.getSecurityConfig(),
        WritttIPC.getCustomDictionary(),
        WritttIPC.listDriveVaultFiles(),
        WritttIPC.listExpressInbox(),
        WritttIPC.getAlgorithmsLabReport(),
        WritttIPC.listTrustedDevices(),
        WritttIPC.getOperatorAlias(),
      ]);
      if (cfg) st.securityCfg = cfg;
      st.customDictionary = dict;
      st.driveFiles = drv;
      st.expressInbox = exp;
      st.algoReport = rep;
      st.trustedDevices = devs;
      if (alias?.alias) st.aliasConfig = alias;
    } catch {
      // offline preview fallback
    }
  };

  const loadAiStatus = async () => {
    try {
      const [online, models, caps] = await Promise.all([
        WritttIPC.scanLocalAI(),
        WritttIPC.getLocalModels(),
        WritttIPC.getLocalModelCapabilities().catch(() => []),
      ]);
      st.localAiOnline = online;
      if (models.length > 0) {
        st.aiModels = models;
        if (!st.aiModels.includes(st.selectedAiModel)) st.selectedAiModel = st.aiModels[0];
      }
      st.aiModelCaps =
        caps.length > 0
          ? caps
          : st.aiModels.map((m) => ({
              name: m,
              family: m.split(":")[0] || m,
              supportsChat: !/embed|minilm|bge-|paraphrase-/i.test(m),
            }));
    } catch {
      st.localAiOnline = false;
    }
  };

  const refreshDocVersions = async (docId: string) => {
    if (!docId) {
      st.docVersions = [];
      return;
    }
    try {
      st.docVersions = await WritttIPC.listDocumentVersions(docId);
    } catch {
      st.docVersions = [];
    }
  };

  const refreshDocList = async () => {
    try {
      st.docs = st.searchQuery.trim()
        ? await WritttIPC.search(st.searchQuery.trim())
        : await WritttIPC.listDocuments(st.docFilter, 150);
      if (st.selectedTagFilter) {
        st.docs = st.docs.filter((d) => (d.tags || []).includes(st.selectedTagFilter));
      }
      for (const d of st.docs) {
        aiRepo.markDocumentVaultState(d.id, Boolean(d.is_vault));
      }
    } catch {
      st.docs = [];
    }
  };

  const navigateWithEditorFallback = (target: AppViewMode) => {
    if (target === "editor" && !st.activeDoc) {
      if (st.docs.length > 0) void selectDocument(st.docs[0].id);
      else void createNewDocument(false);
      return;
    }
    navigateTo(target);
  };

  const menuBar = new TopMenuBar({
    onNavigate: navigateWithEditorFallback,
    onAction: (actionId) => void handleMenuAction(actionId),
  });

  const isAppLocked = () => st.securityCfg.password_enabled && !st.securityCfg.app_unlocked;

  const openUpdateDownloadPage = () => {
    const targetUrl =
      st.updateInfo?.downloadUrl ||
      st.updateInfo?.releaseUrl ||
      "https://www.writtt.com/#download";
    void WritttIPC.openExternalUrl(targetUrl);
  };

  const checkSoftwareUpdates = async (manual = false) => {
    try {
      const info = await WritttIPC.checkForUpdates();
      st.updateInfo = info;
      updateWindowAndTitleBar();
      if (st.activeView === "settings" && st.settingsTab === "appearance") {
        renderMainStage();
      }
      if (info.hasUpdate) {
        showMatzToast(
          t(
            `Nova versao ${info.latestVersion} do Writtt disponivel para download!`,
            `Writtt ${info.latestVersion} is now available for download!`,
            `Nueva version ${info.latestVersion} de Writtt disponible para descargar!`
          )
        );
      } else if (manual) {
        showMatzToast(
          t(
            `Voce ja esta usando a versao mais recente (v${info.currentVersion.replace(/^v/i, "")}).`,
            `You are already running the latest version (v${info.currentVersion.replace(/^v/i, "")}).`,
            `Ya tienes la version mas reciente (v${info.currentVersion.replace(/^v/i, "")}).`
          )
        );
      }
    } catch {
      if (manual) {
        showMatzToast(
          t(
            "Nao foi possivel verificar atualizacoes (modo offline).",
            "Could not check for updates (offline mode).",
            "No se pudo verificar actualizaciones (modo sin conexion)."
          )
        );
      }
    }
  };

  const updateWindowAndTitleBar = () => {
    renderWritttTitleBar(titlebarEl, {
      isLocked: isAppLocked(),
      activeView: st.activeView,
      activeDoc: st.activeDoc,
      updateInfo: st.updateInfo,
      onNavigateView: navigateWithEditorFallback,
      onOpenCommandPalette: openCommandPalette,
      onOpenUpdateDownload: openUpdateDownloadPage,
    });
  };

  const renderMenuBar = () => {
    const locked = isAppLocked();
    menubarEl.classList.toggle("is-hidden", locked || (st.zenMode && st.activeView === "editor"));
    if (locked) return;
    menuBar.render(menubarEl, {
      activeView: st.activeView,
      hasActiveDoc: Boolean(st.activeDoc),
      isSubChapter: Boolean(st.activeDoc?.parent_id),
      editorMode: st.editorMode,
      sidebarOpen: st.sidebarOpen,
      formatBarOpen: st.formatBarOpen,
      zenMode: st.zenMode,
      focusMode: st.prefs.focusMode,
      localAiOnline: st.localAiOnline,
      aiModelCount: st.aiModels.length,
      securityCfg: st.securityCfg,
    });
  };

  const renderSidebar = () => {
    renderEditorSidebar(sidebarEl, sbResizerEl, {
      visible: st.activeView === "editor" && !st.zenMode,
      sidebarOpen: st.sidebarOpen,
      docs: st.docs,
      activeDocId: st.activeDoc?.id || "",
      searchQuery: st.searchQuery,
      onToggleSidebar: (open) => {
        st.sidebarOpen = open;
        renderMenuBar();
        renderSidebar();
      },
      onNewDocument: () => void createNewDocument(false),
      onAddSubChapter: (pid) => void addSubChapterToWork(pid),
      onDuplicateDocument: (sid) => void duplicateWork(sid, true),
      onSearchChange: (q) => {
        st.searchQuery = q;
        void refreshDocList().then(renderSidebar);
      },
      onSelectDocument: (id) => void selectDocument(id),
    });
  };

  const renderStatusBar = () => {
    const inEditor = st.activeView === "editor" && Boolean(st.activeDoc);
    renderStatusBarView(statusbarEl, {
      inEditor,
      activeContent: inEditor && st.activeDoc ? st.activeDoc.content : "",
      totalWorksCount: st.docs.length,
      saveState: st.saveState,
      brightness: st.prefs.brightness,
      securityCfg: st.securityCfg,
      onOpenSecuritySettings: () => {
        st.settingsTab = "security";
        navigateTo("settings");
      },
      onQuickLock: () => void handleMenuAction("lock-app"),
      onBrightnessChange: (val) => {
        st.prefs.brightness = val;
        shellEl.style.filter = `brightness(${val}%)`;
        savePreferences(st.prefs);
      },
    });
  };

  const renderLockScreen = () => {
    if (isAppLocked()) {
      aiFloatEl.classList.remove("is-visible");
      aiDockEl.classList.add("is-hidden");
      aiResizerEl.classList.add("is-hidden");
    }
    renderLockScreenView(lockLayerEl, {
      securityCfg: st.securityCfg,
      gateMode: st.gateMode,
      onChangeGateMode: (m) => {
        st.gateMode = m;
        renderLockScreen();
      },
      onUnlocked: async () => {
        await refreshSecurityAndTelemetry();
        st.gateMode = st.securityCfg.vault_pin_enabled ? "pin" : "password";
        updateWindowAndTitleBar();
        renderMenuBar();
        renderLockScreen();
        if (st.activeView === "editor" && st.activeDoc) await selectDocument(st.activeDoc.id, true);
        else renderMainStage();
        renderAIStudio();
        renderStatusBar();
      },
      onRefreshSecurity: async () => {
        await refreshSecurityAndTelemetry();
        renderLockScreen();
      },
    });
  };

  const scheduleAutoSave = () => {
    if (!st.activeDoc || st.activeDoc.encrypted) return;
    st.saveState = "dirty";
    syncEditorSaveButton();
    renderStatusBar();
    if (!st.prefs.autoSave) return;
    if (autoSaveTimer !== null) window.clearTimeout(autoSaveTimer);
    autoSaveTimer = window.setTimeout(() => void performAutoSave(), 1400);
  };

  const performAutoSave = async () => {
    if (!st.activeDoc || st.activeDoc.encrypted) return;
    st.saveState = "saving";
    syncEditorSaveButton();
    renderStatusBar();
    try {
      const savedId = await WritttIPC.autoSaveDocument({
        frontmatter: {
          id: st.activeDoc.id,
          type: "markdown",
          title: st.activeDoc.title,
          tags: st.activeDoc.tags,
          is_vault: st.activeDoc.is_vault,
          encrypted: st.activeDoc.encrypted,
          parent_id: st.activeDoc.parent_id,
          doc_type: st.activeDoc.doc_type,
          version: st.activeDoc.version,
          sort_order: st.activeDoc.sort_order,
        },
        content: st.activeDoc.content,
      });
      if (savedId && st.activeDoc) st.activeDoc.id = savedId;
      st.saveState = "saved";
      syncEditorSaveButton();
      await refreshDocList();
      if (st.activeView === "editor") renderSidebar();
      renderStatusBar();
    } catch {
      st.saveState = "dirty";
      syncEditorSaveButton();
      renderStatusBar();
    }
  };

  const saveExplicitSnapshot = async (silent = false) => {
    if (!st.activeDoc || st.activeDoc.encrypted) return;
    if (autoSaveTimer !== null) {
      window.clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    st.saveState = "saving";
    syncEditorSaveButton();
    renderStatusBar();
    try {
      const savedId = await WritttIPC.saveDocument({
        frontmatter: {
          id: st.activeDoc.id,
          type: "markdown",
          title: st.activeDoc.title,
          tags: st.activeDoc.tags,
          is_vault: st.activeDoc.is_vault,
          encrypted: st.activeDoc.encrypted,
          parent_id: st.activeDoc.parent_id,
          doc_type: st.activeDoc.doc_type,
          version: st.activeDoc.version,
          sort_order: st.activeDoc.sort_order,
        },
        content: st.activeDoc.content,
      });
      if (savedId) st.activeDoc.id = savedId;
      st.saveState = "saved";
      syncEditorSaveButton();
      syncAiSessionForDoc(st.activeDoc.id, st.activeDoc.is_vault);
      void WritttIPC.setActiveEditorBridgeDoc(st.activeDoc.id);
      await Promise.all([refreshDocList(), refreshDocVersions(st.activeDoc.id), refreshSecurityAndTelemetry()]);
      if (st.docVersions.length > 0 && st.activeDoc) {
        st.activeDoc.version = st.docVersions[0].version;
      }
      if (st.activeView === "editor") renderSidebar();
      if (st.inspectorOpen) renderInspector();
      if (st.aiStudioOpen) renderAIStudio(true);
      renderStatusBar();
      if (!silent) showMatzToast(t("Snapshot de versao salvo!", "Version snapshot saved!", "Version guardada!"));
    } catch (e: any) {
      st.saveState = "dirty";
      syncEditorSaveButton();
      renderStatusBar();
      showMatzToast(`${t("Erro ao salvar", "Save failed", "Error al guardar")}: ${e?.message || e}`);
    }
  };

  const addSubChapterToWork = async (parentId: string) => {
    if (!parentId) return;
    try {
      if (st.activeDoc?.id === parentId && st.saveState === "dirty") {
        await performAutoSave();
      }
      const subDoc = await WritttIPC.createSubChapter(parentId, "");
      await refreshDocList();
      if (subDoc?.frontmatter?.id) {
        st.editorMode = "rich";
        await selectDocument(subDoc.frontmatter.id, true);
        const titleInput = document.getElementById("writtt-page-title-input") as HTMLInputElement | null;
        titleInput?.focus();
        titleInput?.select();
        showMatzToast(
          t(
            "Novo subcapitulo em branco adicionado dentro da obra!",
            "New blank sub-chapter added inside this work!",
            "Nuevo subcapitulo en blanco agregado a la obra!"
          )
        );
      }
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  };

  const duplicateWork = async (sourceId: string, openAfterCopy: boolean) => {
    if (!sourceId) return;
    try {
      if (st.activeDoc?.id === sourceId && st.saveState === "dirty") {
        await performAutoSave();
      }
      const copyDoc = await WritttIPC.duplicateDocument(sourceId, "");
      await refreshDocList();
      if (openAfterCopy && copyDoc?.frontmatter?.id) {
        st.editorMode = "rich";
        await selectDocument(copyDoc.frontmatter.id, true);
      } else {
        renderMainStage();
        renderStatusBar();
      }
      showMatzToast(
        t(
          "Copia independente criada com sucesso!",
          "Standalone copy created successfully!",
          "Copia independiente creada con exito!"
        )
      );
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  };

  const createNewDocument = async (isVault = false) => {
    if (isVault && !st.securityCfg.password_enabled) {
      showMatzToast(t("Configure uma Senha Mestra em Configuracoes -> Cofre & Seguranca primeiro.", "Set a Master Password in Settings -> Vault & Security first.", "Configura tu Contrasena Maestra primero."));
      st.settingsTab = "security";
      navigateTo("settings");
      return;
    }
    st.activeView = "editor";
    st.activeDoc = {
      id: "",
      title: isVault ? t("Obra Protegida", "Sealed Manuscript", "Obra Protegida") : t("Novo Manuscrito", "New Manuscript", "Nuevo Manuscrito"),
      content: "",
      tags: isVault ? ["cofre"] : [],
      is_vault: isVault,
      encrypted: false,
      parent_id: "",
      doc_type: "document",
      version: 1,
      sort_order: 0,
    };
    st.docBreadcrumbs = [];
    st.splitCompareDoc = null;
    await saveExplicitSnapshot(true);
    navigateTo("editor");
    const titleInput = document.getElementById("writtt-page-title-input") as HTMLInputElement | null;
    titleInput?.focus();
    titleInput?.select();
  };

  const selectDocument = async (id: string, bypassCache = false) => {
    try {
      const raw = await WritttIPC.readDocument(id, bypassCache);
      if (!raw) return;
      const fm = raw.frontmatter || ({} as any);
      st.activeView = "editor";
      st.activeDoc = {
        id: fm.id || id,
        title: fm.title || t("Sem titulo", "Untitled", "Sin titulo"),
        content: raw.content || "",
        tags: Array.isArray(fm.tags) ? fm.tags : [],
        is_vault: Boolean(fm.is_vault),
        encrypted: Boolean(fm.encrypted),
        parent_id: fm.parent_id || "",
        doc_type: fm.doc_type || "document",
        version: fm.version || 1,
        sort_order: fm.sort_order || 0,
      };
      st.saveState = "saved";
      syncAiSessionForDoc(st.activeDoc.id, st.activeDoc.is_vault);
      void WritttIPC.setActiveEditorBridgeDoc(st.activeDoc.id);
      await Promise.all([
        refreshDocVersions(st.activeDoc.id),
        WritttIPC.getDocumentBreadcrumbs(st.activeDoc.id)
          .then((b) => {
            st.docBreadcrumbs = b;
          })
          .catch(() => {
            st.docBreadcrumbs = [];
          }),
      ]);
      if (st.activeDoc.parent_id) {
        try {
          const pRaw = await WritttIPC.readDocument(st.activeDoc.parent_id);
          st.splitCompareDoc = pRaw?.frontmatter
            ? {
                id: pRaw.frontmatter.id,
                title: pRaw.frontmatter.title || "Parent",
                content: pRaw.content || "",
                tags: pRaw.frontmatter.tags || [],
                is_vault: Boolean(pRaw.frontmatter.is_vault),
                encrypted: Boolean(pRaw.frontmatter.encrypted),
                parent_id: pRaw.frontmatter.parent_id || "",
                doc_type: pRaw.frontmatter.doc_type || "document",
                version: pRaw.frontmatter.version || 1,
                sort_order: pRaw.frontmatter.sort_order || 0,
              }
            : null;
        } catch {
          st.splitCompareDoc = null;
        }
      } else {
        st.splitCompareDoc = null;
        if (st.editorMode === "dual") st.editorMode = "rich";
      }
      navigateTo("editor");
    } catch (e: any) {
      showMatzToast(`${t("Erro ao abrir documento", "Failed to open document", "Error al abrir")}: ${e?.message || e}`);
    }
  };

  const importDocumentFlow = async (isVault = false) => {
    try {
      const id = await WritttIPC.importDocumentDialog(isVault);
      if (id) {
        await refreshDocList();
        await selectDocument(id, true);
        showMatzToast(t("Manuscrito importado!", "Manuscript imported!", "Manuscrito importado!"));
      }
    } catch {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".md,.txt,text/markdown,text/plain";
      inp.onchange = () => {
        const f = inp.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
          try {
            const id = await WritttIPC.importDocumentContent(f.name, String(r.result || ""), isVault);
            await refreshDocList();
            await selectDocument(id, true);
            showMatzToast(t("Manuscrito importado!", "Manuscript imported!", "Manuscrito importado!"));
          } catch (e: any) {
            showMatzToast(`${e?.message || e}`);
          }
        };
        r.readAsText(f);
      };
      inp.click();
    }
  };

  const exportDocumentFlow = async (fmt: "epub" | "html" | "md") => {
    if (!st.activeDoc?.id) return;
    try {
      const savedPath = await WritttIPC.saveExportArtifactDialog(st.activeDoc.id, fmt);
      if (savedPath) {
        showMatzToast(`${fmt.toUpperCase()} salvo em: ${savedPath}`);
        return;
      }
    } catch {
      // fallback
    }
    try {
      const res = await WritttIPC.exportDocumentArtifact(st.activeDoc.id, fmt);
      triggerBase64Download(res.filename, res.base64Data);
      showMatzToast(`Exportado: ${res.filename} (${res.sizeBytes}B)`);
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  };

  const uploadImageAttachment = async (file: File): Promise<string | null> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const url = await WritttIPC.saveAttachment(file.name, String(reader.result || ""));
          showMatzToast(`${t("Imagem anexada", "Image attached", "Imagen adjunta")}: ${file.name}`);
          resolve(url);
        } catch (e: any) {
          showMatzToast(`${e?.message || e}`);
          resolve(null);
        }
      };
      reader.readAsDataURL(file);
    });

  const applyPrefsLive = () => {
    shellEl.style.filter = `brightness(${st.prefs.brightness}%)`;
    tiptap?.applyPreferences(st.prefs);
    const pageEl = document.getElementById("writtt-page-container");
    if (pageEl) {
      pageEl.classList.remove("width-focused", "width-comfortable", "width-wide");
      pageEl.classList.add(`width-${st.prefs.pageWidth}`);
    }
    renderMenuBar();
    renderStatusBar();
  };

  const renderInspector = () => {
    const show = st.activeView === "editor" && st.inspectorOpen && !st.zenMode && Boolean(st.activeDoc);
    inspectorEl.classList.toggle("is-hidden", !show);
    inspResizerEl.classList.toggle("is-hidden", !show);
    if (!show || !st.activeDoc) return;

    const { chapters, stats } = extractChaptersAndStats(st.activeDoc.content);
    renderInspectorPanel(
      inspectorEl,
      {
        tab: st.inspectorTab,
        activeDocId: st.activeDoc.id,
        activeDocTitle: st.activeDoc.title,
        activeDocParentId: st.activeDoc.parent_id,
        activeDocVersion: st.activeDoc.version,
        chapters,
        stats,
        prefs: st.prefs,
        docs: st.docs,
        docVersions: st.docVersions,
        customDictionary: st.customDictionary,
        lastProof: st.lastProof,
      },
      {
        onSelectTab: (tab) => {
          st.inspectorTab = tab;
          renderInspector();
        },
        onClose: () => {
          st.inspectorOpen = false;
          renderMainStage();
          renderInspector();
        },
        onJumpChapter: (headingIdx, lineNum) => {
          if (st.editorMode === "rich") {
            tiptap?.scrollToHeadingIndex(headingIdx);
          } else {
            const ta = document.getElementById("writtt-source-ta") as HTMLTextAreaElement | null;
            if (ta && st.activeDoc) {
              const lines = st.activeDoc.content.split("\n");
              const pos = lines.slice(0, Math.max(0, lineNum - 1)).join("\n").length;
              ta.focus();
              ta.setSelectionRange(pos, pos);
            }
          }
        },
        onAddSubChapter: () => {
          if (st.activeDoc?.id) void addSubChapterToWork(st.activeDoc.id);
        },
        onDuplicateDoc: () => {
          if (st.activeDoc?.id) void duplicateWork(st.activeDoc.id, true);
        },
        onMoveParent: async (pid) => {
          if (!st.activeDoc?.id) return;
          try {
            await WritttIPC.moveDocument(st.activeDoc.id, pid, st.activeDoc.sort_order);
            st.activeDoc.parent_id = pid;
            st.docBreadcrumbs = await WritttIPC.getDocumentBreadcrumbs(st.activeDoc.id).catch(() => []);
            await refreshDocList();
            renderSidebar();
            renderInspector();
            showMatzToast(t("Hierarquia atualizada", "Hierarchy updated", "Jerarquia actualizada"));
          } catch (e: any) {
            showMatzToast(`${e?.message || e}`);
          }
        },
        onAddDictWord: async (word) => {
          st.customDictionary = await WritttIPC.addDictionaryWord(word);
          renderInspector();
          showMatzToast(`"${word}" adicionado ao dicionario.`);
        },
        onRemoveDictWord: async (word) => {
          st.customDictionary = await WritttIPC.removeDictionaryWord(word);
          renderInspector();
        },
        onDiffVersion: (fromVer) => {
          if (!st.activeDoc) return;
          const snap = st.docVersions.find((v) => v.version === fromVer);
          openMatzDiffModal(
            `Diff v${fromVer} -> Atual (v${st.activeDoc.version})`,
            "Unified & Side-by-Side Intraline Diff (@matz/ui/diff)",
            { before: snap?.content || "", after: st.activeDoc.content, fileName: `${st.activeDoc.title}.md` }
          );
        },
        onRestoreVersion: async (ver) => {
          if (!st.activeDoc?.id) return;
          try {
            await WritttIPC.restoreDocumentVersion(st.activeDoc.id, ver);
            await selectDocument(st.activeDoc.id, true);
            showMatzToast(`Versao v${ver} restaurada!`);
          } catch (e: any) {
            showMatzToast(`${e?.message || e}`);
          }
        },
        onGenerateAuthorshipProof: () => void handleMenuAction("issue-proof"),
        onCopyText: async (text, label) => {
          try {
            await navigator.clipboard.writeText(text);
            showMatzToast(`${label} copiado!`);
          } catch {
            showMatzToast("Nao foi possivel copiar");
          }
        },
        onSelectDoc: (id) => void selectDocument(id, true),
        onExportFormat: (fmt) => void exportDocumentFlow(fmt),
        onExportPack: async (pass) => {
          try {
            const p = await WritttIPC.exportWritttPackDialog("Writtt-Vault-Backup", pass);
            if (p) {
              showMatzToast(`.writttpack salvo em: ${p}`);
              return;
            }
          } catch {
            // fallback
          }
          const res = await WritttIPC.exportWritttPack("Writtt-Vault-Backup", pass);
          triggerBase64Download(res.filename, res.base64Data, "application/zip");
          showMatzToast(`Pacote .writttpack selado (${res.sizeBytes}B)`);
        },
        onImportPack: async (pass) => {
          try {
            const c = await WritttIPC.importWritttPackDialog(pass);
            if (c > 0) {
              await refreshDocList();
              renderSidebar();
              showMatzToast(`${c} documentos importados!`);
            }
          } catch (e: any) {
            showMatzToast(`${e?.message || e}`);
          }
        },
        onUpdatePrefs: (patch) => {
          st.prefs = { ...st.prefs, ...patch };
          savePreferences(st.prefs);
          applyPrefsLive();
          renderInspector();
        },
      }
    );
  };

  const popoutAIStudioToOSWindow = async () => {
    void WritttIPC.setActiveEditorBridgeDoc(st.activeDoc?.id || "");
    const openedNative = await WritttIPC.openDetachedAIWindow();
    if (openedNative) {
      st.aiStudioOpen = false;
      renderAIStudio();
      if (st.activeView === "editor") renderMainStage();
      showMatzToast(
        t(
          "Estudio IA aberto em janela independente — arraste livremente para outro monitor.",
          "AI Studio opened in a standalone window — drag freely to another monitor.",
          "Estudio IA abierto en ventana independiente — arrastrala a otro monitor."
        )
      );
      return;
    }

    const popup = window.open("/?window=ai-studio", "WritttAIStudio", "popup=yes,width=520,height=800");
    if (popup) {
      st.aiStudioOpen = false;
      renderAIStudio();
      if (st.activeView === "editor") renderMainStage();
      return;
    }

    st.aiStudioOpen = true;
    st.aiStudioPlacement = "floating";
    renderAIStudio();
    if (st.activeView === "editor") renderMainStage();
  };

  const forwardChatbotTurnsInMain = (indices: number[]) => {
    const nextExcerpts = buildChatbotContextExcerpts(st.freeChatbotHistory, indices);
    if (nextExcerpts.length === 0) return;
    const byId = new Map(st.attachedChatbotExcerpts.map((ex) => [ex.id, ex]));
    for (const ex of nextExcerpts) byId.set(ex.id, ex);
    st.attachedChatbotExcerpts = Array.from(byId.values());
    st.selectedChatbotTurnIndices = [];
    st.aiStudioTab = "editorial";
    renderAIStudio();
    const activeHost = st.aiStudioPlacement === "floating" ? aiFloatContentEl : aiDockEl;
    (activeHost.querySelector("#ais-composer-ta") as HTMLTextAreaElement | null)?.focus();
    showMatzToast(
      t(
        "Trechos adicionados ao contexto do Editor IA!",
        "Excerpts attached to Editorial AI context!",
        "Fragmentos agregados al contexto del Editor IA!"
      )
    );
  };

  const renderAIStudio = (preserveComposerDraft = false) => {
    if (isAppLocked() || !st.aiStudioOpen) {
      aiDockEl.classList.add("is-hidden");
      aiResizerEl.classList.add("is-hidden");
      aiFloatEl.classList.remove("is-visible");
      return;
    }

    const effectiveFloating =
      st.aiStudioPlacement === "floating" || st.activeView !== "editor" || st.zenMode;
    const targetHost = effectiveFloating ? aiFloatContentEl : aiDockEl;
    const prevDraft = preserveComposerDraft
      ? (aiDockEl.querySelector("#ais-composer-ta") as HTMLTextAreaElement | null)?.value ||
        (aiFloatContentEl.querySelector("#ais-composer-ta") as HTMLTextAreaElement | null)?.value ||
        ""
      : "";

    if (effectiveFloating) {
      aiDockEl.classList.add("is-hidden");
      aiDockEl.innerHTML = "";
      aiResizerEl.classList.add("is-hidden");
    } else {
      aiFloatEl.classList.remove("is-visible");
      aiFloatContentEl.innerHTML = "";
      aiDockEl.classList.remove("is-hidden");
      aiResizerEl.classList.remove("is-hidden");
    }

    const wasFloatVisible = aiFloatEl.classList.contains("is-visible");
    const activeFeedback = inspectorAiFeedback;
    inspectorAiFeedback = "";
    const docKey = st.activeDoc?.id || "__global_editorial__";

    renderAIStudioPanel(
      targetHost,
      {
        tab: st.aiStudioTab,
        placement: effectiveFloating ? "floating" : "docked",
        isStandaloneWindow: false,
        historyOpen: st.aiHistoryDrawerOpen,
        activeDocId: st.activeDoc?.id || "",
        activeDocTitle: st.activeDoc?.title || "",
        localAiOnline: st.localAiOnline,
        aiModels: st.aiModels,
        aiModelCaps: st.aiModelCaps,
        selectedAiModel: st.selectedAiModel,
        aiSessions: aiRepo.listForDocument(docKey),
        activeAiSessionId: st.activeAiSessionId,
        aiChatHistory: st.aiChatHistory,
        chatbotSessions: aiRepo.listChatbotSessions(st.activeDoc?.id || ""),
        activeChatbotSessionId: st.activeChatbotSessionId,
        freeChatbotHistory: st.freeChatbotHistory,
        selectedChatbotTurnIndices: st.selectedChatbotTurnIndices,
        attachedChatbotExcerpts: st.attachedChatbotExcerpts,
        chatbotIncludeDoc: st.chatbotIncludeDoc,
        aiUseRag: st.aiUseRag,
        aiBusy: st.aiBusy,
        aiAppliedFeedback: activeFeedback,
        ragQuery: st.ragQuery,
        ragResults: st.ragResults,
      },
      {
        onSelectTab: (tab) => {
          st.aiStudioTab = tab;
          renderAIStudio();
        },
        onToggleHistory: () => {
          st.aiHistoryDrawerOpen = !st.aiHistoryDrawerOpen;
          renderAIStudio(true);
        },
        onToggleFloating: () => {
          if (st.activeView !== "editor" || st.zenMode) {
            if (st.zenMode) st.zenMode = false;
            st.aiStudioPlacement = "docked";
            navigateWithEditorFallback("editor");
            return;
          }
          st.aiStudioPlacement = st.aiStudioPlacement === "floating" ? "docked" : "floating";
          renderAIStudio(true);
        },
        onSnapFloatingCorner: () => {
          aiFloatController.cycleCornerPreset();
        },
        onPopoutOSWindow: () => void popoutAIStudioToOSWindow(),
        onClose: () => {
          st.aiStudioOpen = false;
          renderAIStudio();
          if (st.activeView === "editor") renderMainStage();
        },
        onSelectAiModel: (m) => {
          st.selectedAiModel = m;
        },
        onTestOllama: async () => {
          await loadAiStatus();
          renderMenuBar();
          renderAIStudio(true);
          if (st.activeView === "editor") {
            document
              .querySelector("#hdr-ai-btn .writtt-status-dot")
              ?.classList.toggle("is-online", st.localAiOnline);
            document
              .querySelector("#hdr-ai-btn .writtt-status-dot")
              ?.classList.toggle("is-offline", !st.localAiOnline);
          }
          showMatzToast(
            st.localAiOnline
              ? `${t("Ollama conectado!", "Ollama connected!", "Ollama conectado!")} (${st.aiModels.length} modelos)`
              : t("Ollama nao encontrado em localhost:11434.", "Ollama not found on localhost:11434.", "Ollama no encontrado.")
          );
        },
        onToggleAiRag: (enabled) => {
          st.aiUseRag = enabled;
        },
        onToggleChatbotDocCtx: (enabled) => {
          st.chatbotIncludeDoc = enabled;
        },
        onToggleSelectChatbotTurn: (idx) => {
          st.selectedChatbotTurnIndices = st.selectedChatbotTurnIndices.includes(idx)
            ? st.selectedChatbotTurnIndices.filter((i) => i !== idx)
            : [...st.selectedChatbotTurnIndices, idx];
          renderAIStudio(true);
        },
        onClearSelectedChatbotTurns: () => {
          st.selectedChatbotTurnIndices = [];
          renderAIStudio(true);
        },
        onForwardSelectedToEditorial: () => forwardChatbotTurnsInMain(st.selectedChatbotTurnIndices),
        onForwardSingleTurnToEditorial: (idx) => forwardChatbotTurnsInMain([idx]),
        onForwardEntireChatToEditorial: () => {
          const allIdxs = st.freeChatbotHistory
            .map((m, idx) => (m.role === "assistant" ? idx : -1))
            .filter((idx) => idx >= 0);
          forwardChatbotTurnsInMain(allIdxs);
        },
        onRemoveAttachedExcerpt: (id) => {
          st.attachedChatbotExcerpts = st.attachedChatbotExcerpts.filter((ex) => ex.id !== id);
          renderAIStudio(true);
        },
        onClearAttachedExcerpts: () => {
          st.attachedChatbotExcerpts = [];
          renderAIStudio(true);
        },
        onSelectAiSession: (sessionId) => {
          const found = aiRepo.getById(sessionId);
          if (found) {
            inspectorAiFeedback = "";
            st.activeAiSessionId = found.id;
            st.aiChatHistory = [...found.messages];
            st.aiHistoryDrawerOpen = false;
            renderAIStudio(true);
          }
        },
        onNewAiSession: () => {
          inspectorAiFeedback = "";
          st.activeAiSessionId = "";
          st.aiChatHistory = [];
          st.aiHistoryDrawerOpen = false;
          renderAIStudio();
        },
        onDeleteAiSession: (sessionId) => {
          aiRepo.remove(sessionId);
          if (st.activeAiSessionId === sessionId) {
            st.activeAiSessionId = "";
            st.aiChatHistory = [];
          }
          renderAIStudio(true);
        },
        onSelectChatbotSession: (sessionId) => {
          const found = aiRepo.getById(sessionId);
          if (found) {
            st.activeChatbotSessionId = found.id;
            st.freeChatbotHistory = [...found.messages];
            st.selectedChatbotTurnIndices = [];
            st.aiHistoryDrawerOpen = false;
            renderAIStudio(true);
          }
        },
        onNewChatbotSession: () => {
          st.activeChatbotSessionId = "";
          st.freeChatbotHistory = [];
          st.selectedChatbotTurnIndices = [];
          st.aiHistoryDrawerOpen = false;
          renderAIStudio();
        },
        onDeleteChatbotSession: (sessionId) => {
          aiRepo.remove(sessionId);
          if (st.activeChatbotSessionId === sessionId) {
            st.activeChatbotSessionId = "";
            st.freeChatbotHistory = [];
          }
          renderAIStudio(true);
        },
        onEditAiMessageContent: (msgIndex, newContent) => {
          if (msgIndex < 0 || msgIndex >= st.aiChatHistory.length) return;
          st.aiChatHistory = st.aiChatHistory.map((m, i) =>
            i === msgIndex ? { ...m, insertableContent: newContent } : m
          );
          const saved = aiRepo.upsert({
            docId: docKey,
            isVault: Boolean(st.activeDoc?.is_vault),
            activeSessionId: st.activeAiSessionId,
            source: "chat",
            titleSeed: st.aiChatHistory[0]?.content || "Conversa IA",
            messages: st.aiChatHistory,
          });
          st.activeAiSessionId = saved.id;
          renderAIStudio(true);
          showMatzToast(t("Texto da resposta atualizado!", "AI response updated!", "Respuesta actualizada!"));
        },
        onClearAiChat: () => {
          st.activeAiSessionId = "";
          st.aiChatHistory = [];
          renderAIStudio();
        },
        onAskEditorialAi: async (promptText) => {
          if (!promptText.trim()) return;
          inspectorAiFeedback = "";
          const attachedSnapshot = [...st.attachedChatbotExcerpts];
          const { contextBlock, redactedCount: excerptRedacted } =
            formatChatbotExcerptsForEditorialAI(attachedSnapshot);
          st.attachedChatbotExcerpts = [];

          const userLabel =
            attachedSnapshot.length > 0
              ? `${promptText.trim()}\n\n[${t("Contexto do Chatbot", "Chatbot Context", "Contexto del Chatbot")}: ${attachedSnapshot.length}]`
              : promptText.trim();

          st.aiChatHistory = [...st.aiChatHistory, { role: "user", content: userLabel }];
          st.aiBusy = true;
          renderAIStudio();
          try {
            const sanitized =
              st.activeDoc && !st.activeDoc.encrypted
                ? sanitizeContextForAI(st.activeDoc.content)
                : { sanitized: "", redactedCount: 0 };
            const reply = await WritttIPC.chatWithAssistant(
              st.selectedAiModel,
              st.aiChatHistory,
              sanitized.sanitized,
              contextBlock,
              st.aiUseRag
            );
            st.aiChatHistory = [
              ...st.aiChatHistory,
              {
                role: "assistant",
                content: reply.raw,
                opinion: reply.opinion,
                insertableContent: reply.insertableContent,
                hasInsertable: reply.hasInsertable,
                redactedCount: reply.redactedCount + sanitized.redactedCount + excerptRedacted,
                ragChunksUsed: reply.ragChunksUsed,
              },
            ];
            const saved = aiRepo.upsert({
              docId: docKey,
              isVault: Boolean(st.activeDoc?.is_vault),
              activeSessionId: st.activeAiSessionId,
              source: "chat",
              titleSeed: promptText.trim(),
              messages: st.aiChatHistory,
            });
            st.activeAiSessionId = saved.id;
          } catch (e: any) {
            st.aiChatHistory = [
              ...st.aiChatHistory,
              {
                role: "assistant",
                content: `${e?.message || e}`,
                opinion: `${t("Nao foi possivel consultar o Ollama:", "Could not reach Ollama:", "Error de Ollama:")} ${e?.message || e}`,
              },
            ];
          } finally {
            st.aiBusy = false;
            await refreshSecurityAndTelemetry();
            renderAIStudio();
          }
        },
        onAskChatbot: async (promptText) => {
          if (!promptText.trim()) return;
          const chatCapable = st.aiModelCaps.filter((c) => c.supportsChat);
          const modelToUse = chatCapable.some((c) => c.name === st.selectedAiModel)
            ? st.selectedAiModel
            : chatCapable[0]?.name || st.selectedAiModel;

          st.freeChatbotHistory = [...st.freeChatbotHistory, { role: "user", content: promptText.trim() }];
          st.aiBusy = true;
          renderAIStudio();
          try {
            const docCtx =
              st.chatbotIncludeDoc && st.activeDoc && !st.activeDoc.encrypted
                ? sanitizeContextForAI(st.activeDoc.content).sanitized
                : "";
            const reply = await WritttIPC.freeChatWithAssistant(
              modelToUse,
              st.freeChatbotHistory,
              st.chatbotIncludeDoc,
              docCtx,
              st.aiUseRag
            );
            const botText = reply.opinion || reply.raw;
            st.freeChatbotHistory = [
              ...st.freeChatbotHistory,
              {
                role: "assistant",
                content: botText,
                ragChunksUsed: reply.ragChunksUsed,
                redactedCount: reply.redactedCount,
              },
            ];
            const targetDocId = st.activeDoc?.id || "__global_chatbot__";
            const isVaultContext = Boolean(st.activeDoc?.is_vault);
            const saved = aiRepo.upsert({
              docId: targetDocId,
              isVault: isVaultContext,
              activeSessionId: st.activeChatbotSessionId,
              source: "chatbot",
              titleSeed: st.freeChatbotHistory[0]?.content || promptText.trim(),
              messages: st.freeChatbotHistory,
            });
            st.activeChatbotSessionId = saved.id;
          } catch (e: any) {
            st.freeChatbotHistory = [
              ...st.freeChatbotHistory,
              {
                role: "assistant",
                content: `${t("Nao foi possivel conversar com o modelo:", "Could not chat with model:", "No se pudo conversar con el modelo:")} ${e?.message || e}`,
              },
            ];
          } finally {
            st.aiBusy = false;
            await refreshSecurityAndTelemetry();
            renderAIStudio();
          }
        },
        onInsertAiText: async (text, msgIndex) => {
          if (!text) return;
          if (!st.activeDoc) {
            await createNewDocument(false);
          }
          if (!st.activeDoc) return;
          if (st.activeView !== "editor") {
            navigateTo("editor");
          }
          if (st.editorMode === "rich" && tiptap) tiptap.insertRawContentWithDiffFlash(`\n\n${text}\n`);
          else {
            st.activeDoc.content += `\n\n${text}\n`;
            renderMainStage();
          }
          scheduleAutoSave();

          if (st.aiChatHistory.length > 0) {
            const nowIso = new Date().toISOString();
            const targetIdx =
              typeof msgIndex === "number" && msgIndex >= 0 && msgIndex < st.aiChatHistory.length
                ? msgIndex
                : st.aiChatHistory.length - 1;
            const archivedMsgs = st.aiChatHistory.map((m, i) =>
              i === targetIdx && m.role === "assistant"
                ? { ...m, appliedAt: nowIso, appliedMode: "insert" as const }
                : m
            );
            const existingSession = st.activeAiSessionId ? aiRepo.getById(st.activeAiSessionId) : undefined;
            aiRepo.upsert({
              docId: st.activeDoc.id,
              isVault: st.activeDoc.is_vault,
              activeSessionId: st.activeAiSessionId,
              source: existingSession?.source || "chat",
              titleSeed: existingSession?.title || archivedMsgs[0]?.content || text.slice(0, 40),
              messages: archivedMsgs,
            });
          }

          st.activeAiSessionId = "";
          st.aiChatHistory = [];
          inspectorAiFeedback = t(
            "Conteudo inserido no manuscrito e salvo no Historico.",
            "Content inserted into manuscript and archived in History.",
            "Contenido insertado y guardado en el Historial."
          );
          renderAIStudio();
        },
        onCopyText: async (text, label) => {
          try {
            await navigator.clipboard.writeText(text);
            showMatzToast(`${label} copiado!`);
          } catch {
            showMatzToast("Nao foi possivel copiar");
          }
        },
        onSearchRag: async (q) => {
          st.ragQuery = q;
          try {
            st.ragResults = await WritttIPC.searchWorkspaceRAG(q, 6);
            renderAIStudio();
          } catch (e: any) {
            showMatzToast(`${e?.message || e}`);
          }
        },
        onSelectDoc: (id) => void selectDocument(id, true),
      }
    );

    if (prevDraft) {
      const nextTa = targetHost.querySelector("#ais-composer-ta") as HTMLTextAreaElement | null;
      if (nextTa) nextTa.value = prevDraft;
    }

    if (effectiveFloating) {
      aiFloatEl.classList.add("is-visible");
      if (!wasFloatVisible) {
        const aiBtnRect = document.getElementById("hdr-ai-btn")?.getBoundingClientRect();
        aiFloatController.openNearAnchor(
          aiBtnRect
            ? {
                left: aiBtnRect.left,
                top: aiBtnRect.top,
                right: aiBtnRect.right,
                bottom: aiBtnRect.bottom,
              }
            : null
        );
      } else {
        aiFloatController.ensureVisible();
      }
    }
  };

  const renderMainStage = () => {
    tiptap?.destroy();
    tiptap = null;

    if (st.activeView === "home") {
      const allTags = Array.from(new Set(st.docs.flatMap((d) => d.tags || []).filter(Boolean))).sort();
      renderHomeView(
        mainEl,
        {
          docs: st.docs,
          allTags,
          filter: st.docFilter,
          selectedTag: st.selectedTagFilter,
          searchQuery: st.searchQuery,
          securityCfg: st.securityCfg,
          localAiOnline: st.localAiOnline,
          aiModelCount: st.aiModels.length,
          showHomeHeader: st.prefs.showHomeHeader !== false,
          showHomeCapabilities: st.prefs.showHomeCapabilities !== false,
        },
        {
          onNewPublicDoc: () => void createNewDocument(false),
          onNewVaultDoc: () => void createNewDocument(true),
          onImportDoc: (isVault) => void importDocumentFlow(isVault),
          onOpenSettings: () => {
            st.settingsTab = "security";
            navigateTo("settings");
          },
          onOpenSettingsTab: (tab) => {
            st.settingsTab = tab;
            navigateTo("settings");
          },
          onOpenHelp: () => {
            st.helpTopic = "overview";
            navigateTo("help");
          },
          onOpenHelpTopic: (topic) => {
            st.helpTopic = topic;
            navigateTo("help");
          },
          onOpenEditorAi: () => void handleMenuAction("open-ai-direct"),
          onHideSection: (section) => {
            if (section === "header") {
              st.prefs = { ...st.prefs, showHomeHeader: false };
            } else {
              st.prefs = { ...st.prefs, showHomeCapabilities: false };
            }
            savePreferences(st.prefs);
            renderMainStage();
            showMatzToast(
              t(
                "Secao ocultada da Tela Inicial. Voce pode reativa-la em Configuracoes -> Aparencia.",
                "Section hidden from Home screen. Restore it anytime in Settings -> Appearance.",
                "Seccion ocultada de Inicio. Puedes reactivarla en Configuracion -> Apariencia."
              )
            );
          },
          onSelectDoc: (id) => void selectDocument(id),
          onFilterChange: async (f) => {
            st.docFilter = f;
            await refreshDocList();
            renderMainStage();
          },
          onTagChange: async (tg) => {
            st.selectedTagFilter = tg;
            await refreshDocList();
            renderMainStage();
          },
          onSearchChange: async (q) => {
            st.searchQuery = q;
            await refreshDocList();
            renderMainStage();
          },
          onDuplicateDoc: (doc) => void duplicateWork(doc.id, false),
          onRenameDoc: async (doc) => {
            const nextTitle = window.prompt(t("Novo titulo da obra:", "New manuscript title:", "Nuevo titulo:"), doc.title);
            if (!nextTitle?.trim()) return;
            await WritttIPC.renameDocument(doc.id, nextTitle.trim());
            await refreshDocList();
            renderMainStage();
            showMatzToast(t("Titulo atualizado!", "Title updated!", "Titulo actualizado!"));
          },
          onToggleVaultDoc: async (doc) => {
            if (!doc.is_vault && !st.securityCfg.password_enabled) {
              showMatzToast(t("Configure uma Senha Mestra em Configuracoes -> Cofre & Seguranca primeiro.", "Set a Master Password in Settings -> Vault & Security first.", "Configura tu Contrasena Maestra primero."));
              st.settingsTab = "security";
              navigateTo("settings");
              return;
            }
            await WritttIPC.updateMetadata(doc.id, doc.tags || [], !doc.is_vault);
            aiRepo.markDocumentVaultState(doc.id, !doc.is_vault);
            await refreshDocList();
            renderMainStage();
            showMatzToast(
              !doc.is_vault
                ? t("Obra selada no Cofre E2EE!", "Manuscript sealed in E2EE Vault!", "Obra sellada en Boveda!")
                : t("Obra movida para area publica.", "Manuscript moved to public library.", "Obra movida a area publica.")
            );
          },
          onEditTagsDoc: async (doc) => {
            const raw = window.prompt(t("Tags separadas por virgula:", "Comma-separated tags:", "Etiquetas:"), (doc.tags || []).join(", "));
            if (raw === null) return;
            const tags = raw.split(",").map((s) => s.trim()).filter(Boolean);
            await WritttIPC.updateMetadata(doc.id, tags, doc.is_vault);
            await refreshDocList();
            renderMainStage();
          },
          onDeleteDoc: (doc) => {
            openMatzDialog(
              t("Excluir Manuscrito", "Delete Manuscript", "Eliminar Manuscrito"),
              `${t("Remover permanentemente", "Permanently delete", "Eliminar permanentemente")} "${doc.title}"?`,
              `<div class="writtt-help-note">ID: <code>${esc(doc.id)}</code></div>`,
              async () => {
                await WritttIPC.deleteDocument(doc.id);
                if (st.activeDoc?.id === doc.id) {
                  st.activeDoc = null;
                  void WritttIPC.setActiveEditorBridgeDoc("");
                }
                await refreshDocList();
                renderMainStage();
                renderStatusBar();
              }
            );
          },
        }
      );
      return;
    }

    if (st.activeView === "settings") {
      renderSettingsView(
        mainEl,
        {
          activeTab: st.settingsTab,
          prefs: st.prefs,
          docs: st.docs,
          securityCfg: st.securityCfg,
          driveFiles: st.driveFiles,
          expressInbox: st.expressInbox,
          trustedDevices: st.trustedDevices,
          customDictionary: st.customDictionary,
          aliasConfig: st.aliasConfig,
          algoReport: st.algoReport,
          updateInfo: st.updateInfo,
        },
        {
          onSelectTab: (tb) => {
            st.settingsTab = tb;
            renderMainStage();
          },
          onBackHome: () => navigateTo("home"),
          onUpdatePrefs: (patch) => {
            st.prefs = { ...st.prefs, ...patch };
            savePreferences(st.prefs);
            applyPrefsLive();
            renderMainStage();
          },
          onRefreshAll: async () => {
            await Promise.all([refreshSecurityAndTelemetry(), refreshDocList()]);
            updateWindowAndTitleBar();
            renderMenuBar();
            renderMainStage();
            renderStatusBar();
            renderLockScreen();
          },
          onOpenDoc: (id) => void selectDocument(id, true),
          onCheckUpdatesNow: () => checkSoftwareUpdates(true),
          onOpenUpdateDownload: openUpdateDownloadPage,
        }
      );
      return;
    }

    if (st.activeView === "help") {
      renderHelpView(mainEl, st.helpTopic, {
        onSelectTopic: (tp) => {
          st.helpTopic = tp;
          renderMainStage();
        },
        onAction: (act) => void handleMenuAction(act),
      });
      return;
    }

    if (!st.activeDoc) {
      navigateTo("home");
      return;
    }

    tiptap = renderEditorStageView(
      mainEl,
      {
        activeDoc: st.activeDoc,
        splitCompareDoc: st.splitCompareDoc,
        docBreadcrumbs: st.docBreadcrumbs,
        prefs: st.prefs,
        securityCfg: st.securityCfg,
        editorMode: st.editorMode,
        zenMode: st.zenMode,
        formatBarOpen: st.formatBarOpen,
        inspectorOpen: st.inspectorOpen,
        inspectorTab: st.inspectorTab,
        aiStudioOpen: st.aiStudioOpen,
        localAiOnline: st.localAiOnline,
        overlayMode: st.overlayMode,
        saveState: st.saveState,
      },
      {
        onChangeOverlayMode: (m) => {
          st.overlayMode = m;
          renderMainStage();
        },
        onUnlockDocumentSuccess: async () => {
          if (st.activeDoc) await selectDocument(st.activeDoc.id, true);
        },
        onOpenSecuritySettings: () => {
          st.settingsTab = "security";
          navigateTo("settings");
        },
        onRefreshSecurity: refreshSecurityAndTelemetry,
        onToggleZen: () => void handleMenuAction("toggle-zen"),
        onSelectBreadcrumb: (cid) => void selectDocument(cid, true),
        onToggleDocVault: async () => {
          if (!st.activeDoc) return;
          if (!st.activeDoc.is_vault && !st.securityCfg.password_enabled) {
            showMatzToast(t("Configure uma Senha Mestra em Configuracoes -> Cofre & Seguranca.", "Set a Master Password in Settings -> Vault & Security.", "Configura tu Contrasena Maestra."));
            st.settingsTab = "security";
            navigateTo("settings");
            return;
          }
          st.activeDoc.is_vault = !st.activeDoc.is_vault;
          aiRepo.markDocumentVaultState(st.activeDoc.id, st.activeDoc.is_vault);
          await saveExplicitSnapshot(false);
          updateWindowAndTitleBar();
          renderMainStage();
        },
        onChangeEditorMode: (nextMode) => {
          st.editorMode = nextMode;
          renderMenuBar();
          renderMainStage();
        },
        onCreateSplitSubChapter: async () => {
          if (!st.activeDoc?.id) return;
          const targetParent = st.activeDoc.parent_id || st.activeDoc.id;
          await addSubChapterToWork(targetParent);
        },
        onDuplicateDocument: async () => {
          if (!st.activeDoc?.id) return;
          await duplicateWork(st.activeDoc.id, true);
        },
        onToggleAiPanel: () => {
          st.aiStudioOpen = !st.aiStudioOpen;
          document.getElementById("hdr-ai-btn")?.classList.toggle("is-active", st.aiStudioOpen);
          renderAIStudio(true);
        },
        onToggleInspector: () => {
          st.inspectorOpen = !st.inspectorOpen;
          document.getElementById("hdr-toggle-inspector")?.classList.toggle("is-active", st.inspectorOpen);
          renderInspector();
        },
        onSaveSnapshot: () => void saveExplicitSnapshot(false),
        onTitleChange: (title) => {
          if (!st.activeDoc) return;
          st.activeDoc.title = title;
          scheduleAutoSave();
        },
        onTagsChange: (tags) => {
          if (!st.activeDoc) return;
          st.activeDoc.tags = tags;
          scheduleAutoSave();
        },
        onContentChange: (md) => {
          if (!st.activeDoc) return;
          st.activeDoc.content = md;
          scheduleAutoSave();
          if (st.inspectorOpen && st.inspectorTab === "outline") renderInspector();
        },
        onUploadImage: uploadImageAttachment,
        onOpenDrawing: () => void handleMenuAction("open-drawing"),
        onAddDictionaryWord: async (word) => {
          st.customDictionary = await WritttIPC.addDictionaryWord(word);
          showMatzToast(`"${word}" adicionado ao dicionario.`);
          if (st.inspectorOpen) renderInspector();
        },
        onMergeToParent: async () => {
          if (!st.activeDoc?.parent_id || !st.activeDoc.id) return;
          if (st.saveState === "dirty") {
            await performAutoSave();
          }
          await WritttIPC.appendSubChapterToParent(st.activeDoc.id);
          showMatzToast(t("Subcapitulo incorporado ao final da obra principal!", "Sub-chapter appended to parent work!", "Subcapitulo incorporado a la obra principal!"));
          st.editorMode = "rich";
          await refreshDocList();
          await selectDocument(st.activeDoc.parent_id, true);
        },
        onInlineAiRun: async (instruction, selectedText) => {
          const sanitized = sanitizeContextForAI(st.activeDoc?.content || "");
          const reply = await WritttIPC.chatWithAssistant(
            st.selectedAiModel,
            [{ role: "user", content: instruction }],
            sanitized.sanitized,
            selectedText,
            st.aiUseRag
          );
          if (st.activeDoc?.id) {
            const userLabel = selectedText
              ? `${instruction}\n\n[Trecho]: "${selectedText.slice(0, 160)}${selectedText.length > 160 ? "..." : ""}"`
              : instruction;
            const inlineMsgs: AIChatMessage[] = [
              { role: "user", content: userLabel },
              {
                role: "assistant",
                content: reply.raw,
                opinion: reply.opinion,
                insertableContent: reply.insertableContent,
                hasInsertable: reply.hasInsertable,
                redactedCount: reply.redactedCount + sanitized.redactedCount,
                ragChunksUsed: reply.ragChunksUsed,
              },
            ];
            const saved = aiRepo.upsert({
              docId: st.activeDoc.id,
              isVault: st.activeDoc.is_vault,
              activeSessionId: st.activeAiSessionId,
              source: "inline",
              titleSeed: instruction,
              messages: inlineMsgs,
              forceNew: true,
            });
            st.activeAiSessionId = saved.id;
            st.aiChatHistory = [...inlineMsgs];
            reply.sessionId = saved.id;
            if (st.aiStudioOpen) renderAIStudio(true);
          }
          return reply;
        },
        onInlineAiApplied: ({ sessionId, mode }) => {
          if (!st.activeDoc?.id) return;
          const targetSession =
            (sessionId ? aiRepo.getById(sessionId) : undefined) || aiRepo.getById(st.activeAiSessionId);
          if (!targetSession) return;

          const nowIso = new Date().toISOString();
          const updatedMsgs = targetSession.messages.map((m, idx, arr) =>
            idx === arr.length - 1 && m.role === "assistant"
              ? { ...m, appliedAt: nowIso, appliedMode: mode }
              : m
          );
          const saved = aiRepo.upsert({
            docId: st.activeDoc.id,
            isVault: st.activeDoc.is_vault,
            activeSessionId: targetSession.id,
            source: targetSession.source,
            titleSeed: targetSession.title,
            messages: updatedMsgs,
          });
          if (st.activeAiSessionId === saved.id) {
            st.activeAiSessionId = "";
            st.aiChatHistory = [];
          }
          if (st.aiStudioOpen) renderAIStudio(true);
        },
        onOpenInlineInSidebar: ({ selectedText, draftPrompt, hasReply, sessionId }) => {
          void (async () => {
            if (st.zenMode) {
              st.zenMode = false;
              renderMenuBar();
              renderSidebar();
              renderMainStage();
              renderStatusBar();
            }
            if (sessionId) {
              const found = aiRepo.getById(sessionId);
              if (found) {
                st.activeAiSessionId = found.id;
                st.aiChatHistory = [...found.messages];
              }
            }
            st.aiStudioOpen = true;
            st.aiStudioTab = "editorial";
            document.getElementById("hdr-ai-btn")?.classList.add("is-active");
            await loadAiStatus();
            renderMenuBar();
            renderAIStudio();

            const activeHost = st.aiStudioPlacement === "floating" ? aiFloatContentEl : aiDockEl;
            const promptInput = activeHost.querySelector("#ais-composer-ta") as HTMLTextAreaElement | null;
            if (promptInput) {
              if (!hasReply && (draftPrompt.trim() || selectedText.trim())) {
                const snippet = selectedText.trim()
                  ? `"${selectedText.trim().slice(0, 220)}${selectedText.trim().length > 220 ? "..." : ""}"`
                  : "";
                if (draftPrompt.trim() && snippet) {
                  promptInput.value = `${draftPrompt.trim()} — ${t("Trecho", "Excerpt", "Trecho")}: ${snippet}`;
                } else if (draftPrompt.trim()) {
                  promptInput.value = draftPrompt.trim();
                } else if (snippet) {
                  promptInput.value = `${t("Analise e aprimore este trecho", "Review and polish this excerpt", "Analiza y mejora este trecho")}: ${snippet}`;
                }
              }
              promptInput.focus();
              const end = promptInput.value.length;
              promptInput.setSelectionRange(end, end);
            }
          })();
        },
      }
    );
  };

  const navigateTo = (view: AppViewMode) => {
    if (view !== "editor") st.zenMode = false;
    st.activeView = view;
    updateWindowAndTitleBar();
    renderMenuBar();
    renderSidebar();
    renderMainStage();
    renderAIStudio(true);
    renderInspector();
    renderStatusBar();
  };

  const handleMenuAction = async (act: string) => {
    switch (act) {
      case "go-home":
        navigateTo("home");
        break;
      case "new-doc":
        await createNewDocument(false);
        break;
      case "new-vault-doc":
        await createNewDocument(true);
        break;
      case "import-doc":
        await importDocumentFlow(false);
        break;
      case "save-snapshot":
        await saveExplicitSnapshot(false);
        break;
      case "export-epub":
        await exportDocumentFlow("epub");
        break;
      case "export-html":
        await exportDocumentFlow("html");
        break;
      case "export-md":
        await exportDocumentFlow("md");
        break;
      case "open-drive-backups":
      case "settings-drive":
        st.settingsTab = "drive";
        navigateTo("settings");
        break;
      case "settings-security":
        st.settingsTab = "security";
        navigateTo("settings");
        break;
      case "settings-express":
        st.settingsTab = "express";
        navigateTo("settings");
        break;
      case "settings-audit":
        st.settingsTab = "audit";
        navigateTo("settings");
        break;
      case "settings-appearance":
        st.settingsTab = "appearance";
        navigateTo("settings");
        break;
      case "open-dictionary":
        st.settingsTab = "dictionary";
        navigateTo("settings");
        break;
      case "help-overview":
        st.helpTopic = "overview";
        navigateTo("help");
        break;
      case "help-editor":
        st.helpTopic = "editor";
        navigateTo("help");
        break;
      case "help-chapters":
        st.helpTopic = "chapters";
        navigateTo("help");
        break;
      case "help-vault":
        st.helpTopic = "vault";
        navigateTo("help");
        break;
      case "help-ai":
        st.helpTopic = "ai";
        navigateTo("help");
        break;
      case "help-publish":
        st.helpTopic = "publish";
        navigateTo("help");
        break;
      case "help-shortcuts":
        st.helpTopic = "shortcuts";
        navigateTo("help");
        break;
      case "open-palette":
        openCommandPalette();
        break;
      case "lock-app":
        aiRepo.clearEphemeralVaultSessions();
        st.activeAiSessionId = "";
        st.aiChatHistory = [];
        st.activeChatbotSessionId = "";
        st.freeChatbotHistory = [];
        st.selectedChatbotTurnIndices = [];
        st.attachedChatbotExcerpts = [];
        await WritttIPC.lockApp();
        await refreshSecurityAndTelemetry();
        updateWindowAndTitleBar();
        renderMenuBar();
        renderLockScreen();
        break;
      case "toggle-doc-vault":
        (document.getElementById("hdr-toggle-vault") as HTMLElement | null)?.click();
        break;
      case "issue-proof":
        if (st.activeDoc?.id) {
          try {
            st.lastProof = await WritttIPC.generateAuthorshipProof(st.activeDoc.id);
            await refreshSecurityAndTelemetry();
            st.inspectorOpen = true;
            st.inspectorTab = "history";
            document.getElementById("hdr-toggle-inspector")?.classList.add("is-active");
            renderInspector();
            showMatzToast(t("Certificado SHA-256 emitido!", "SHA-256 Certificate issued!", "Certificado emitido!"));
          } catch (e: any) {
            showMatzToast(`${e?.message || e}`);
          }
        }
        break;
      case "toggle-sidebar":
        st.sidebarOpen = !st.sidebarOpen;
        renderMenuBar();
        renderSidebar();
        break;
      case "toggle-fmt-bar":
        st.formatBarOpen = !st.formatBarOpen;
        document.getElementById("writtt-format-bar")?.classList.toggle("is-hidden", !st.formatBarOpen);
        renderMenuBar();
        break;
      case "mode-rich":
        st.editorMode = "rich";
        renderMenuBar();
        renderMainStage();
        break;
      case "mode-markdown":
        st.editorMode = "markdown";
        renderMenuBar();
        renderMainStage();
        break;
      case "mode-dual":
        if (st.activeDoc?.parent_id) {
          st.editorMode = "dual";
          renderMenuBar();
          renderMainStage();
        }
        break;
      case "toggle-zen":
        st.zenMode = !st.zenMode;
        renderMenuBar();
        renderSidebar();
        renderMainStage();
        renderAIStudio(true);
        renderInspector();
        renderStatusBar();
        break;
      case "toggle-focus":
        st.prefs = { ...st.prefs, focusMode: !st.prefs.focusMode };
        savePreferences(st.prefs);
        applyPrefsLive();
        break;
      case "open-ai-direct":
        if (st.activeView !== "editor") {
          if (st.activeDoc) navigateTo("editor");
          else if (st.docs.length > 0) await selectDocument(st.docs[0].id);
          else await createNewDocument(false);
        }
        st.aiStudioOpen = true;
        document.getElementById("hdr-ai-btn")?.classList.add("is-active");
        await loadAiStatus();
        renderMenuBar();
        renderAIStudio(true);
        break;
      case "open-ai-os-window":
        await loadAiStatus();
        await popoutAIStudioToOSWindow();
        break;
      case "insp-outline":
      case "insp-history":
      case "insp-export":
        st.inspectorOpen = true;
        st.inspectorTab = act.replace("insp-", "") as EditorialInspectorTab;
        document.getElementById("hdr-toggle-inspector")?.classList.add("is-active");
        renderInspector();
        break;
      case "open-slash":
        tiptap?.openSlashMenuAtCaret();
        break;
      case "open-drawing":
        openDrawingModal(modalLayerEl, async (svg) => {
          const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
          let imgSrc = svgDataUrl;
          try {
            const savedUrl = await WritttIPC.saveAttachment(`drawing-${Date.now()}.svg`, svgDataUrl);
            if (savedUrl) imgSrc = savedUrl;
          } catch {
            // inline data URI fallback
          }
          if (st.editorMode === "rich" && tiptap) {
            tiptap.insertImage(imgSrc, "Desenho Vetorial SVG");
          } else if (st.activeDoc) {
            st.activeDoc.content += `\n![Desenho Vetorial SVG](${imgSrc})\n`;
            renderMainStage();
          }
          scheduleAutoSave();
        });
        break;
      case "split-sub":
        if (st.activeDoc?.id) {
          await addSubChapterToWork(st.activeDoc.parent_id || st.activeDoc.id);
        }
        break;
      case "duplicate-doc":
        if (st.activeDoc?.id) {
          await duplicateWork(st.activeDoc.id, true);
        }
        break;
      case "merge-parent":
        (document.getElementById("fmt-merge-parent") as HTMLElement | null)?.click();
        break;
      default:
        if (act.startsWith("cmd-")) tiptap?.runCommand(act.slice(4));
        break;
    }
  };

  const openCommandPalette = () => {
    openRaycastCommandModal([
      { id: "new-doc", label: t("Escrever Novo Manuscrito", "Write New Manuscript", "Escribir Nuevo Manuscrito"), icon: "feather", shortcut: "Ctrl+N", onSelect: () => void handleMenuAction("new-doc") },
      { id: "new-vault-doc", label: t("Criar Manuscrito no Cofre Protegido", "New Protected Vault Doc", "Nuevo en Boveda"), icon: "lock", shortcut: "Vault", onSelect: () => void handleMenuAction("new-vault-doc") },
      { id: "import-doc", label: t("Importar Texto (.md / .txt) do Computador", "Import .md / .txt from Computer", "Importar .md / .txt"), icon: "upload", shortcut: "Import", onSelect: () => void handleMenuAction("import-doc") },
      { id: "open-ai-direct", label: t("Abrir Estudio IA & RAG (Chatbot + Editor IA)", "Open AI & RAG Studio (Chatbot + Editorial AI)", "Abrir Estudio IA y RAG"), icon: "sparkles", shortcut: "IA", onSelect: () => void handleMenuAction("open-ai-direct") },
      { id: "open-ai-os-window", label: t("Destacar Estudio IA em Janela (2o Monitor)", "Detach AI Studio to 2nd-Monitor Window", "Destacar Estudio IA a 2o Monitor"), icon: "external", shortcut: "2nd Mon", onSelect: () => void handleMenuAction("open-ai-os-window") },
      { id: "go-home", label: t("Ir para Tela Inicial (Biblioteca)", "Go to Home Library", "Ir al Inicio"), icon: "home", shortcut: "Home", onSelect: () => void handleMenuAction("go-home") },
      { id: "settings-security", label: t("Cofre Pessoal, Senha Mestra, PIN & 2FA", "Personal Vault, Password, PIN & 2FA", "Boveda, PIN y 2FA"), icon: "shield-check", shortcut: "Ctrl+,", onSelect: () => void handleMenuAction("settings-security") },
      { id: "settings-drive", label: t("Cofre de Arquivos & Backups (.writttpack)", "Protected Files & Backups (.writttpack)", "Archivos y Respaldos"), icon: "archive", shortcut: "Backup", onSelect: () => void handleMenuAction("settings-drive") },
      { id: "help-overview", label: t("Guia do Autor & Como Tudo Funciona", "Author Guide & How Everything Works", "Guia del Autor"), icon: "help-circle", shortcut: "F1", onSelect: () => void handleMenuAction("help-overview") },
      { id: "toggle-zen", label: t("Alternar Modo Zen (Foco Total)", "Toggle Zen Mode", "Alternar Modo Zen"), icon: "eye", shortcut: "Alt+Z", onSelect: () => void handleMenuAction("toggle-zen") },
      { id: "lock-app", label: t("Trancar Writtt & Limpar Memoria", "Lock Writtt & Clear Memory", "Bloquear Aplicacion"), icon: "lock", shortcut: "Ctrl+L", onSelect: () => void handleMenuAction("lock-app") },
    ]);
  };

  const markActivity = () => {
    lastActivityTs = Date.now();
  };
  window.addEventListener("mousemove", markActivity, { passive: true });
  window.addEventListener("mousedown", markActivity, { passive: true });
  window.addEventListener("keydown", async (e) => {
    markActivity();
    if (isAppLocked()) return;
    if (e.key === "F1") {
      e.preventDefault();
      st.helpTopic = "overview";
      navigateTo("help");
      return;
    }
    if (e.key === "Escape") {
      if (tiptap?.isPopoverOpen()) {
        tiptap.closeAllPopovers();
        return;
      }
      if (st.aiStudioOpen && st.aiHistoryDrawerOpen) {
        st.aiHistoryDrawerOpen = false;
        renderAIStudio(true);
        return;
      }
      if (st.aiStudioOpen && (st.aiStudioPlacement === "floating" || st.activeView !== "editor")) {
        st.aiStudioOpen = false;
        document.getElementById("hdr-ai-btn")?.classList.remove("is-active");
        renderAIStudio();
        return;
      }
      if (st.inspectorOpen) {
        st.inspectorOpen = false;
        document.getElementById("hdr-toggle-inspector")?.classList.remove("is-active");
        renderInspector();
        return;
      }
      if (st.aiStudioOpen) {
        st.aiStudioOpen = false;
        document.getElementById("hdr-ai-btn")?.classList.remove("is-active");
        renderAIStudio();
        return;
      }
      if (st.zenMode) {
        st.zenMode = false;
        navigateTo(st.activeView);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      await saveExplicitSnapshot(false);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      await createNewDocument(false);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
      e.preventDefault();
      await handleMenuAction("lock-app");
    } else if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
      e.preventDefault();
      await handleMenuAction("toggle-sidebar");
    } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      e.preventDefault();
      navigateTo("settings");
    } else if (e.altKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      await handleMenuAction("toggle-zen");
    }
  });

  window.setInterval(async () => {
    if (!st.prefs.autoLockMinutes || st.prefs.autoLockMinutes <= 0) return;
    if (!st.securityCfg.password_enabled || !st.securityCfg.vault_unlocked) return;
    if (Date.now() - lastActivityTs >= st.prefs.autoLockMinutes * 60_000) {
      await handleMenuAction("lock-app");
      showMatzToast(t("Cofre bloqueado automaticamente por inatividade.", "Vault auto-locked due to inactivity.", "Boveda bloqueada por inactividad."));
    }
  }, 30_000);

  onMatzLocaleChange(() => {
    navigateTo(st.activeView);
    renderLockScreen();
  });

  try {
    Events.On("file-updated", async () => {
      await refreshDocList();
      if (st.activeView === "home") renderMainStage();
      else if (st.activeView === "editor") renderSidebar();
    });
    Events.On("app-locked", async () => {
      aiRepo.clearEphemeralVaultSessions();
      await refreshSecurityAndTelemetry();
      updateWindowAndTitleBar();
      renderMenuBar();
      renderLockScreen();
    });
    Events.On("ai-studio:remote-insert", async (ev: any) => {
      const text = String(ev?.data ?? ev ?? "");
      if (!text.trim()) return;
      if (!st.activeDoc) {
        await createNewDocument(false);
      }
      if (!st.activeDoc) return;
      if (st.activeView !== "editor") {
        navigateTo("editor");
      }
      if (st.editorMode === "rich" && tiptap) {
        tiptap.insertRawContentWithDiffFlash(`\n\n${text}\n`);
      } else {
        st.activeDoc.content += `\n\n${text}\n`;
        renderMainStage();
      }
      scheduleAutoSave();
      showMatzToast(
        t(
          "Trecho inserido a partir do Estudio IA!",
          "Passage inserted from detached AI Studio!",
          "Texto insertado desde el Estudio IA!"
        )
      );
    });
    Events.On("ai-studio:redock-main", () => {
      st.aiStudioOpen = true;
      st.aiStudioPlacement = "docked";
      if (st.activeView !== "editor") {
        navigateWithEditorFallback("editor");
      } else {
        document.getElementById("hdr-ai-btn")?.classList.add("is-active");
        renderAIStudio(true);
      }
    });
  } catch {
    // HTTP fallback mode
  }

  await Promise.all([refreshSecurityAndTelemetry(), loadAiStatus(), refreshDocList()]);
  navigateTo("home");
  renderLockScreen();

  if (st.prefs.checkUpdatesAutomatically !== false) {
    void checkSoftwareUpdates(false);
  }

  if (!isAppLocked() && shouldShowOnboarding(st.aliasConfig.alias)) {
    openOnboardingModal(modalLayerEl, async () => {
      await refreshSecurityAndTelemetry();
      navigateTo(st.activeView);
    });
  }
}

void bootstrap();
