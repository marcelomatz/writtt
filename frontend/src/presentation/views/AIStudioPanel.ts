import { matzIcon } from "@matz/ui";
import {
  AIChatMessage,
  AIConversationSession,
  AIModelCapabilityDTO,
  AIStudioPlacement,
  AIStudioTab,
  ChatbotContextExcerpt,
  RAGSearchResult,
  renderMarkdownHtml,
  t,
} from "../../domain";
import { esc, formatShortDate } from "../dom/domUtils";

export interface AIStudioState {
  tab: AIStudioTab;
  placement: AIStudioPlacement;
  isStandaloneWindow: boolean;
  alwaysOnTop?: boolean;
  historyOpen: boolean;
  activeDocId: string;
  activeDocTitle: string;
  localAiOnline: boolean;
  aiModels: string[];
  aiModelCaps: AIModelCapabilityDTO[];
  selectedAiModel: string;
  aiSessions: AIConversationSession[];
  activeAiSessionId: string;
  aiChatHistory: AIChatMessage[];
  chatbotSessions: AIConversationSession[];
  activeChatbotSessionId: string;
  freeChatbotHistory: AIChatMessage[];
  selectedChatbotTurnIndices: number[];
  attachedChatbotExcerpts: ChatbotContextExcerpt[];
  chatbotIncludeDoc: boolean;
  aiUseRag: boolean;
  aiBusy: boolean;
  aiAppliedFeedback?: string;
  ragQuery: string;
  ragResults: RAGSearchResult[];
}

export interface AIStudioCallbacks {
  onSelectTab: (tab: AIStudioTab) => void;
  onToggleHistory: () => void;
  onToggleFloating: () => void;
  onSnapFloatingCorner?: () => void;
  onPopoutOSWindow: () => void;
  onRedockMain?: () => void;
  onToggleAlwaysOnTop?: () => void;
  onClose: () => void;
  onSelectAiModel: (model: string) => void;
  onTestOllama: () => void;
  onToggleAiRag: (enabled: boolean) => void;
  onToggleChatbotDocCtx: (enabled: boolean) => void;
  onToggleSelectChatbotTurn: (msgIdx: number) => void;
  onClearSelectedChatbotTurns: () => void;
  onForwardSelectedToEditorial: () => void;
  onForwardSingleTurnToEditorial: (msgIdx: number) => void;
  onForwardEntireChatToEditorial: () => void;
  onRemoveAttachedExcerpt: (excerptId: string) => void;
  onClearAttachedExcerpts: () => void;
  onSelectAiSession: (sessionId: string) => void;
  onNewAiSession: () => void;
  onDeleteAiSession: (sessionId: string) => void;
  onSelectChatbotSession: (sessionId: string) => void;
  onNewChatbotSession: () => void;
  onDeleteChatbotSession: (sessionId: string) => void;
  onEditAiMessageContent: (msgIndex: number, newContent: string) => void;
  onClearAiChat: () => void;
  onAskEditorialAi: (prompt: string) => void;
  onAskChatbot: (prompt: string) => void;
  onInsertAiText: (text: string, msgIndex?: number) => void;
  onCopyText: (text: string, label: string) => void;
  onSearchRag: (query: string) => void;
  onSelectDoc: (id: string) => void;
}

let editingEditorialIdx: number | null = null;
let studioFeedbackTimer: number | null = null;
let expandedExcerptPreview = false;

export function renderAIStudioPanel(
  container: HTMLElement,
  st: AIStudioState,
  cb: AIStudioCallbacks
): void {
  if (studioFeedbackTimer !== null) {
    window.clearTimeout(studioFeedbackTimer);
    studioFeedbackTimer = null;
  }

  const isFloating = !st.isStandaloneWindow && st.placement === "floating";
  const chatCapableModels = (st.aiModelCaps || []).filter((m) => m.supportsChat);
  const totalHistoryCount =
    st.tab === "chatbot" ? st.chatbotSessions.length : st.aiSessions.length;

  container.innerHTML = `
    <div class="writtt-ais-root ${st.isStandaloneWindow ? "is-os-window" : ""} ${isFloating ? "is-floating" : ""}">
      <header class="writtt-ais-header" ${isFloating ? "data-matz-float-drag" : ""}>
        <div class="writtt-ais-header-left">
          <span class="writtt-status-dot ${st.localAiOnline ? "is-online" : "is-offline"}" title="${
            st.localAiOnline
              ? t("Ollama local conectado", "Local Ollama connected", "Ollama conectado")
              : t("Ollama local offline", "Local Ollama offline", "Ollama desconectado")
          }"></span>
          <span class="writtt-ais-brand">
            ${t("Estudio IA", "AI Studio", "Estudio IA")}
          </span>
          ${
            st.activeDocTitle
              ? `<span class="writtt-ais-doc-chip" title="${esc(st.activeDocTitle)}">${matzIcon("file-text", 10)} <span>${esc(st.activeDocTitle)}</span></span>`
              : ""
          }
        </div>

        <div class="writtt-ais-header-actions" data-no-drag>
          ${
            st.tab !== "rag"
              ? `<button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs ${st.historyOpen ? "is-active" : ""}" data-ais-history title="${t("Conversas e conteudos salvos no historico", "Saved conversations and history", "Historial guardado")}">
                  ${matzIcon("clock", 11)}
                  <span class="writtt-mono">${totalHistoryCount}</span>
                </button>`
              : ""
          }
          <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs" data-ais-reconnect title="${t("Verificar conexao local com Ollama", "Check local Ollama connection", "Probar conexion Ollama")}">
            ${matzIcon("refresh", 11)}
          </button>
          ${
            st.isStandaloneWindow
              ? `<button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs ${st.alwaysOnTop ? "is-active" : ""}" data-ais-pin-top title="${t("Fixar esta janela sempre no topo", "Keep window always on top", "Mantener siempre visible")}">
                  ${matzIcon("pin", 11)}
                </button>
                <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-ais-redock title="${t("Acoplar novamente dentro da janela principal do Writtt", "Dock back inside main Writtt window", "Volver a acoplar en la ventana principal")}">
                  ${matzIcon("sidebar", 11)} <span>${t("Acoplar", "Dock", "Acoplar")}</span>
                </button>
                <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs" data-ais-close title="${t("Fechar janela", "Close window", "Cerrar ventana")}">
                  ${matzIcon("close", 12)}
                </button>`
              : `${
                  isFloating
                    ? `<button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs" data-ais-snap title="${t("Alternar canto na janela", "Cycle corner position", "Cambiar esquina")}">
                        ${matzIcon("compass", 11)}
                      </button>`
                    : ""
                }
                <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs ${isFloating ? "is-active" : ""}" data-ais-float title="${
                  isFloating
                    ? t("Voltar a acoplar na lateral direita", "Dock back to right sidebar", "Acoplar en barra lateral")
                    : t("Destacar painel flutuante sobre a janela (arraste livremente)", "Detach floating panel over window (drag freely)", "Destacar sobre la ventana")
                }">
                  ${matzIcon(isFloating ? "sidebar" : "app-window", 11)}
                </button>
                <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs" data-ais-popout title="${t("Abrir em janela independente do sistema (permite arrastar para 2o monitor)", "Open in standalone OS window (drag to 2nd monitor)", "Abrir en ventana independiente para 2o monitor")}">
                  ${matzIcon("external", 11)}
                </button>
                <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs" data-ais-close title="ESC">
                  ${matzIcon("close", 12)}
                </button>`
          }
        </div>
      </header>

      <nav class="writtt-ais-tabs" data-no-drag>
        <button type="button" class="writtt-ais-tab ${st.tab === "chatbot" ? "is-active" : ""}" data-ais-tab="chatbot">
          ${matzIcon("chat", 12)}
          <span>${t("Chatbot", "Chatbot", "Chatbot")}</span>
        </button>
        <button type="button" class="writtt-ais-tab ${st.tab === "editorial" ? "is-active" : ""}" data-ais-tab="editorial">
          ${matzIcon("feather", 12)}
          <span>${t("Editor IA", "Editorial AI", "Editor IA")}</span>
          ${
            st.attachedChatbotExcerpts.length > 0
              ? `<span class="writtt-ais-ctx-badge writtt-mono">+${st.attachedChatbotExcerpts.length}</span>`
              : ""
          }
        </button>
        <button type="button" class="writtt-ais-tab ${st.tab === "rag" ? "is-active" : ""}" data-ais-tab="rag">
          ${matzIcon("search", 12)}
          <span>${t("Busca RAG", "RAG Search", "Busqueda RAG")}</span>
        </button>
      </nav>

      ${st.historyOpen && st.tab !== "rag" ? renderHistoryDrawer(st) : ""}

      ${
        st.tab === "chatbot"
          ? renderChatbotWorkspace(st, chatCapableModels)
          : st.tab === "editorial"
          ? renderEditorialWorkspace(st)
          : renderRagWorkspace(st)
      }
    </div>
  `;

  // Header & Tab events
  container.querySelector("[data-ais-history]")?.addEventListener("click", cb.onToggleHistory);
  container.querySelector("[data-ais-reconnect]")?.addEventListener("click", cb.onTestOllama);
  container.querySelector("[data-ais-float]")?.addEventListener("click", cb.onToggleFloating);
  container.querySelector("[data-ais-snap]")?.addEventListener("click", () => cb.onSnapFloatingCorner?.());
  container.querySelector("[data-ais-popout]")?.addEventListener("click", cb.onPopoutOSWindow);
  container.querySelector("[data-ais-redock]")?.addEventListener("click", () => cb.onRedockMain?.());
  container.querySelector("[data-ais-pin-top]")?.addEventListener("click", () => cb.onToggleAlwaysOnTop?.());
  container.querySelector("[data-ais-close]")?.addEventListener("click", cb.onClose);

  container.querySelectorAll("[data-ais-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextTab = ((btn as HTMLElement).dataset.aisTab as AIStudioTab) || "chatbot";
      editingEditorialIdx = null;
      cb.onSelectTab(nextTab);
    });
  });

  // History drawer bindings
  container.querySelector("[data-ais-new-chat]")?.addEventListener("click", () => {
    editingEditorialIdx = null;
    if (st.tab === "chatbot") cb.onNewChatbotSession();
    else cb.onNewAiSession();
  });
  container.querySelectorAll("[data-ais-open-sess]").forEach((el) => {
    el.addEventListener("click", () => {
      const sid = (el as HTMLElement).dataset.aisOpenSess || "";
      editingEditorialIdx = null;
      if (!sid) return;
      if (st.tab === "chatbot") cb.onSelectChatbotSession(sid);
      else cb.onSelectAiSession(sid);
    });
  });
  container.querySelectorAll("[data-ais-del-sess]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sid = (btn as HTMLElement).dataset.aisDelSess || "";
      if (!sid) return;
      if (st.tab === "chatbot") cb.onDeleteChatbotSession(sid);
      else cb.onDeleteAiSession(sid);
    });
  });

  // Model & Context toggles
  const modelSel = container.querySelector("#ais-model-select") as HTMLSelectElement | null;
  modelSel?.addEventListener("change", () => cb.onSelectAiModel(modelSel.value));

  const ragToggle = container.querySelector("#ais-rag-toggle") as HTMLInputElement | null;
  ragToggle?.addEventListener("change", () => cb.onToggleAiRag(ragToggle.checked));

  const docCtxToggle = container.querySelector("#ais-doc-ctx-toggle") as HTMLInputElement | null;
  docCtxToggle?.addEventListener("change", () => cb.onToggleChatbotDocCtx(docCtxToggle.checked));

  // Chatbot selection & handoff bindings
  container.querySelectorAll("[data-ais-sel-turn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number((btn as HTMLElement).dataset.aisSelTurn || 0);
      cb.onToggleSelectChatbotTurn(idx);
    });
  });
  container.querySelectorAll("[data-ais-forward-one]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number((btn as HTMLElement).dataset.aisForwardOne || 0);
      cb.onForwardSingleTurnToEditorial(idx);
    });
  });
  container.querySelector("[data-ais-forward-selected]")?.addEventListener("click", cb.onForwardSelectedToEditorial);
  container.querySelector("[data-ais-forward-all]")?.addEventListener("click", cb.onForwardEntireChatToEditorial);
  container.querySelector("[data-ais-clear-sel]")?.addEventListener("click", cb.onClearSelectedChatbotTurns);

  // Attached context tray in Editorial mode
  container.querySelector("[data-ais-toggle-ctx-preview]")?.addEventListener("click", () => {
    expandedExcerptPreview = !expandedExcerptPreview;
    renderAIStudioPanel(container, st, cb);
  });
  container.querySelector("[data-ais-clear-attached]")?.addEventListener("click", cb.onClearAttachedExcerpts);
  container.querySelectorAll("[data-ais-rm-attached]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLElement).dataset.aisRmAttached || "";
      if (id) cb.onRemoveAttachedExcerpt(id);
    });
  });

  // Quick starter / editorial chips
  container.querySelectorAll("[data-ais-starter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = (btn as HTMLElement).dataset.aisStarter || "";
      if (!prompt) return;
      if (st.tab === "chatbot") cb.onAskChatbot(prompt);
      else cb.onAskEditorialAi(prompt);
    });
  });

  // Copy / Edit / Insert actions
  container.querySelectorAll("[data-ais-cb-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number((btn as HTMLElement).dataset.aisCbCopy || 0);
      const msg = st.freeChatbotHistory[idx];
      if (msg?.content) cb.onCopyText(msg.content, t("Resposta", "Response", "Respuesta"));
    });
  });
  container.querySelector("[data-ais-reset-default]")?.addEventListener("click", () => {
    editingEditorialIdx = null;
    cb.onClearAiChat();
  });
  container.querySelector("[data-ais-cb-reset]")?.addEventListener("click", () => {
    cb.onNewChatbotSession();
  });

  container.querySelectorAll("[data-ais-ed-insert]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number((btn as HTMLElement).dataset.aisEdInsert || 0);
      const msg = st.aiChatHistory[idx];
      editingEditorialIdx = null;
      if (msg?.insertableContent) cb.onInsertAiText(msg.insertableContent, idx);
    });
  });
  container.querySelectorAll("[data-ais-ed-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number((btn as HTMLElement).dataset.aisEdCopy || 0);
      const msg = st.aiChatHistory[idx];
      if (msg?.insertableContent) cb.onCopyText(msg.insertableContent, t("Trecho gerado", "Generated passage", "Texto generado"));
    });
  });
  container.querySelectorAll("[data-ais-ed-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingEditorialIdx = Number((btn as HTMLElement).dataset.aisEdEdit || 0);
      renderAIStudioPanel(container, st, cb);
    });
  });
  container.querySelector("[data-ais-ed-cancel]")?.addEventListener("click", () => {
    editingEditorialIdx = null;
    renderAIStudioPanel(container, st, cb);
  });
  container.querySelectorAll("[data-ais-ed-save]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number((btn as HTMLElement).dataset.aisEdSave || 0);
      const ta = container.querySelector(`[data-ais-ed-ta="${idx}"]`) as HTMLTextAreaElement | null;
      editingEditorialIdx = null;
      if (ta) cb.onEditAiMessageContent(idx, ta.value);
    });
  });

  // Professional Auto-Growing Multi-Line Composer
  const composerTa = container.querySelector("#ais-composer-ta") as HTMLTextAreaElement | null;
  const composerForm = container.querySelector("#ais-composer-form") as HTMLFormElement | null;
  const syncTaHeight = () => {
    if (!composerTa) return;
    composerTa.style.height = "auto";
    composerTa.style.height = `${Math.min(156, Math.max(46, composerTa.scrollHeight))}px`;
  };
  composerTa?.addEventListener("input", syncTaHeight);
  composerTa?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composerForm?.requestSubmit();
    }
  });
  composerForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!composerTa || st.aiBusy) return;
    const val = composerTa.value.trim();
    const fallbackWithExcerpts =
      !val && st.tab === "editorial" && st.attachedChatbotExcerpts.length > 0
        ? t(
            "Aplique as diretrizes e analises selecionadas do Chatbot para criar ou aprimorar o conteudo desta obra.",
            "Apply the selected Chatbot insights and instructions to draft or refine content for this manuscript.",
            "Aplica los analisis e instrucciones seleccionados del Chatbot para redactar el contenido de esta obra."
          )
        : "";
    const finalPrompt = val || fallbackWithExcerpts;
    if (!finalPrompt) return;
    composerTa.value = "";
    syncTaHeight();
    if (st.tab === "chatbot") cb.onAskChatbot(finalPrompt);
    else cb.onAskEditorialAi(finalPrompt);
  });

  // RAG Search bindings
  const ragForm = container.querySelector("#ais-rag-form") as HTMLFormElement | null;
  ragForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = container.querySelector("#ais-rag-input") as HTMLInputElement | null;
    const q = inp?.value.trim() || "";
    if (q) cb.onSearchRag(q);
  });
  container.querySelectorAll("[data-ais-rag-doc]").forEach((el) => {
    el.addEventListener("click", () => {
      const docId = (el as HTMLElement).dataset.aisRagDoc || "";
      if (docId) cb.onSelectDoc(docId);
    });
  });

  // Scroll stream to latest turn smoothly
  const streamEl = container.querySelector("[data-ais-stream]") as HTMLElement | null;
  if (streamEl) {
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  if (st.aiAppliedFeedback) {
    studioFeedbackTimer = window.setTimeout(() => {
      const banner = container.querySelector("[data-ais-feedback]") as HTMLElement | null;
      if (banner) {
        banner.classList.add("is-fading");
        window.setTimeout(() => banner.remove(), 300);
      }
      studioFeedbackTimer = null;
    }, 3600);
  }
}

function renderHistoryDrawer(st: AIStudioState): string {
  const sessions = st.tab === "chatbot" ? st.chatbotSessions : st.aiSessions;
  const activeId = st.tab === "chatbot" ? st.activeChatbotSessionId : st.activeAiSessionId;

  return `
    <div class="writtt-ais-history-drawer" data-no-drag>
      <div class="writtt-ais-history-head">
        <span>${
          st.tab === "chatbot"
            ? t("Historico do Chatbot", "Chatbot History", "Historial del Chatbot")
            : t("Historico de Conteudos & Conversas", "Editorial AI History", "Historial del Editor IA")
        }</span>
        <button type="button" class="writtt-btn writtt-btn-xs" data-ais-new-chat>
          ${matzIcon("plus", 10)} <span>${t("Nova Conversa", "New Session", "Nueva Sesion")}</span>
        </button>
      </div>
      ${
        sessions.length === 0
          ? `<div class="writtt-help-note">${t("Nenhuma sessao salva ainda.", "No saved sessions yet.", "Sin sesiones guardadas.")}</div>`
          : `<div class="writtt-ais-history-items">
              ${sessions
                .map((sess) => {
                  const appliedMsg = [...sess.messages].reverse().find((m) => Boolean(m.appliedAt));
                  const isActive = sess.id === activeId;
                  return `
                    <div class="writtt-insp-hist-row ${isActive ? "is-active" : ""}" data-ais-open-sess="${esc(sess.id)}">
                      <div class="writtt-insp-hist-top">
                        <div class="writtt-row-gap-xs writtt-min-w0">
                          ${
                            appliedMsg
                              ? `<span class="writtt-ai-applied-pill">${matzIcon("check-circle", 9)} ${appliedMsg.appliedMode === "replace" ? t("Substituido", "Replaced", "Reemplazado") : t("Inserido", "Inserted", "Insertado")}</span>`
                              : `<span class="matz-badge writtt-mono writtt-badge-xs">${sess.source === "inline" ? "/ai" : "Chat"}</span>`
                          }
                          <span class="writtt-insp-hist-title">${esc(sess.title)}</span>
                        </div>
                        <div class="writtt-row-gap-xs">
                          <span class="writtt-mono writtt-iai-history-time">${formatShortDate(sess.updatedAt)}</span>
                          <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-danger writtt-icon-btn-xs" data-ais-del-sess="${esc(sess.id)}">
                            ${matzIcon("trash", 10)}
                          </button>
                        </div>
                      </div>
                    </div>`;
                })
                .join("")}
            </div>`
      }
    </div>
  `;
}

function renderChatbotWorkspace(st: AIStudioState, chatModels: AIModelCapabilityDTO[]): string {
  const hasChatModel = chatModels.length > 0;
  const selectedModel = chatModels.some((m) => m.name === st.selectedAiModel)
    ? st.selectedAiModel
    : chatModels[0]?.name || st.selectedAiModel;
  const selectedSet = new Set(st.selectedChatbotTurnIndices);
  const assistantCount = st.freeChatbotHistory.filter((m) => m.role === "assistant").length;

  return `
    <div class="writtt-ais-body" data-no-drag>
      <div class="writtt-ais-stream" data-ais-stream>
        ${
          !st.localAiOnline || !hasChatModel
            ? `<div class="writtt-sandbox-banner is-offline">
                <div class="writtt-sandbox-title">
                  ${matzIcon("shield", 12)}
                  <span>${t("Execucao Local Isolada (Ollama)", "Isolated Local Execution (Ollama)", "Ejecucion Local Aislada")}</span>
                </div>
                ${
                  !st.localAiOnline
                    ? `${t("Ollama nao detectado em localhost:11434. Inicie o Ollama ou instale um modelo:", "Ollama offline at localhost:11434. Start Ollama or run:", "Ollama desconectado:")} <code class="writtt-mono">ollama pull llama3.2</code>`
                    : `${t("Nenhum modelo conversacional detectado. Baixe um modelo de chat:", "No chat-capable model found. Run:", "Descarga un modelo de chat:")} <code class="writtt-mono">ollama pull llama3.2</code>`
                }
              </div>`
            : ""
        }

        ${
          st.freeChatbotHistory.length === 0 && !st.aiBusy
            ? `<div class="writtt-ais-welcome">
                <div class="writtt-ais-welcome-icon">${matzIcon("sparkles", 20)}</div>
                <div class="writtt-ais-welcome-title">
                  ${t("Converse, pesquise e amadureca suas ideias", "Brainstorm, research, and refine your ideas", "Explora, investiga y madura tus ideas")}
                </div>
                <p class="writtt-ais-welcome-desc">
                  ${t(
                    "Converse naturalmente com seu modelo local sem alterar uma virgula do manuscrito. Quando chegar a uma otima ideia ou estrutura, selecione uma ou mais respostas e encaminhe direto para o Editor IA aplicar na obra.",
                    "Chat naturally with your local model without touching a word of your manuscript. Whenever an idea clicks, select one or more replies and send them straight to Editorial AI to act on your text.",
                    "Conversa libremente sin tocar tu manuscrito. Cuando logres una gran idea, selecciona una o mas respuestas y envialas al Editor IA."
                  )}
                </p>
                <div class="writtt-ais-starters">
                  <button type="button" class="writtt-ais-starter-chip" data-ais-starter="${t("Analise a estrutura e os pontos fortes da obra atual e sugira caminhos para o proximo capitulo", "Analyze the structure and strengths of the current work and suggest directions for the next chapter", "Analiza la estructura de la obra actual y sugiere ideas para el siguiente capitulo")}">
                    ${matzIcon("compass", 12)}
                    <span>${t("Explorar rumos para o proximo capitulo", "Brainstorm next chapter directions", "Explorar ideas para el proximo capitulo")}</span>
                  </button>
                  <button type="button" class="writtt-ais-starter-chip" data-ais-starter="${t("Quais perguntas um leitor critico faria sobre o argumento central deste texto?", "What questions would a critical reader ask about the core argument of this text?", "Que preguntas haria un lector critico sobre este argumento?")}">
                    ${matzIcon("reasoning", 12)}
                    <span>${t("Testar solidez dos argumentos", "Stress-test core arguments", "Poner a prueba los argumentos")}</span>
                  </button>
                  <button type="button" class="writtt-ais-starter-chip" data-ais-starter="${t("Ajude-me a estruturar um roteiro claro em topicos antes de comecar a escrever", "Help me structure a clear topical outline before drafting", "Ayudame a estructurar un esquema claro antes de redactar")}">
                    ${matzIcon("layers", 12)}
                    <span>${t("Estruturar esboco em topicos", "Build a structured outline", "Crear esquema en puntos")}</span>
                  </button>
                </div>
              </div>`
            : `<div class="writtt-ais-thread-bar">
                <span class="writtt-ais-thread-meta">
                  ${matzIcon("shield-check", 11)}
                  <span>${t("Sandbox Somente-Texto", "Text-Only Sandbox", "Sandbox Aislado")}</span>
                </span>
                <div class="writtt-row-gap-xs">
                  ${
                    assistantCount > 0
                      ? `<button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-ais-forward-all title="${t("Enviar toda esta conversa como contexto para o Editor IA atuar na obra", "Forward this entire conversation as context to Editorial AI", "Enviar toda la conversacion al Editor IA")}">
                          ${matzIcon("wand", 11)} <span>${t("Usar Conversa no Editor IA", "Send Thread to Editorial AI", "Usar en Editor IA")}</span>
                        </button>`
                      : ""
                  }
                  <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-ais-cb-reset>
                    ${matzIcon("plus", 10)} <span>${t("Nova", "New", "Nueva")}</span>
                  </button>
                </div>
              </div>
              <div class="writtt-ais-timeline">
                ${st.freeChatbotHistory
                  .map((msg, idx) => {
                    if (msg.role === "user") {
                      return `
                        <article class="writtt-ais-turn is-user">
                          <div class="writtt-ais-turn-role">
                            ${matzIcon("user", 11)} <span>${t("Voce", "You", "Tu")}</span>
                          </div>
                          <div class="writtt-ais-user-bubble">${esc(msg.content).replace(/\n/g, "<br/>")}</div>
                        </article>`;
                    }

                    const isSelected = selectedSet.has(idx);
                    const contextNotes: string[] = [];
                    if (st.chatbotIncludeDoc) contextNotes.push(t("Obra ativa consultada", "Active work referenced", "Obra activa consultada"));
                    if (msg.ragChunksUsed) contextNotes.push(`RAG: ${msg.ragChunksUsed}`);

                    return `
                      <article class="writtt-ais-turn is-assistant ${isSelected ? "is-selected-turn" : ""}">
                        <div class="writtt-ais-turn-head">
                          <span class="writtt-ais-turn-role is-ai">
                            ${matzIcon("sparkles", 12)} <span>${esc(selectedModel.split(":")[0] || "IA")}</span>
                          </span>
                          ${
                            contextNotes.length > 0
                              ? `<span class="writtt-ais-step-pill">${matzIcon("scan", 10)} <span>${esc(contextNotes.join(" · "))}</span></span>`
                              : ""
                          }
                        </div>
                        <div class="writtt-ais-markdown writtt-md-preview">
                          ${renderMarkdownHtml(msg.content)}
                        </div>
                        <div class="writtt-ais-turn-actions">
                          <button type="button" class="writtt-btn writtt-btn-xs ${isSelected ? "is-active" : "writtt-btn-ghost"}" data-ais-sel-turn="${idx}" title="${t("Marcar esta resposta para compor o contexto do Editor IA", "Select this reply to add to Editorial AI context", "Seleccionar para el contexto del Editor IA")}">
                            ${matzIcon(isSelected ? "check-circle" : "plus", 11)}
                            <span>${isSelected ? t("Selecionado", "Selected", "Seleccionado") : t("Selecionar p/ Editor", "Select for Editor", "Seleccionar")}</span>
                          </button>
                          <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-ais-forward-one="${idx}" title="${t("Encaminhar esta resposta agora para o Editor IA atuar no manuscrito", "Send this reply straight to Editorial AI", "Enviar directo al Editor IA")}">
                            ${matzIcon("arrow-right", 11)}
                            <span>${t("Enviar ao Editor IA", "To Editorial AI", "Al Editor IA")}</span>
                          </button>
                          <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-ais-cb-copy="${idx}">
                            ${matzIcon("copy", 11)} <span>${t("Copiar", "Copy", "Copiar")}</span>
                          </button>
                        </div>
                      </article>`;
                  })
                  .join("")}
                ${
                  st.aiBusy
                    ? `<div class="writtt-ais-thinking">
                        <span class="writtt-spinner"></span>
                        <span>${t("Construindo resposta com", "Reasoning with", "Razonando con")} <b class="writtt-mono">${esc(selectedModel)}</b>...</span>
                      </div>`
                    : ""
                }
              </div>`
        }
      </div>

      ${
        selectedSet.size > 0
          ? `<div class="writtt-ais-selection-bar">
              <span class="writtt-row-gap-xs">
                ${matzIcon("check-circle", 12)}
                <b>${selectedSet.size}</b>
                <span>${selectedSet.size === 1 ? t("resposta selecionada", "reply selected", "respuesta seleccionada") : t("respostas selecionadas", "replies selected", "respuestas seleccionadas")}</span>
              </span>
              <div class="writtt-row-gap-xs">
                <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-ais-clear-sel>${t("Limpar", "Clear", "Limpiar")}</button>
                <button type="button" class="matz-btn matz-btn-primary writtt-btn-xs" data-ais-forward-selected>
                  ${matzIcon("wand", 11)} <span>${t("Encaminhar p/ Editor IA", "Send to Editorial AI", "Enviar al Editor IA")}</span>
                </button>
              </div>
            </div>`
          : ""
      }

      ${renderProfessionalComposer({
        st,
        models: chatModels.map((m) => m.name),
        selectedModel,
        isChatbot: true,
        disabled: st.aiBusy || !hasChatModel,
        placeholder: t(
          "Converse, pergunte ou analise ideias com a IA... (Enter envia, Shift+Enter quebra linha)",
          "Chat, ask questions, or explore ideas with AI... (Enter to send, Shift+Enter for newline)",
          "Conversa o explora ideas con la IA... (Enter envia, Shift+Enter nueva linea)"
        ),
      })}
    </div>
  `;
}

function renderEditorialWorkspace(st: AIStudioState): string {
  const isDefaultMode = st.aiChatHistory.length === 0 && !st.aiBusy;
  const hasAttached = st.attachedChatbotExcerpts.length > 0;

  return `
    <div class="writtt-ais-body" data-no-drag>
      <div class="writtt-ais-stream" data-ais-stream>
        ${
          st.aiAppliedFeedback
            ? `<div class="writtt-iai-applied-banner" data-ais-feedback>
                <span class="writtt-iai-applied-icon">${matzIcon("check-circle", 13)}</span>
                <span>${esc(st.aiAppliedFeedback)}</span>
              </div>`
            : ""
        }

        ${
          isDefaultMode
            ? `<div class="writtt-ais-welcome">
                <div class="writtt-ais-welcome-icon is-editorial">${matzIcon("feather", 20)}</div>
                <div class="writtt-ais-welcome-title">
                  ${t("Editor IA — Gere e refine trechos para o manuscrito", "Editorial AI — Draft & refine manuscript passages", "Editor IA — Redacta y pule pasajes para tu obra")}
                </div>
                <p class="writtt-ais-welcome-desc">
                  ${
                    hasAttached
                      ? t(
                          "Os trechos que voce selecionou no Chatbot ja estao anexados abaixo como diretriz! Escreva como deseja aplica-los na obra (ou pressione Enter para processar automaticamente).",
                          "Your selected Chatbot excerpts are attached below as context! Describe how to apply them to your manuscript (or press Enter to process immediately).",
                          "Los fragmentos seleccionados del Chatbot estan adjuntos abajo. Indica como aplicarlos o presiona Enter."
                        )
                      : t(
                          "O Editor IA separa a analise editorial do texto limpo pronto para entrar na sua obra. Ao clicar em '+ Inserir', o trecho destaca em verde no editor e fica salvo no Historico.",
                          "Editorial AI separates commentary from clean ready-to-insert text. Clicking '+ Insert' highlights the passage in green in your editor and archives it to History.",
                          "Separa el analisis del texto listo para insertar en tu obra."
                        )
                  }
                </p>
                <div class="writtt-ais-starters">
                  <button type="button" class="writtt-ais-starter-chip" data-ais-starter="Revise a clareza, ritmo e gramatica mantendo a voz autoral">
                    ${matzIcon("wand", 12)} <span>${t("Revisar estilo e fluidez", "Polish style & flow", "Pulir estilo y fluidez")}</span>
                  </button>
                  <button type="button" class="writtt-ais-starter-chip" data-ais-starter="Continue o ultimo paragrafo mantendo exatamente o mesmo tom e ritmo">
                    ${matzIcon("feather", 12)} <span>${t("Continuar proximo paragrafo", "Continue next paragraph", "Continuar siguiente parrafo")}</span>
                  </button>
                  <button type="button" class="writtt-ais-starter-chip" data-ais-starter="Resuma os pontos centrais deste capitulo em topicos objetivos">
                    ${matzIcon("list", 12)} <span>${t("Gerar resumo executivo", "Summarize key points", "Resumir puntos clave")}</span>
                  </button>
                  <button type="button" class="writtt-ais-starter-chip" data-ais-starter="Identifique inconsistencias de enredo, cronologia ou argumentacao">
                    ${matzIcon("scan", 12)} <span>${t("Auditar consistencia e logica", "Check plot & logic consistency", "Auditar consistencia y logica")}</span>
                  </button>
                </div>
              </div>`
            : `<div class="writtt-ais-thread-bar">
                <span class="writtt-ais-thread-meta">
                  ${matzIcon("feather", 11)}
                  <span>${t("Sessao Editorial Ativa", "Active Editorial Session", "Sesion Editorial Activa")}</span>
                </span>
                <button type="button" class="writtt-btn writtt-btn-xs" data-ais-reset-default title="${t("Voltar ao modo padrao mantendo esta conversa no historico", "Return to clean default mode keeping session in history", "Volver al modo estandar")}">
                  ${matzIcon("arrow-left", 10)} <span>${t("Modo Padrao", "Default Mode", "Modo Estandar")}</span>
                </button>
              </div>
              <div class="writtt-ais-timeline">
                ${st.aiChatHistory
                  .map((msg, idx) => {
                    if (msg.role === "user") {
                      return `
                        <article class="writtt-ais-turn is-user">
                          <div class="writtt-ais-turn-role">
                            ${matzIcon("user", 11)} <span>${t("Pedido Editorial", "Editorial Request", "Solicitud Editorial")}</span>
                          </div>
                          <div class="writtt-ais-user-bubble">${esc(msg.content).replace(/\n/g, "<br/>")}</div>
                        </article>`;
                    }

                    const hasOpinion = Boolean(msg.opinion && msg.opinion.trim());
                    const hasInsertable = Boolean(msg.insertableContent && msg.insertableContent.trim());

                    return `
                      <article class="writtt-ais-turn is-assistant">
                        ${
                          hasOpinion
                            ? `<div class="writtt-ais-opinion-step">
                                <div class="writtt-ais-opinion-head">
                                  <span class="writtt-row-gap-xs">${matzIcon("reasoning", 12)} <span>${t("Analise Editorial", "Editorial Notes", "Analisis Editorial")}</span></span>
                                  ${msg.ragChunksUsed ? `<span class="writtt-mono">RAG:${msg.ragChunksUsed}</span>` : ""}
                                </div>
                                <div class="writtt-ais-markdown writtt-md-preview">${renderMarkdownHtml(msg.opinion || "")}</div>
                              </div>`
                            : ""
                        }
                        ${
                          hasInsertable
                            ? `<div class="writtt-ais-deliverable-card">
                                <div class="writtt-ais-deliverable-head">
                                  <span class="writtt-row-gap-xs">${matzIcon("check-circle", 12)} <span>${t("Resultado Pronto para o Manuscrito", "Ready for Manuscript", "Listo para el Manuscrito")}</span></span>
                                  ${
                                    msg.appliedAt
                                      ? `<span class="writtt-ai-applied-pill">${msg.appliedMode === "replace" ? t("Substituido", "Replaced", "Reemplazado") : t("Inserido", "Inserted", "Insertado")}</span>`
                                      : ""
                                  }
                                </div>
                                ${
                                  editingEditorialIdx === idx
                                    ? `<textarea class="matz-input writtt-ais-edit-ta" data-ais-ed-ta="${idx}" rows="7">${esc(msg.insertableContent || "")}</textarea>
                                       <div class="writtt-ais-turn-actions">
                                         <button type="button" class="matz-btn matz-btn-primary writtt-btn-xs" data-ais-ed-save="${idx}">${matzIcon("check", 11)} <span>${t("Salvar Ajuste", "Save Edit", "Guardar")}</span></button>
                                         <button type="button" class="writtt-btn writtt-btn-xs" data-ais-ed-cancel>${t("Cancelar", "Cancel", "Cancelar")}</button>
                                       </div>`
                                    : `<div class="writtt-ais-deliverable-body writtt-md-preview">
                                         ${renderMarkdownHtml(msg.insertableContent || "")}
                                       </div>
                                       <div class="writtt-ais-turn-actions">
                                         <button type="button" class="matz-btn matz-btn-primary writtt-btn-xs" data-ais-ed-insert="${idx}">
                                           ${matzIcon("plus", 11)} <span>${t("Inserir no Manuscrito", "Insert into Manuscript", "Insertar en Obra")}</span>
                                         </button>
                                         <button type="button" class="writtt-btn writtt-btn-xs" data-ais-ed-edit="${idx}">
                                           ${matzIcon("edit", 11)} <span>${t("Editar", "Edit", "Editar")}</span>
                                         </button>
                                         <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-ais-ed-copy="${idx}">
                                           ${matzIcon("copy", 11)} <span>${t("Copiar", "Copy", "Copiar")}</span>
                                         </button>
                                       </div>`
                                }
                              </div>`
                            : !hasOpinion
                            ? `<div class="writtt-ais-markdown writtt-md-preview">${renderMarkdownHtml(msg.content)}</div>`
                            : ""
                        }
                      </article>`;
                  })
                  .join("")}
                ${
                  st.aiBusy
                    ? `<div class="writtt-ais-thinking">
                        <span class="writtt-spinner"></span>
                        <span>${t("Redigindo proposta editorial com", "Drafting with", "Redactando con")} <b class="writtt-mono">${esc(st.selectedAiModel)}</b>...</span>
                      </div>`
                    : ""
                }
              </div>`
        }
      </div>

      ${renderProfessionalComposer({
        st,
        models: st.aiModels,
        selectedModel: st.selectedAiModel,
        isChatbot: false,
        disabled: st.aiBusy,
        placeholder: hasAttached
          ? t(
              "Diga o que o Editor IA deve criar/alterar com base nos trechos do Chatbot (ou pressione Enter)...",
              "Tell Editorial AI what to draft/change from the attached Chatbot excerpts (or press Enter)...",
              "Indica que redactar a partir de los fragmentos del Chatbot (o pulsa Enter)..."
            )
          : t(
              "Descreva o trecho que deseja criar, expandir ou revisar... (Enter envia, Shift+Enter quebra linha)",
              "Describe the passage you want to draft, expand, or polish... (Enter sends, Shift+Enter newline)",
              "Describe el pasaje que deseas crear o revisar..."
            ),
      })}
    </div>
  `;
}

function renderProfessionalComposer(opts: {
  st: AIStudioState;
  models: string[];
  selectedModel: string;
  isChatbot: boolean;
  disabled: boolean;
  placeholder: string;
}): string {
  const { st, models, selectedModel, isChatbot, disabled, placeholder } = opts;
  const attached = !isChatbot ? st.attachedChatbotExcerpts : [];

  return `
    <form id="ais-composer-form" class="writtt-ais-composer ${attached.length > 0 ? "has-attached-ctx" : ""}">
      ${
        attached.length > 0
          ? `<div class="writtt-ais-attached-tray">
              <div class="writtt-ais-attached-head">
                <span class="writtt-row-gap-xs">
                  ${matzIcon("wand", 11)}
                  <b>${attached.length} ${attached.length === 1 ? t("resposta do Chatbot no contexto", "Chatbot reply in context", "respuesta del Chatbot en contexto") : t("respostas do Chatbot no contexto", "Chatbot replies in context", "respuestas del Chatbot en contexto")}</b>
                </span>
                <div class="writtt-row-gap-xs">
                  <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-ais-toggle-ctx-preview>
                    ${expandedExcerptPreview ? t("Recolher", "Collapse", "Contraer") : t("Inspecionar", "Inspect", "Inspeccionar")}
                  </button>
                  <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-danger writtt-btn-xs" data-ais-clear-attached>
                    ${t("Limpar", "Clear", "Limpiar")}
                  </button>
                </div>
              </div>
              <div class="writtt-ais-attached-chips">
                ${attached
                  .map(
                    (ex, i) => `
                    <div class="writtt-ais-attached-chip">
                      <span class="writtt-ais-attached-text">
                        <b class="writtt-mono">#${i + 1}</b> ${esc(expandedExcerptPreview ? ex.assistantReply : ex.preview)}
                      </span>
                      <button type="button" class="writtt-chip-rm" data-ais-rm-attached="${esc(ex.id)}" title="${t("Remover do contexto", "Remove from context", "Quitar")}">
                        ${matzIcon("close", 10)}
                      </button>
                    </div>`
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }

      <textarea
        id="ais-composer-ta"
        class="writtt-ais-composer-input"
        rows="2"
        placeholder="${esc(placeholder)}"
        ${disabled ? "disabled" : ""}
      ></textarea>

      <div class="writtt-ais-composer-bar">
        <div class="writtt-ais-composer-tools">
          <select class="matz-select writtt-ais-model-pill" id="ais-model-select" ${disabled ? "disabled" : ""}>
            ${models
              .map((m) => `<option value="${esc(m)}" ${m === selectedModel ? "selected" : ""}>${esc(m)}</option>`)
              .join("")}
          </select>

          ${
            isChatbot
              ? `<label class="writtt-ais-ctx-toggle" title="${t("Permitir que o Chatbot leia o manuscrito aberto quando voce perguntar sobre ele", "Allow Chatbot to read the open manuscript for context", "Permitir leer la obra abierta")}">
                  <input type="checkbox" id="ais-doc-ctx-toggle" ${st.chatbotIncludeDoc ? "checked" : ""} />
                  <span>${t("Obra", "Doc", "Obra")}</span>
                </label>`
              : ""
          }

          <label class="writtt-ais-ctx-toggle" title="${t("Consultar trechos semanticamente relacionados na sua biblioteca desbloqueada", "Include semantically related excerpts from your unlocked library", "Incluir contexto RAG")}">
            <input type="checkbox" id="ais-rag-toggle" ${st.aiUseRag ? "checked" : ""} />
            <span>RAG</span>
          </label>
        </div>

        <div class="writtt-ais-composer-submit-group">
          <span class="writtt-ais-kbd-hint writtt-mono">Enter</span>
          <button type="submit" class="writtt-ais-send-btn" ${disabled ? "disabled" : ""} title="${t("Enviar mensagem (Enter)", "Send message (Enter)", "Enviar mensaje (Enter)")}">
            ${st.aiBusy ? `<span class="writtt-spinner writtt-spinner-light"></span>` : matzIcon("send", 13)}
          </button>
        </div>
      </div>
    </form>
  `;
}

function renderRagWorkspace(st: AIStudioState): string {
  return `
    <div class="writtt-ais-body" data-no-drag>
      <div class="writtt-ais-stream">
        <div class="writtt-ais-rag-box">
          <div class="writtt-ais-welcome-title writtt-mb-xs">
            ${t("Busca Semantica RAG 100% Local", "100% Local Semantic RAG Search", "Busqueda Semantica RAG 100% Local")}
          </div>
          <p class="writtt-help-note writtt-mb-md">
            ${t(
              "Encontre conceitos, cenas, personagens ou argumentos em todos os seus manuscritos desbloqueados por similaridade vetorial offline (obras seladas no Cofre nunca sao indexadas).",
              "Find concepts, scenes, characters, or arguments across your unlocked manuscripts via offline vector similarity (sealed Vault works are never indexed).",
              "Encuentra conceptos, escenas o argumentos en tus obras desbloqueadas mediante similitud vectorial offline."
            )}
          </p>
          <form id="ais-rag-form" class="writtt-inline-form writtt-mb-md">
            <input class="matz-input" id="ais-rag-input" value="${esc(st.ragQuery)}" placeholder="${t("Descreva a ideia, conceito ou cena que procura...", "Describe the idea, concept, or scene...", "Describe el concepto o escena...")}" />
            <button type="submit" class="matz-btn matz-btn-primary">${matzIcon("search", 13)} <span>${t("Buscar", "Search", "Buscar")}</span></button>
          </form>

          ${
            st.ragResults.length > 0
              ? `<div class="writtt-stack-sm">
                  ${st.ragResults
                    .map(
                      (r) => `
                      <div class="writtt-subcard writtt-clickable" data-ais-rag-doc="${esc(r.docId)}">
                        <div class="writtt-sidebar-row writtt-mb-xs">
                          <span class="writtt-tree-title">${matzIcon("file-text", 11)} ${esc(r.docTitle)}</span>
                          <span class="writtt-mono writtt-accent-tag">${(r.similarity * 100).toFixed(0)}%</span>
                        </div>
                        <div class="writtt-ais-rag-snippet">${esc(r.snippet)}</div>
                      </div>`
                    )
                    .join("")}
                </div>`
              : `<div class="writtt-ai-ready-hint">${t("Digite um conceito acima para localizar trechos relevantes na sua biblioteca.", "Enter a concept above to locate matching passages across your library.", "Ingresa un concepto arriba para buscar pasajes relevantes.")}</div>`
          }
        </div>
      </div>
    </div>
  `;
}
