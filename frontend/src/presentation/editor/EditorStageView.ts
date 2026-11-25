import { matzIcon, openMatzDiffModal } from "@matz/ui";
import {
  ActiveEditorDoc,
  AIChatReplyDTO,
  BreadcrumbItem,
  EditorialInspectorTab,
  EditorialPreferences,
  EditorViewMode,
  renderMarkdownHtml,
  SecurityConfigDTO,
  t,
} from "../../domain";
import { esc } from "../dom/domUtils";
import {
  InlineAiAppliedEvent,
  InlineAiSidebarHandoff,
  TiptapStudio,
} from "./TiptapStudio";
import { HumanAuthController, mountHumanAuthController } from "../shell/HumanAuthGuard";

let activeStageAuthGuard: HumanAuthController | null = null;

export interface EditorStageProps {
  activeDoc: ActiveEditorDoc;
  splitCompareDoc: ActiveEditorDoc | null;
  docBreadcrumbs: BreadcrumbItem[];
  prefs: EditorialPreferences;
  securityCfg: SecurityConfigDTO;
  editorMode: EditorViewMode;
  zenMode: boolean;
  formatBarOpen: boolean;
  inspectorOpen: boolean;
  inspectorTab: EditorialInspectorTab;
  aiStudioOpen: boolean;
  localAiOnline: boolean;
  overlayMode: "pin" | "password";
  saveState: "saved" | "dirty" | "saving";
}

export interface EditorStageCallbacks {
  onChangeOverlayMode: (mode: "pin" | "password") => void;
  onUnlockDocumentSuccess: () => Promise<void>;
  onOpenSecuritySettings: () => void;
  onRefreshSecurity: () => Promise<void>;
  onToggleZen: () => void;
  onSelectBreadcrumb: (docId: string) => void;
  onToggleDocVault: () => Promise<void>;
  onChangeEditorMode: (mode: EditorViewMode) => void;
  onCreateSplitSubChapter: () => Promise<void>;
  onDuplicateDocument: () => Promise<void>;
  onToggleAiPanel?: () => void;
  onToggleInspector: () => void;
  onSaveSnapshot: () => void;
  onTitleChange: (title: string) => void;
  onTagsChange: (tags: string[]) => void;
  onContentChange: (markdown: string) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  onOpenDrawing: () => void;
  onAddDictionaryWord: (word: string) => Promise<void>;
  onMergeToParent: () => Promise<void>;
  onInlineAiRun: (instruction: string, selectedText: string) => Promise<AIChatReplyDTO>;
  onInlineAiApplied: (event: InlineAiAppliedEvent) => void;
  onOpenInlineInSidebar: (payload: InlineAiSidebarHandoff) => void;
}

export function renderEditorStageView(
  mainEl: HTMLElement,
  props: EditorStageProps,
  cb: EditorStageCallbacks
): TiptapStudio | null {
  activeStageAuthGuard?.destroy();
  activeStageAuthGuard = null;

  const { activeDoc, splitCompareDoc, docBreadcrumbs, prefs, securityCfg, editorMode, zenMode } = props;

  if (activeDoc.is_vault && activeDoc.encrypted) {
    const pinReady = Boolean(securityCfg.vault_pin_enabled && securityCfg.vault_pin_ready);
    const usePinPrimary = pinReady && props.overlayMode === "pin";

    mainEl.innerHTML = `
      <div class="writtt-sealed-stage">
        <div class="writtt-card writtt-sealed-card">
          <div class="writtt-vault-icon writtt-mb-xs">${matzIcon("lock", 30)}</div>
          <div class="writtt-sealed-title">
            ${t("Obra Protegida", "Protected Manuscript", "Obra Protegida")}
          </div>
          <div class="writtt-sealed-desc writtt-mono" id="ov-status-line">
            ${t("Acesso restrito", "Restricted access", "Acceso restringido")}
          </div>
          ${
            usePinPrimary
              ? `<form id="ov-pin-form" class="writtt-stack-form writtt-mb-xs" autocomplete="off">
                  <div class="writtt-inline-form">
                    <input type="password" class="matz-input writtt-mono writtt-pin-input" id="ov-vault-pin" inputmode="numeric" autocomplete="off" placeholder="PIN" />
                    <button type="submit" class="matz-btn matz-btn-primary" id="ov-submit-btn">${t("Abrir", "Unlock", "Abrir")}</button>
                  </div>
                  ${securityCfg.totp_enabled ? `<input type="text" class="matz-input writtt-mono writtt-pin-input" id="ov-totp" autocomplete="off" placeholder="2FA" />` : ""}
                  <div id="ov-human-slot"></div>
                </form>
                <div class="writtt-lock-links">
                  <button type="button" class="writtt-btn writtt-btn-ghost" id="ov-switch-pwd">
                    ${matzIcon("lock", 11)} <span>${t("Senha", "Password", "Contrasena")}</span>
                  </button>
                </div>`
              : `<form id="ov-pwd-form" class="writtt-stack-form writtt-mb-xs" autocomplete="off">
                  <div class="writtt-inline-form">
                    <input type="password" class="matz-input" id="ov-vault-pwd" autocomplete="off" placeholder="${t("Senha", "Password", "Contrasena")}" />
                    <button type="submit" class="matz-btn matz-btn-primary" id="ov-submit-btn">${t("Abrir", "Unlock", "Abrir")}</button>
                  </div>
                  ${securityCfg.totp_enabled ? `<input type="text" class="matz-input writtt-mono writtt-pin-input" id="ov-totp" autocomplete="off" placeholder="2FA" />` : ""}
                  <div id="ov-human-slot"></div>
                </form>
                <div class="writtt-lock-links">
                  ${
                    pinReady
                      ? `<button type="button" class="writtt-btn writtt-btn-ghost" id="ov-switch-pin">
                          ${matzIcon("key", 11)} <span>PIN</span>
                        </button>`
                      : ""
                  }
                </div>`
          }
        </div>
      </div>
    `;

    mainEl.querySelector("#ov-switch-pwd")?.addEventListener("click", () => cb.onChangeOverlayMode("password"));
    mainEl.querySelector("#ov-switch-pin")?.addEventListener("click", () => cb.onChangeOverlayMode("pin"));

    const ovPinInput = mainEl.querySelector("#ov-vault-pin") as HTMLInputElement | null;
    const ovPwdInput = mainEl.querySelector("#ov-vault-pwd") as HTMLInputElement | null;
    const ovTotpInput = mainEl.querySelector("#ov-totp") as HTMLInputElement | null;
    const ovSubmitBtn = mainEl.querySelector("#ov-submit-btn") as HTMLButtonElement | null;
    const ovStatusEl = mainEl.querySelector("#ov-status-line") as HTMLElement | null;
    const ovHoldSlotEl = mainEl.querySelector("#ov-human-slot") as HTMLElement | null;

    const runStageUnlock = async () => {
      if (!activeStageAuthGuard) return;
      const mode = usePinPrimary ? "vault-pin" : "vault-password";
      const secret = usePinPrimary ? ovPinInput?.value || "" : ovPwdInput?.value || "";
      const totp = (ovTotpInput?.value || "").trim();
      const res = await activeStageAuthGuard.attemptUnlock(mode, secret, totp);
      await cb.onRefreshSecurity();
      if (res.status === "unlocked") {
        activeStageAuthGuard.destroy();
        activeStageAuthGuard = null;
        if (!usePinPrimary) cb.onChangeOverlayMode("pin");
        await cb.onUnlockDocumentSuccess();
      }
    };

    activeStageAuthGuard = mountHumanAuthController({
      container: mainEl,
      inputs: [ovPinInput, ovPwdInput, ovTotpInput],
      submitButtons: [ovSubmitBtn],
      statusEl: ovStatusEl,
      holdSlotEl: ovHoldSlotEl,
      initialLocked: Boolean(securityCfg.brute_force_locked),
      initialRetrySec: Number(securityCfg.brute_force_retry_sec || 0),
      initialRequireHold: Boolean(securityCfg.human_hold_required),
      onReadyToSubmitAfterHold: () => void runStageUnlock(),
    });

    if (!securityCfg.brute_force_locked) {
      (ovPinInput || ovPwdInput)?.focus();
    }

    mainEl.querySelector("#ov-pin-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void runStageUnlock();
    });

    mainEl.querySelector("#ov-pwd-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void runStageUnlock();
    });

    return null;
  }

  mainEl.innerHTML = `
    ${
      zenMode
        ? `<button class="writtt-btn writtt-zen-exit" id="btn-exit-zen" title="Alt+Z">${matzIcon("eye", 12)} <span>${t("Sair do Modo Zen", "Exit Zen", "Salir de Zen")}</span></button>`
        : `
        ${
          docBreadcrumbs.length > 1
            ? `<div class="writtt-breadcrumbs">
                ${matzIcon("folder", 11)}
                ${docBreadcrumbs
                  .map(
                    (bc, i) =>
                      `<button class="writtt-btn writtt-btn-ghost writtt-crumb-btn ${i === docBreadcrumbs.length - 1 ? "is-current" : ""}" data-crumb="${esc(bc.id)}">${esc(bc.title)}</button>${i < docBreadcrumbs.length - 1 ? `<span>/</span>` : ""}`
                  )
                  .join("")}
              </div>`
            : ""
        }
        <div class="writtt-editor-header">
          <div class="writtt-header-group">
            <button class="writtt-btn ${activeDoc.is_vault ? "is-active writtt-vault-badge-btn" : ""}" id="hdr-toggle-vault">
              ${matzIcon(activeDoc.is_vault ? "lock" : "unlock", 12)}
              <span>${activeDoc.is_vault ? t("Cofre E2EE", "Vault E2EE", "Bóveda E2EE") : t("Público", "Public", "Público")}</span>
            </button>
            <div class="writtt-segmented">
              <button class="writtt-btn writtt-btn-ghost writtt-seg-btn ${editorMode === "rich" ? "is-active" : ""}" data-vmode="rich">Rich</button>
              <button class="writtt-btn writtt-btn-ghost writtt-seg-btn ${editorMode === "markdown" ? "is-active" : ""}" data-vmode="markdown">Markdown</button>
              ${
                activeDoc.parent_id
                  ? `<button class="writtt-btn writtt-btn-ghost writtt-seg-btn ${editorMode === "dual" ? "is-active" : ""}" data-vmode="dual" title="${t("Consultar a obra principal ao lado como referência", "View parent work side-by-side for reference", "Ver obra principal al lado")}">${t("Ver Obra Pai", "Parent Ref", "Ver Padre")}</button>`
                  : ""
              }
            </div>
          </div>

          <div class="writtt-header-group">
            <button class="writtt-btn writtt-btn-ghost" id="hdr-split-sub" title="${t("Adicionar um novo subcapítulo em branco dentro da estrutura desta obra", "Add a new blank sub-chapter nested inside this work", "Agregar un nuevo subcapítulo en blanco a esta obra")}">
              ${matzIcon("plus", 12)} <span>${t("Subcapítulo", "Sub-Chapter", "Subcapítulo")}</span>
            </button>
            <button class="writtt-btn writtt-btn-ghost" id="hdr-duplicate-doc" title="${t("Criar uma cópia completa e independente desta obra para trabalhar em outra frente", "Create a full standalone copy of this work to edit separately", "Crear una copia completa e independiente de esta obra")}">
              ${matzIcon("copy", 12)} <span>${t("Criar Cópia", "Make Copy", "Crear Copia")}</span>
            </button>
            <button class="writtt-btn writtt-btn-ghost" id="hdr-zen" title="${t("Modo Zen sem distrações (Alt+Z)", "Zen Distraction-Free Mode (Alt+Z)", "Modo Zen sin distracciones (Alt+Z)")}">
              ${matzIcon("eye", 13)}
            </button>
            <button class="writtt-btn ${props.aiStudioOpen ? "is-active" : ""}" id="hdr-ai-btn" title="${t("Abrir Estúdio IA & RAG (Chatbot, Editor IA, janela flutuante ou 2º monitor)", "Open AI & RAG Studio (Chatbot, Editorial AI, floating or 2nd monitor)", "Abrir Estudio IA y RAG")}">
              <span class="writtt-status-dot ${props.localAiOnline ? "is-online" : "is-offline"}"></span>
              ${matzIcon("sparkles", 12)} <span>IA / RAG</span>
            </button>
            <button class="writtt-btn ${props.inspectorOpen ? "is-active" : ""}" id="hdr-toggle-inspector" title="${t("Abrir ou fechar o Painel Editorial (Sumário, Versões e Exportar)", "Toggle Editorial Panel (Outline, History & Export)", "Abrir o cerrar el Panel Editorial")}">
              ${matzIcon("layers", 13)} <span>${t("Painel", "Panel", "Panel")}</span>
            </button>
            <button
              class="${props.saveState === "saved" ? "writtt-btn writtt-btn-sm writtt-save-btn is-saved" : props.saveState === "saving" ? "writtt-btn writtt-btn-sm writtt-save-btn is-saving" : "matz-btn matz-btn-primary writtt-btn-sm writtt-save-btn is-dirty"}"
              id="hdr-save"
              title="${
                props.saveState === "saved"
                  ? t("Documento salvo no disco (clique ou Ctrl+S para congelar nova versao)", "Saved to disk (click or Ctrl+S to freeze a new version snapshot)", "Documento guardado en disco (clic o Ctrl+S para nueva version)")
                  : t("Alteracoes pendentes — clique para salvar agora (Ctrl+S)", "Unsaved changes — click to save now (Ctrl+S)", "Cambios pendientes — clic para guardar (Ctrl+S)")
              }"
            >
              <span id="hdr-save-icon">${matzIcon(props.saveState === "saved" ? "check" : "save", 12)}</span>
              <span id="hdr-save-label">${
                props.saveState === "saving"
                  ? t("Salvando...", "Saving...", "Guardando...")
                  : props.saveState === "saved"
                  ? t("Salvo", "Saved", "Guardado")
                  : t("Salvar", "Save", "Guardar")
              }</span>
            </button>
          </div>
        </div>

        <div class="writtt-format-bar ${!props.formatBarOpen || editorMode === "markdown" ? "is-hidden" : ""}" id="writtt-format-bar">
          <div class="writtt-format-tools">
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="h1" data-tip="${t("Titulo Principal (H1) — Titulo de capitulo nivel 1", "Heading 1 (H1) — Main chapter heading", "Titulo Principal (H1) — Encabezado nivel 1")}" title="${t("Titulo Principal (H1)", "Heading 1 (H1)", "Titulo Principal (H1)")}">H1</button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="h2" data-tip="${t("Subtitulo de Secao (H2) — Divisao secundaria do capitulo", "Heading 2 (H2) — Section subheading", "Subtitulo de Seccion (H2)")}" title="${t("Subtitulo de Secao (H2)", "Heading 2 (H2)", "Subtitulo (H2)")}">H2</button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="h3" data-tip="${t("Subtopico (H3) — Topico interno dentro de uma secao", "Heading 3 (H3) — Sub-section heading", "Subtopico (H3)")}" title="${t("Subtopico (H3)", "Heading 3 (H3)", "Subtopico (H3)")}">H3</button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="bold" data-tip="${t("Negrito (Ctrl+B) — Destaca palavras com peso forte", "Bold (Ctrl+B) — Strong emphasis", "Negrita (Ctrl+B) — Destaca texto")}" title="${t("Negrito (Ctrl+B)", "Bold (Ctrl+B)", "Negrita (Ctrl+B)")}"><b>B</b></button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="italic" data-tip="${t("Italico (Ctrl+I) — Enfase suave, fala ou termo estrangeiro", "Italic (Ctrl+I) — Subtle emphasis or quote", "Cursiva (Ctrl+I) — Enfasis suave")}" title="${t("Italico (Ctrl+I)", "Italic (Ctrl+I)", "Cursiva (Ctrl+I)")}"><i>I</i></button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="underline" data-tip="${t("Sublinhado (Ctrl+U) — Linha abaixo do trecho selecionado", "Underline (Ctrl+U) — Underline selected text", "Subrayado (Ctrl+U)")}" title="${t("Sublinhado (Ctrl+U)", "Underline (Ctrl+U)", "Subrayado (Ctrl+U)")}"><u>U</u></button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="highlight" data-tip="${t("Marca-Texto — Realca o trecho com fundo colorido de revisao", "Highlight — Mark passage with review background", "Resaltador — Marca el texto con color")}" title="${t("Marca-Texto", "Highlight", "Resaltador")}">${matzIcon("edit", 11)}</button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="bulletList" data-tip="${t("Lista com Marcadores — Organiza itens em topicos", "Bullet List — Create bulleted items", "Lista con Vinetas")}" title="${t("Lista com Marcadores", "Bullet List", "Lista con Vinetas")}">${matzIcon("list", 12)}</button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="taskList" data-tip="${t("Lista de Tarefas — Caixas de selecao clicaveis (checklist)", "Task Checklist — Interactive checkable items", "Lista de Tareas Interactiva")}" title="${t("Lista de Tarefas", "Task Checklist", "Lista de Tareas")}">${matzIcon("check-circle", 12)}</button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="quote" data-tip="${t("Bloco de Citacao — Destaca citacoes, falas ou notas recuadas", "Blockquote — Indented quote or callout block", "Cita Destacada")}" title="${t("Bloco de Citacao", "Blockquote", "Cita Destacada")}">${matzIcon("chat", 12)}</button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="codeBlock" data-tip="${t("Bloco de Codigo — Codigo-fonte ou texto tecnico com sintaxe", "Code Block — Syntax-highlighted code snippet", "Bloque de Codigo")}" title="${t("Bloco de Codigo", "Code Block", "Bloque de Codigo")}">${matzIcon("code", 12)}</button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" data-cmd="table" data-tip="${t("Inserir Tabela 3x3 — Cria grade editavel de linhas e colunas", "Insert 3x3 Table — Editable rows and columns grid", "Insertar Tabla 3x3")}" title="${t("Inserir Tabela 3x3", "Insert 3x3 Table", "Insertar Tabla 3x3")}">${matzIcon("grid", 12)}</button>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" id="fmt-drawing" data-tip="${t("Desenho Vetorial SVG — Abre tela para desenhar esquemas a mao livre", "Vector SVG Sketchpad — Draw diagrams and freehand sketches", "Dibujo Vectorial SVG")}" title="${t("Desenho Vetorial SVG", "Vector SVG Sketchpad", "Dibujo Vectorial SVG")}">${matzIcon("feather", 12)} <span>SVG</span></button>
            <label class="writtt-btn writtt-btn-ghost writtt-file-label writtt-fmt-tip" data-tip="${t("Inserir Imagem — Anexa foto ou ilustracao do seu computador", "Insert Image — Attach a photo or illustration from disk", "Insertar Imagen desde tu Equipo")}" title="${t("Inserir Imagem do Computador", "Insert Image", "Insertar Imagen")}">
              ${matzIcon("image", 12)}
              <input type="file" id="fmt-attach-img" accept="image/*" hidden />
            </label>
            <button class="writtt-btn writtt-btn-ghost writtt-fmt-tip" id="fmt-slash" data-tip="${t("Comandos Rapidos (/) — Abre menu de blocos, tabelas e IA no cursor", "Slash Commands (/) — Open block & AI command menu at cursor", "Comandos Rapidos (/)")}" title="${t("Comandos Rapidos (/)", "Slash Commands (/)", "Comandos Rapidos (/)")}">/ Slash</button>
          </div>
          ${
            activeDoc.parent_id
              ? `<button class="writtt-btn writtt-merge-btn" id="fmt-merge-parent" title="${t("Anexar o texto deste subcapitulo ao final da obra principal", "Append this sub-chapter section to the end of the parent work", "Incorporar este subcapitulo al final de la obra principal")}">
                  ${matzIcon("git-merge", 11)} <span>${t("Incorporar na Obra Principal", "Append to Parent Work", "Incorporar a Obra Principal")}</span>
                </button>`
              : ""
          }
        </div>
        `
    }

    ${
      editorMode === "markdown"
        ? `<textarea class="writtt-source-textarea" id="writtt-source-ta" spellcheck="true">${esc(activeDoc.content)}</textarea>`
        : editorMode === "dual"
        ? `<div class="writtt-dual-grid">
            <div class="writtt-canvas-scroll writtt-dual-left">
              <div class="writtt-page width-wide" id="writtt-page-container">
                <input class="writtt-page-title" id="writtt-page-title-input" value="${esc(activeDoc.title)}" />
                <div id="writtt-tiptap-mount"></div>
              </div>
            </div>
            <div class="writtt-dual-right">
              <div class="writtt-dual-right-head">
                <span class="writtt-dual-title">${t("Documento Pai", "Parent Work", "Obra Padre")}: ${esc(splitCompareDoc?.title || "")}</span>
                <button class="writtt-btn" id="dual-diff-btn">${matzIcon("git-commit", 11)} <span>Diff vs Pai</span></button>
              </div>
              <div class="writtt-canvas-scroll writtt-md-preview writtt-dual-preview">
                ${renderMarkdownHtml(splitCompareDoc?.content || "")}
              </div>
            </div>
          </div>`
        : `<div class="writtt-canvas-scroll">
            <div class="writtt-page width-${prefs.pageWidth}" id="writtt-page-container">
              <input class="writtt-page-title" id="writtt-page-title-input" value="${esc(activeDoc.title)}" placeholder="${t("Titulo da obra...", "Manuscript title...", "Titulo de la obra...")}" />
              <div class="writtt-page-tags">
                ${(activeDoc.tags || [])
                  .map((tg) => `<span class="matz-badge writtt-mono writtt-badge-xs">#${esc(tg)}</span>`)
                  .join("")}
                <input class="writtt-tag-input" id="writtt-page-tags-input" value="${esc((activeDoc.tags || []).join(", "))}" placeholder="${t("+ tags separadas por virgula...", "+ comma-separated tags...", "+ etiquetas...")}" />
              </div>
              <div id="writtt-tiptap-mount"></div>
            </div>
          </div>`
    }
  `;

  mainEl.querySelector("#btn-exit-zen")?.addEventListener("click", cb.onToggleZen);
  mainEl.querySelector("#hdr-toggle-vault")?.addEventListener("click", () => void cb.onToggleDocVault());
  mainEl.querySelectorAll("[data-vmode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextMode = ((btn as HTMLElement).dataset.vmode as EditorViewMode) || "rich";
      if (nextMode !== editorMode) cb.onChangeEditorMode(nextMode);
    });
  });
  mainEl.querySelector("#hdr-split-sub")?.addEventListener("click", () => void cb.onCreateSplitSubChapter());
  mainEl.querySelector("#hdr-duplicate-doc")?.addEventListener("click", () => void cb.onDuplicateDocument());
  mainEl.querySelector("#hdr-zen")?.addEventListener("click", cb.onToggleZen);
  mainEl.querySelector("#hdr-ai-btn")?.addEventListener("click", () => cb.onToggleAiPanel?.());
  mainEl.querySelector("#hdr-toggle-inspector")?.addEventListener("click", cb.onToggleInspector);
  mainEl.querySelector("#hdr-save")?.addEventListener("click", cb.onSaveSnapshot);
  mainEl.querySelectorAll("[data-crumb]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = (btn as HTMLElement).dataset.crumb;
      if (cid) cb.onSelectBreadcrumb(cid);
    });
  });

  const titleInput = mainEl.querySelector("#writtt-page-title-input") as HTMLInputElement | null;
  titleInput?.addEventListener("input", () => cb.onTitleChange(titleInput.value));

  const tagsInput = mainEl.querySelector("#writtt-page-tags-input") as HTMLInputElement | null;
  tagsInput?.addEventListener("change", () => {
    const parsed = tagsInput.value.split(",").map((s) => s.trim()).filter(Boolean);
    cb.onTagsChange(parsed);
  });

  let tiptapInstance: TiptapStudio | null = null;

  mainEl.querySelectorAll("[data-cmd]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      tiptapInstance?.runCommand((btn as HTMLElement).dataset.cmd || "");
    });
  });
  mainEl.querySelector("#fmt-drawing")?.addEventListener("click", cb.onOpenDrawing);
  const attachInput = mainEl.querySelector("#fmt-attach-img") as HTMLInputElement | null;
  attachInput?.addEventListener("change", async () => {
    const f = attachInput.files?.[0];
    if (!f) return;
    const url = await cb.onUploadImage(f);
    if (url && tiptapInstance) tiptapInstance.insertImage(url, f.name);
    attachInput.value = "";
  });
  mainEl.querySelector("#fmt-slash")?.addEventListener("click", () => tiptapInstance?.openSlashMenuAtCaret());
  mainEl.querySelector("#fmt-merge-parent")?.addEventListener("click", () => void cb.onMergeToParent());
  mainEl.querySelector("#dual-diff-btn")?.addEventListener("click", () => {
    if (!splitCompareDoc) return;
    openMatzDiffModal(
      `Diff: ${splitCompareDoc.title} -> ${activeDoc.title}`,
      "Unified & Side-by-Side Intraline Diff (@matz/ui/diff)",
      { before: splitCompareDoc.content, after: activeDoc.content, fileName: `${activeDoc.title}.md` }
    );
  });

  if (editorMode === "markdown") {
    const ta = mainEl.querySelector("#writtt-source-ta") as HTMLTextAreaElement | null;
    ta?.addEventListener("input", () => cb.onContentChange(ta.value));
    return null;
  }

  const mountEl = mainEl.querySelector("#writtt-tiptap-mount") as HTMLElement | null;
  if (!mountEl) return null;

  tiptapInstance = new TiptapStudio({
    onChange: cb.onContentChange,
    onUploadImage: cb.onUploadImage,
    onOpenDrawing: cb.onOpenDrawing,
    onAddDictionaryWord: (w) => void cb.onAddDictionaryWord(w),
    onSplitSubChapter: () => void cb.onCreateSplitSubChapter(),
    onAskAI: (selectedText) =>
      cb.onOpenInlineInSidebar({ selectedText, draftPrompt: "", hasReply: false }),
    onInlineAiRun: cb.onInlineAiRun,
    onInlineAiApplied: cb.onInlineAiApplied,
    onOpenInAiSidebar: cb.onOpenInlineInSidebar,
  });
  tiptapInstance.mount(mountEl, activeDoc.content, prefs);
  return tiptapInstance;
}
