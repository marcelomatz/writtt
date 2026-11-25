/**
 * TiptapStudio — Rich Text + Portable Markdown Editorial Engine
 * Preserves 100% of Writtt's rich writing features (WYSIWYG, BubbleMenu, Table controls,
 * Slash Commands (/), Lowlight Syntax Code Blocks, Task Lists, Inline Images, SVG Drawings,
 * Focus Mode, Right-Click Context Menu, Persistent Inline /ai Selection Popover).
 */
import { Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Focus from "@tiptap/extension-focus";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { Markdown } from "tiptap-markdown";
import {
  attachMatzFloatingWindow,
  MatzAnchorBox,
  MatzFloatingWindowController,
  matzIcon,
  renderMatzResizeHandlesHtml,
} from "@matz/ui";
import { RingBuffer } from "@matz/ui/algorithms";
import {
  AIChatReplyDTO,
  EditorialPreferences,
  getSlashCommands,
  SlashCommandItem,
  t,
} from "../../domain";
import { esc } from "../dom/domUtils";

const lowlightInstance = createLowlight(common);

interface AiDiffMeta {
  clear?: boolean;
  range?: { from: number; to: number };
  fading?: boolean;
  badgeText?: string;
  tooltip?: string;
}

interface AiDiffPluginState {
  decos: DecorationSet;
  fading: boolean;
  badgeText: string;
  tooltip: string;
}

const aiDiffPluginKey = new PluginKey<AiDiffPluginState>("writttAiDiffFlash");

function buildAiDiffDecorations(
  doc: any,
  from: number,
  to: number,
  fading: boolean,
  badgeText: string,
  tooltip: string
): DecorationSet {
  const maxPos = doc.content.size;
  const safeFrom = Math.max(1, Math.min(from, maxPos));
  const safeTo = Math.max(safeFrom, Math.min(to, maxPos));
  if (safeTo <= safeFrom) return DecorationSet.empty;

  const decos: Decoration[] = [];
  const inlineCls = fading ? "writtt-ai-diff-applied is-fading" : "writtt-ai-diff-applied";
  const blockCls = fading ? "writtt-ai-diff-block is-fading" : "writtt-ai-diff-block";
  const badgeCls = fading ? "writtt-ai-diff-badge is-fading" : "writtt-ai-diff-badge";

  decos.push(Decoration.inline(safeFrom, safeTo, { class: inlineCls }));

  doc.nodesBetween(safeFrom, safeTo, (node: any, pos: number) => {
    if (node.isTextblock) {
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: blockCls }));
      return false;
    }
    return true;
  });

  decos.push(
    Decoration.widget(
      safeFrom,
      () => {
        const pill = document.createElement("span");
        pill.className = badgeCls;
        pill.setAttribute("contenteditable", "false");
        pill.textContent = badgeText;
        if (tooltip) pill.title = tooltip;
        return pill;
      },
      { side: -1 }
    )
  );

  return DecorationSet.create(doc, decos);
}

function createAiDiffFlashExtension() {
  return Extension.create({
    name: "writttAiDiffFlash",
    addProseMirrorPlugins() {
      return [
        new Plugin<AiDiffPluginState>({
          key: aiDiffPluginKey,
          state: {
            init: () => ({
              decos: DecorationSet.empty,
              fading: false,
              badgeText: "",
              tooltip: "",
            }),
            apply(tr, prev, _oldState, newState) {
              const meta = tr.getMeta(aiDiffPluginKey) as AiDiffMeta | undefined;
              if (meta?.clear) {
                return {
                  decos: DecorationSet.empty,
                  fading: false,
                  badgeText: "",
                  tooltip: "",
                };
              }
              if (meta?.range) {
                const fading = Boolean(meta.fading);
                const badgeText = meta.badgeText ?? prev.badgeText;
                const tooltip = meta.tooltip ?? prev.tooltip;
                return {
                  decos: buildAiDiffDecorations(
                    newState.doc,
                    meta.range.from,
                    meta.range.to,
                    fading,
                    badgeText,
                    tooltip
                  ),
                  fading,
                  badgeText,
                  tooltip,
                };
              }
              if (prev.decos === DecorationSet.empty) return prev;
              const mapped = prev.decos.map(tr.mapping, newState.doc);
              if (typeof meta?.fading === "boolean" && meta.fading !== prev.fading) {
                const found = mapped.find();
                if (found.length > 0) {
                  let minFrom = found[0].from;
                  let maxTo = found[0].to;
                  for (const d of found) {
                    if (d.from < minFrom) minFrom = d.from;
                    if (d.to > maxTo) maxTo = d.to;
                  }
                  return {
                    decos: buildAiDiffDecorations(
                      newState.doc,
                      minFrom,
                      maxTo,
                      meta.fading,
                      prev.badgeText,
                      prev.tooltip
                    ),
                    fading: meta.fading,
                    badgeText: prev.badgeText,
                    tooltip: prev.tooltip,
                  };
                }
              }
              return { ...prev, decos: mapped };
            },
          },
          props: {
            decorations(state) {
              return aiDiffPluginKey.getState(state)?.decos ?? DecorationSet.empty;
            },
          },
        }),
      ];
    },
  });
}

export interface AppliedInlineHistoryItem {
  sessionId: string;
  instruction: string;
  mode: "replace" | "insert";
  preview: string;
  timestamp: string;
}

export interface InlineAiSidebarHandoff {
  selectedText: string;
  draftPrompt: string;
  hasReply: boolean;
  sessionId?: string;
}

export interface InlineAiAppliedEvent {
  sessionId: string;
  mode: "replace" | "insert";
  originalText: string;
  appliedText: string;
}

export interface TiptapStudioCallbacks {
  onChange: (markdown: string) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  onOpenDrawing: () => void;
  onAddDictionaryWord: (word: string) => void;
  onSplitSubChapter: () => void;
  onAskAI: (selectedText: string) => void;
  onInlineAiRun: (instruction: string, selectedText: string) => Promise<AIChatReplyDTO>;
  onInlineAiApplied: (event: InlineAiAppliedEvent) => void;
  onOpenInAiSidebar: (payload: InlineAiSidebarHandoff) => void;
}

export class TiptapStudio {
  private editor: Editor | null = null;
  private hostEl: HTMLElement | null = null;
  private proseEl: HTMLElement | null = null;
  private bubbleEl: HTMLElement | null = null;
  private tableBarEl: HTMLElement | null = null;
  private slashEl: HTMLElement | null = null;
  private ctxEl: HTMLElement | null = null;
  private inlineAiEl: HTMLElement | null = null;
  private inlineAiWin: MatzFloatingWindowController | null = null;
  private stageResizeObserver: ResizeObserver | null = null;
  private appliedHistory = new RingBuffer<AppliedInlineHistoryItem>(8);
  private inlineSelectionSync: ((text: string, range: { from: number; to: number }) => void) | null = null;
  private diffFadeTimer: number | null = null;
  private diffClearTimer: number | null = null;
  private windowFeedbackTimer: number | null = null;
  private callbacks: TiptapStudioCallbacks;

  private suppressEmit = false;
  private slashOpen = false;
  private slashIndex = 0;
  private slashQueryLen = 1;
  private slashCommands: SlashCommandItem[] = [];
  private inlineAiRange: { from: number; to: number } | null = null;
  private ctxWord = "";
  private ctxSelection = "";

  private docKeyHandler = (e: KeyboardEvent) => this.handleGlobalKey(e);
  private docClickHandler = (e: MouseEvent) => this.handleGlobalClick(e);

  constructor(callbacks: TiptapStudioCallbacks) {
    this.callbacks = callbacks;
  }

  mount(container: HTMLElement, initialMarkdown: string, prefs: EditorialPreferences): void {
    this.destroy();
    this.hostEl = container;
    this.slashCommands = getSlashCommands();

    container.innerHTML = `
      <div class="writtt-table-bar" data-role="table-bar">
        <span class="writtt-table-label">${t("Tabela", "Table", "Tabla")}</span>
        <button class="writtt-btn" data-tbl="addRowAfter" title="${t("Adicionar nova linha abaixo da celula atual", "Add row below current cell", "Agregar fila debajo")}">+ ${t("Linha", "Row", "Fila")}</button>
        <button class="writtt-btn" data-tbl="deleteRow" title="${t("Remover a linha atual da tabela", "Delete current table row", "Eliminar fila actual")}">- ${t("Linha", "Row", "Fila")}</button>
        <button class="writtt-btn" data-tbl="addColumnAfter" title="${t("Adicionar nova coluna a direita", "Add column to the right", "Agregar columna a la derecha")}">+ ${t("Coluna", "Col", "Col")}</button>
        <button class="writtt-btn" data-tbl="deleteColumn" title="${t("Remover a coluna atual da tabela", "Delete current table column", "Eliminar columna actual")}">- ${t("Coluna", "Col", "Col")}</button>
        <button class="writtt-btn" data-tbl="toggleHeaderRow" title="${t("Ativar ou desativar destaque de linha de cabecalho", "Toggle table header row styling", "Alternar fila de encabezado")}">${t("Cabecalho", "Header", "Encabezado")}</button>
        <button class="writtt-btn writtt-btn-danger" data-tbl="deleteTable" title="${t("Excluir tabela inteira", "Delete entire table", "Eliminar tabla completa")}">${matzIcon("trash", 11)}</button>
      </div>

      <div class="writtt-prose font-${prefs.fontFamily} ${prefs.focusMode ? "is-focus-mode" : ""}" data-role="prose" style="font-size:${prefs.fontSize}px;"></div>

      <div class="writtt-bubble-menu" data-role="bubble-menu">
        <button class="writtt-btn writtt-btn-ghost" data-fmt="bold" title="${t("Negrito (Ctrl+B) — Destacar trecho selecionado", "Bold (Ctrl+B) — Strong emphasis", "Negrita (Ctrl+B)")}"><b>B</b></button>
        <button class="writtt-btn writtt-btn-ghost" data-fmt="italic" title="${t("Italico (Ctrl+I) — Enfase suave ou citacao", "Italic (Ctrl+I) — Subtle emphasis", "Cursiva (Ctrl+I)")}"><i>I</i></button>
        <button class="writtt-btn writtt-btn-ghost" data-fmt="underline" title="${t("Sublinhado (Ctrl+U) — Linha sob o texto", "Underline (Ctrl+U)", "Subrayado (Ctrl+U)")}"><u>U</u></button>
        <button class="writtt-btn writtt-btn-ghost" data-fmt="strike" title="${t("Tachado — Riscar trecho descartado", "Strikethrough — Cross out text", "Tachado")}"><s>S</s></button>
        <button class="writtt-btn writtt-btn-ghost" data-fmt="highlight" title="${t("Marca-Texto — Realcar fundo colorido", "Highlight — Colored background mark", "Resaltar")}">${matzIcon("edit", 12)}</button>
        <button class="writtt-btn writtt-btn-ghost" data-fmt="code" title="${t("Codigo em Linha — Formatar termo tecnico", "Inline Code — Monospace technical span", "Codigo en linea")}">${matzIcon("code", 12)}</button>
        <button class="writtt-btn writtt-btn-ghost" data-fmt="h1" title="${t("Transformar em Titulo Principal (H1)", "Convert to Heading 1 (H1)", "Convertir en Titulo H1")}">H1</button>
        <button class="writtt-btn writtt-btn-ghost" data-fmt="h2" title="${t("Transformar em Subtitulo de Secao (H2)", "Convert to Heading 2 (H2)", "Convertir en Subtitulo H2")}">H2</button>
        <button class="writtt-btn writtt-btn-ghost" data-fmt="quote" title="${t("Transformar em Bloco de Citacao", "Convert to Blockquote", "Convertir en Cita")}">${matzIcon("chat", 12)}</button>
        <button class="writtt-btn writtt-btn-ghost" data-fmt="link" title="${t("Inserir ou editar Link clicavel", "Insert or edit hyperlink", "Insertar o editar enlace")}">${matzIcon("link", 12)}</button>
        <button class="writtt-btn writtt-bubble-ai-btn" data-fmt="inline-ai" title="${t("Pedir para a IA revisar, resumir ou reescrever este trecho (/ai)", "Ask AI to polish, summarize, or rewrite this selection (/ai)", "Actuar con IA sobre esta seleccion")}">
          ${matzIcon("sparkles", 11)} <span>IA</span>
        </button>
      </div>

      <div class="writtt-popover-menu" data-role="slash-menu"></div>
      <div class="writtt-popover-menu" data-role="ctx-menu"></div>
      <div class="matz-floating-window writtt-inline-ai-window" data-role="inline-ai-menu"></div>
    `;

    this.proseEl = container.querySelector('[data-role="prose"]');
    this.bubbleEl = container.querySelector('[data-role="bubble-menu"]');
    this.tableBarEl = container.querySelector('[data-role="table-bar"]');
    this.slashEl = container.querySelector('[data-role="slash-menu"]');
    this.ctxEl = container.querySelector('[data-role="ctx-menu"]');
    this.inlineAiEl = container.querySelector('[data-role="inline-ai-menu"]');

    if (this.inlineAiEl) {
      const stageEl = document.getElementById("writtt-main");
      this.inlineAiWin = attachMatzFloatingWindow(this.inlineAiEl, {
        defaultWidth: 440,
        minWidth: 340,
        maxWidth: 760,
        minHeight: 225,
        maxHeight: 680,
        storageKey: "writtt-inline-ai-window-v1",
        getStageBounds: () => {
          const stEl = document.getElementById("writtt-main");
          if (stEl) {
            const r = stEl.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          }
          return {
            left: 12,
            top: 70,
            right: window.innerWidth - 12,
            bottom: window.innerHeight - 28,
          };
        },
        onLayoutChange: () => {
          const expBtn = this.inlineAiEl?.querySelector("[data-iai-expand]") as HTMLElement | null;
          if (expBtn && this.inlineAiWin) {
            const exp = this.inlineAiWin.isExpanded();
            expBtn.innerHTML = matzIcon(exp ? "minimize" : "maximize", 11);
            expBtn.title = exp
              ? t("Restaurar tamanho", "Restore size", "Restaurar tamano")
              : t("Expandir janela no palco", "Expand window on stage", "Expandir ventana");
          }
        },
      });
      if (stageEl && typeof ResizeObserver !== "undefined") {
        this.stageResizeObserver = new ResizeObserver(() => {
          if (this.inlineAiEl?.classList.contains("is-visible")) {
            this.inlineAiWin?.ensureVisible();
          }
        });
        this.stageResizeObserver.observe(stageEl);
      }
    }

    if (!this.proseEl) return;

    this.editor = new Editor({
      element: this.proseEl,
      extensions: [
        StarterKit.configure({ codeBlock: false }),
        CodeBlockLowlight.configure({ lowlight: lowlightInstance }),
        Underline,
        Highlight,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Link.configure({ openOnClick: false, autolink: true }),
        Image.configure({ inline: false, allowBase64: true }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        TaskList,
        TaskItem.configure({ nested: true }),
        Typography,
        Placeholder.configure({
          placeholder: t(
            "Comece a escrever sua obra... Digite '/' para comandos rapidos.",
            "Start writing your manuscript... Type '/' for slash commands.",
            "Comienza a escribir tu obra... Escribe '/' para comandos rapidos."
          ),
        }),
        Focus.configure({ className: "has-focus", mode: "shallowest" }),
        Markdown.configure({
          html: true,
          tightLists: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
        createAiDiffFlashExtension(),
      ],
      content: initialMarkdown || "",
      editorProps: {
        attributes: { spellcheck: "true" },
        handleDrop: (_view, event) => {
          const file = event.dataTransfer?.files?.[0];
          if (file && file.type.startsWith("image/")) {
            event.preventDefault();
            void this.handleImageFile(file);
            return true;
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith("image/")) {
              const file = items[i].getAsFile();
              if (file) {
                event.preventDefault();
                void this.handleImageFile(file);
                return true;
              }
            }
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        if (this.suppressEmit) return;
        const md = this.extractMarkdown(editor);
        this.callbacks.onChange(md);
        this.checkSlashTrigger(editor);
      },
      onSelectionUpdate: ({ editor }) => {
        this.updateBubbleMenu(editor);
        this.updateTableBar(editor);
        if (this.inlineAiEl?.classList.contains("is-visible") && this.inlineSelectionSync) {
          const { from, to, empty } = editor.state.selection;
          if (!empty && from !== to) {
            const nextSel = editor.state.doc.textBetween(from, to, "\n").trim();
            if (nextSel) {
              this.inlineSelectionSync(nextSel, { from, to });
            }
          }
        }
      },
      onBlur: () => {
        setTimeout(() => {
          if (this.bubbleEl && !this.bubbleEl.matches(":hover")) {
            this.bubbleEl.classList.remove("is-visible");
          }
        }, 120);
      },
    });

    this.bindBubbleButtons();
    this.bindTableButtons();
    this.bindContextMenu();

    window.addEventListener("keydown", this.docKeyHandler, true);
    window.addEventListener("mousedown", this.docClickHandler);
  }

  private extractMarkdown(editor: Editor): string {
    try {
      const storage = editor.storage as Record<string, any>;
      if (storage?.markdown?.getMarkdown) {
        return storage.markdown.getMarkdown();
      }
    } catch {
      // fallback
    }
    return editor.getText();
  }

  getMarkdown(): string {
    if (!this.editor) return "";
    return this.extractMarkdown(this.editor);
  }

  setDocument(markdown: string, editable = true): void {
    if (!this.editor) return;
    this.suppressEmit = true;
    try {
      this.editor.setEditable(editable);
      this.editor.commands.setContent(markdown || "", { emitUpdate: false });
    } finally {
      this.suppressEmit = false;
    }
    this.closeAllPopovers();
  }

  applyPreferences(prefs: EditorialPreferences): void {
    if (!this.proseEl) return;
    this.proseEl.classList.remove("font-serif", "font-sans", "font-mono");
    this.proseEl.classList.add(`font-${prefs.fontFamily}`);
    this.proseEl.style.fontSize = `${prefs.fontSize}px`;
    this.proseEl.classList.toggle("is-focus-mode", prefs.focusMode);
  }

  runCommand(cmd: string): void {
    if (!this.editor) return;
    const chain = this.editor.chain().focus();
    switch (cmd) {
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "underline":
        chain.toggleUnderline().run();
        break;
      case "strike":
        chain.toggleStrike().run();
        break;
      case "highlight":
        chain.toggleHighlight().run();
        break;
      case "code":
        chain.toggleCode().run();
        break;
      case "codeBlock":
        chain.toggleCodeBlock().run();
        break;
      case "h1":
        chain.toggleHeading({ level: 1 }).run();
        break;
      case "h2":
        chain.toggleHeading({ level: 2 }).run();
        break;
      case "h3":
        chain.toggleHeading({ level: 3 }).run();
        break;
      case "bulletList":
        chain.toggleBulletList().run();
        break;
      case "orderedList":
        chain.toggleOrderedList().run();
        break;
      case "taskList":
        chain.toggleTaskList().run();
        break;
      case "quote":
        chain.toggleBlockquote().run();
        break;
      case "hr":
        chain.setHorizontalRule().run();
        break;
      case "table":
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case "alignLeft":
        chain.setTextAlign("left").run();
        break;
      case "alignCenter":
        chain.setTextAlign("center").run();
        break;
      case "alignRight":
        chain.setTextAlign("right").run();
        break;
      case "undo":
        chain.undo().run();
        break;
      case "redo":
        chain.redo().run();
        break;
      case "link": {
        const prev = this.editor.getAttributes("link").href || "";
        const url = window.prompt(t("URL do link:", "Link URL:", "URL del enlace:"), prev);
        if (url === null) return;
        if (url.trim() === "") {
          chain.extendMarkRange("link").unsetLink().run();
        } else {
          chain.extendMarkRange("link").setLink({ href: url.trim() }).run();
        }
        break;
      }
    }
  }

  insertImage(url: string, alt = "image"): void {
    if (!this.editor) return;
    this.editor.chain().focus().setImage({ src: url, alt }).run();
  }

  insertRawContent(htmlOrMd: string): void {
    if (!this.editor) return;
    this.editor.chain().focus().insertContent(htmlOrMd).run();
  }

  insertRawContentWithDiffFlash(htmlOrMd: string): void {
    if (!this.editor) return;
    const insertAt = this.editor.state.selection.to;
    const sizeBefore = this.editor.state.doc.content.size;
    this.editor.chain().focus().insertContentAt(insertAt, htmlOrMd).run();
    const sizeAfter = this.editor.state.doc.content.size;
    const insertedSpan = Math.max(0, sizeAfter - sizeBefore);
    if (insertedSpan > 0) {
      this.flashAppliedDiffRange(Math.max(1, insertAt), Math.min(sizeAfter, insertAt + insertedSpan), "insert");
    }
  }

  private clearDiffTimers(): void {
    if (this.diffFadeTimer !== null) {
      window.clearTimeout(this.diffFadeTimer);
      this.diffFadeTimer = null;
    }
    if (this.diffClearTimer !== null) {
      window.clearTimeout(this.diffClearTimer);
      this.diffClearTimer = null;
    }
  }

  private flashAppliedDiffRange(
    from: number,
    to: number,
    mode: "replace" | "insert",
    previousExcerpt = ""
  ): void {
    if (!this.editor) return;
    this.clearDiffTimers();

    const docSize = this.editor.state.doc.content.size;
    const safeFrom = Math.max(1, Math.min(from, docSize));
    const safeTo = Math.max(safeFrom, Math.min(to, docSize));
    if (safeTo <= safeFrom) return;

    const badgeText =
      mode === "replace"
        ? t("+ IA · Trecho Substituido", "+ AI · Replaced", "+ IA · Reemplazado")
        : t("+ IA · Novo Trecho", "+ AI · Inserted", "+ IA · Insertado");
    const tooltip = previousExcerpt
      ? `${t("Anterior", "Previous", "Anterior")}: "${previousExcerpt.slice(0, 140)}${previousExcerpt.length > 140 ? "..." : ""}"`
      : "";

    this.editor.view.dispatch(
      this.editor.state.tr.setMeta(aiDiffPluginKey, {
        range: { from: safeFrom, to: safeTo },
        fading: false,
        badgeText,
        tooltip,
      } satisfies AiDiffMeta)
    );

    requestAnimationFrame(() => {
      const firstNode = this.proseEl?.querySelector(".writtt-ai-diff-applied, .writtt-ai-diff-badge") as HTMLElement | null;
      firstNode?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    this.diffFadeTimer = window.setTimeout(() => {
      if (!this.editor) return;
      this.editor.view.dispatch(
        this.editor.state.tr.setMeta(aiDiffPluginKey, {
          fading: true,
        } satisfies AiDiffMeta)
      );
      this.diffFadeTimer = null;
    }, 3200);

    this.diffClearTimer = window.setTimeout(() => {
      if (!this.editor) return;
      this.editor.view.dispatch(
        this.editor.state.tr.setMeta(aiDiffPluginKey, {
          clear: true,
        } satisfies AiDiffMeta)
      );
      this.diffClearTimer = null;
    }, 4300);
  }

  scrollToHeadingIndex(index: number): void {
    if (!this.proseEl) return;
    const headings = this.proseEl.querySelectorAll("h1, h2, h3");
    const target = headings[index] as HTMLElement | undefined;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  openSlashMenuAtCaret(filterQuery = "", queryLen = 1): void {
    if (!this.editor || !this.slashEl) return;
    const all = getSlashCommands();
    const q = filterQuery.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (c) =>
            c.id.toLowerCase().includes(q) ||
            c.shortcut.toLowerCase().includes(q) ||
            c.label.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q)
        )
      : all;

    if (filtered.length === 0) {
      this.slashOpen = false;
      this.slashEl.classList.remove("is-visible");
      return;
    }

    const { from } = this.editor.state.selection;
    const coords = this.editor.view.coordsAtPos(from);
    this.slashOpen = true;
    this.slashQueryLen = queryLen;
    this.slashCommands = filtered;
    if (this.slashIndex >= filtered.length) this.slashIndex = 0;
    this.renderSlashMenu(coords.left, coords.bottom + 6);
  }

  closeAllPopovers(): void {
    this.slashOpen = false;
    this.inlineAiRange = null;
    this.inlineSelectionSync = null;
    if (this.windowFeedbackTimer !== null) {
      window.clearTimeout(this.windowFeedbackTimer);
      this.windowFeedbackTimer = null;
    }
    this.slashEl?.classList.remove("is-visible");
    this.ctxEl?.classList.remove("is-visible");
    this.bubbleEl?.classList.remove("is-visible");
    this.inlineAiEl?.classList.remove("is-visible");
  }

  isPopoverOpen(): boolean {
    return (
      this.slashOpen ||
      Boolean(this.ctxEl?.classList.contains("is-visible")) ||
      Boolean(this.inlineAiEl?.classList.contains("is-visible"))
    );
  }

  openInlineAiPopover(): void {
    if (!this.editor || !this.inlineAiEl) return;
    const { from, to } = this.editor.state.selection;
    let selectedText = from !== to ? this.editor.state.doc.textBetween(from, to, "\n").trim() : "";
    this.inlineAiRange = { from, to };
    this.bubbleEl?.classList.remove("is-visible");

    const startCoords = this.editor.view.coordsAtPos(from);
    const endCoords = this.editor.view.coordsAtPos(to);
    const anchorBox: MatzAnchorBox = {
      left: Math.min(startCoords.left, endCoords.left),
      top: Math.min(startCoords.top, endCoords.top),
      right: Math.max(startCoords.right, endCoords.right),
      bottom: Math.max(startCoords.bottom, endCoords.bottom),
    };

    const wasAlreadyVisible = this.inlineAiEl.classList.contains("is-visible");
    let initialPlacementPending = !wasAlreadyVisible;

    const renderContextHtml = (text: string) =>
      text
        ? `<div class="writtt-iai-excerpt">
            "${esc(text.slice(0, 180))}${text.length > 180 ? "..." : ""}"
          </div>`
        : `<div class="writtt-iai-hint">${t("Gerar conteudo no cursor ou selecione um trecho no texto (ambiente isolado).", "Generate at cursor or select text in manuscript (isolated sandbox).", "Generar en el cursor o selecciona un trecho.")}</div>`;

    const renderHistorySectionHtml = () => {
      if (this.appliedHistory.size === 0) return "";
      const recentItems: AppliedInlineHistoryItem[] = [];
      const count = Math.min(3, this.appliedHistory.size);
      for (let i = 0; i < count; i++) {
        const item = this.appliedHistory.peekNewest(i);
        if (item) recentItems.push(item);
      }
      return `
        <div class="writtt-iai-history">
          <div class="writtt-iai-history-head">
            <span>${matzIcon("git-commit", 10)} ${t("Historico aplicado", "Applied history", "Historial aplicado")} (${this.appliedHistory.size})</span>
            <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-iai-sidebar-hist="${esc(recentItems[0]?.sessionId || "")}">
              ${t("Abrir no IA/RAG", "Open in AI/RAG", "Abrir en IA/RAG")}
            </button>
          </div>
          <div class="writtt-iai-history-list">
            ${recentItems
              .map(
                (h) => `
                <button type="button" class="writtt-iai-history-item" data-iai-hist-session="${esc(h.sessionId)}" title="${t("Visualizar ou editar esta conversa na Sidebar IA/RAG", "View or edit this session in AI/RAG Sidebar", "Ver en Sidebar IA/RAG")}">
                  <span class="writtt-iai-history-badge">${h.mode === "replace" ? t("Substituido", "Replaced", "Reemplazado") : t("Inserido", "Inserted", "Insertado")}</span>
                  <span class="writtt-iai-history-text">${esc(h.instruction)}: "${esc(h.preview)}${h.preview.length >= 90 ? "..." : ""}"</span>
                  <span class="writtt-mono writtt-iai-history-time">${esc(h.timestamp)}</span>
                </button>`
              )
              .join("")}
          </div>
        </div>
      `;
    };

    const renderState = (
      busy: boolean,
      reply: AIChatReplyDTO | null,
      errMsg = "",
      activeAction = "",
      appliedFeedback = ""
    ) => {
      if (!this.inlineAiEl) return;
      const isExp = Boolean(this.inlineAiWin?.isExpanded());

      if (this.windowFeedbackTimer !== null) {
        window.clearTimeout(this.windowFeedbackTimer);
        this.windowFeedbackTimer = null;
      }

      this.inlineSelectionSync = !busy && !reply
        ? (nextText, nextRange) => {
            selectedText = nextText;
            this.inlineAiRange = nextRange;
            const slot = this.inlineAiEl?.querySelector("[data-iai-context-slot]");
            if (slot) slot.innerHTML = renderContextHtml(selectedText);
          }
        : null;

      this.inlineAiEl.innerHTML = `
        <div class="matz-floating-header writtt-iai-head" data-matz-float-drag title="${t("Arraste para mover no palco ou clique duplo para expandir", "Drag to move on stage or double-click to expand", "Arrastra para mover o doble clic para expandir")}">
          <span class="writtt-iai-title">
            ${busy ? `<span class="writtt-spinner"></span>` : matzIcon("cpu", 12)}
            <span>${busy ? t("IA trabalhando...", "AI is working...", "IA trabajando...") : t("Assistente IA no Palco (/ai)", "Stage AI Assistant (/ai)", "Asistente IA en Escena (/ai)")}</span>
          </span>
          <div class="writtt-iai-controls" data-no-drag>
            <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs" data-iai-center title="${t("Centralizar no palco", "Center on stage", "Centrar en el escenario")}">
              ${matzIcon("target", 11)}
            </button>
            <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs" data-iai-corner title="${t("Mover pelos cantos do palco", "Snap across stage corners", "Mover a las esquinas")}">
              ${matzIcon("dock", 11)}
            </button>
            <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs" data-iai-expand title="${isExp ? t("Restaurar tamanho", "Restore size", "Restaurar tamano") : t("Expandir janela no palco", "Expand window on stage", "Expandir ventana")}">
              ${matzIcon(isExp ? "minimize" : "maximize", 11)}
            </button>
            <button type="button" class="writtt-btn writtt-btn-xs writtt-iai-sidebar-pill" data-iai-sidebar title="${t("Abrir e continuar na Sidebar IA / RAG", "Open and continue in AI / RAG Sidebar", "Ver en barra lateral IA / RAG")}">
              ${matzIcon("sidebar", 11)} <span>IA/RAG</span>
            </button>
            <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs" data-iai-close title="${t("Fechar (ESC)", "Close (ESC)", "Cerrar (ESC)")}">
              ${matzIcon("close", 11)}
            </button>
          </div>
        </div>

        <div class="matz-floating-body writtt-iai-body">
          ${
            appliedFeedback
              ? `<div class="writtt-iai-applied-banner" data-iai-feedback-banner>
                  <span class="writtt-iai-applied-icon">${matzIcon("check-circle", 13)}</span>
                  <span>${esc(appliedFeedback)}</span>
                </div>`
              : ""
          }
          <div data-iai-context-slot>${renderContextHtml(selectedText)}</div>
          <form data-iai-form class="writtt-inline-form writtt-mb-xs">
            <input class="matz-input writtt-input-sm" data-iai-input value="${esc(activeAction)}" placeholder="${t("Ex.: Reescreva com mais suspense...", "E.g. Rewrite more concisely...", "Instruccion para la IA...")}" ${busy ? "disabled" : ""} />
            <button type="submit" class="matz-btn matz-btn-primary writtt-btn-sm" ${busy ? "disabled" : ""} title="${t("Enviar instrucao", "Send instruction", "Enviar")}">${busy ? `<span class="writtt-spinner writtt-spinner-light"></span>` : matzIcon("send", 11)}</button>
          </form>
          <div class="writtt-chip-row ${busy || reply || errMsg || this.appliedHistory.size > 0 ? "writtt-mb-xs" : ""}">
            <button type="button" class="writtt-btn writtt-btn-xs" data-iai-chip="Melhore a clareza e fluidez mantendo a voz do autor" data-iai-label="${t("Melhorar", "Polish", "Mejorar")}" ${busy ? "disabled" : ""}>${t("Melhorar", "Polish", "Mejorar")}</button>
            <button type="button" class="writtt-btn writtt-btn-xs" data-iai-chip="Resuma este trecho de forma objetiva" data-iai-label="${t("Resumir", "Shorten", "Resumir")}" ${busy ? "disabled" : ""}>${t("Resumir", "Shorten", "Resumir")}</button>
            <button type="button" class="writtt-btn writtt-btn-xs" data-iai-chip="Expanda este trecho com mais detalhes descritivos" data-iai-label="${t("Expandir", "Expand", "Expandir")}" ${busy ? "disabled" : ""}>${t("Expandir", "Expand", "Expandir")}</button>
            <button type="button" class="writtt-btn writtt-btn-xs" data-iai-chip="Corrija gramatica e pontuacao sem alterar o sentido" data-iai-label="${t("Corrigir", "Fix Grammar", "Corregir")}" ${busy ? "disabled" : ""}>${t("Corrigir", "Fix Grammar", "Corregir")}</button>
          </div>
          ${
            busy
              ? `<div class="writtt-iai-busy-box">
                  <span class="writtt-spinner"></span>
                  <div class="writtt-min-w0">
                    <div class="writtt-iai-busy-title">${t("A IA esta trabalhando no seu pedido...", "AI is working on your request...", "La IA esta trabajando...")}</div>
                    <div class="writtt-iai-busy-sub">${esc(activeAction || t("Processando localmente no Ollama...", "Processing locally on Ollama...", "Procesando en Ollama..."))}</div>
                  </div>
                </div>`
              : ""
          }
          ${errMsg ? `<div class="writtt-iai-err">${esc(errMsg)}</div>` : ""}
          ${
            reply
              ? `<div class="writtt-iai-reply-stack">
                  ${
                    reply.opinion
                      ? `<div class="writtt-iai-opinion">
                          <b class="writtt-iai-kicker">${t("Opiniao da IA:", "AI Opinion:", "Opinion:")}</b> ${esc(reply.opinion)}
                        </div>`
                      : ""
                  }
                  <div class="writtt-iai-result">${esc(reply.insertableContent || reply.raw)}</div>
                </div>`
              : renderHistorySectionHtml()
          }
        </div>

        <div class="matz-floating-footer writtt-iai-footer">
          <button type="button" class="writtt-btn writtt-btn-xs" data-iai-sidebar-foot>
            ${matzIcon("sidebar", 11)} <span>${t("Ver na Sidebar IA/RAG", "View in AI/RAG Sidebar", "Ver en Sidebar IA/RAG")}</span>
          </button>
          <div class="writtt-iai-footer-actions">
            ${
              reply
                ? `${
                    selectedText
                      ? `<button type="button" class="matz-btn matz-btn-primary writtt-btn-xs" data-iai-replace>${matzIcon("check", 11)} <span>${t("Substituir Trecho", "Replace Selection", "Reemplazar")}</span></button>`
                      : ""
                  }
                  <button type="button" class="writtt-btn writtt-btn-xs" data-iai-insert>${matzIcon("plus", 11)} <span>${t("Inserir", "Insert", "Insertar")}</span></button>`
                : `<span class="writtt-iai-drag-hint">${t("Posicao e tamanho mantidos no palco", "Stage position & size preserved", "Posicion y tamano conservados")}</span>`
            }
          </div>
        </div>
        ${renderMatzResizeHandlesHtml()}
      `;

      this.inlineAiEl.classList.add("is-visible");
      if (initialPlacementPending) {
        initialPlacementPending = false;
        this.inlineAiWin?.openNearAnchor(anchorBox);
      } else {
        this.inlineAiWin?.ensureVisible();
      }

      if (appliedFeedback) {
        this.windowFeedbackTimer = window.setTimeout(() => {
          const banner = this.inlineAiEl?.querySelector("[data-iai-feedback-banner]") as HTMLElement | null;
          if (banner) {
            banner.classList.add("is-fading");
            window.setTimeout(() => banner.remove(), 320);
          }
          this.windowFeedbackTimer = null;
        }, 3600);
      }

      const inp = this.inlineAiEl.querySelector("[data-iai-input]") as HTMLInputElement | null;
      if (!busy && !reply && !appliedFeedback) inp?.focus();

      const execute = async (inst: string, displayLabel = "") => {
        if (!inst.trim()) return;
        const label = displayLabel || inst.trim();
        renderState(true, null, "", label);
        try {
          const res = await this.callbacks.onInlineAiRun(inst.trim(), selectedText);
          renderState(false, res, "", label);
        } catch (e: any) {
          renderState(false, null, `${e?.message || e}`, label);
        }
      };

      const handoffToSidebar = (targetSessionId = "") => {
        const draftPrompt = (inp?.value || activeAction || "").trim();
        const hasSessionOrReply = Boolean(reply || targetSessionId);
        this.closeAllPopovers();
        this.callbacks.onOpenInAiSidebar({
          selectedText,
          draftPrompt,
          hasReply: hasSessionOrReply,
          sessionId: targetSessionId || reply?.sessionId,
        });
      };

      const applyReplyToDocument = (mode: "replace" | "insert") => {
        if (!this.editor || !reply) return;
        const text = (reply.insertableContent || reply.raw || "").trim();
        if (!text) return;

        const targetRange = this.inlineAiRange ?? {
          from: this.editor.state.selection.from,
          to: this.editor.state.selection.to,
        };
        const previousExcerpt = selectedText;
        let appliedFrom = targetRange.from;
        let appliedTo = targetRange.to;

        if (mode === "replace" && targetRange.from !== targetRange.to) {
          const sizeBefore = this.editor.state.doc.content.size;
          const removedSpan = Math.max(0, targetRange.to - targetRange.from);
          this.editor.chain().focus().deleteRange(targetRange).insertContentAt(targetRange.from, text).run();
          const sizeAfter = this.editor.state.doc.content.size;
          const insertedSpan = Math.max(0, sizeAfter - (sizeBefore - removedSpan));
          appliedFrom = targetRange.from;
          appliedTo = Math.min(sizeAfter, targetRange.from + insertedSpan);
        } else {
          const insertPos = targetRange.to;
          const sizeBefore = this.editor.state.doc.content.size;
          this.editor.chain().focus().insertContentAt(insertPos, `\n\n${text}`).run();
          const sizeAfter = this.editor.state.doc.content.size;
          const insertedSpan = Math.max(0, sizeAfter - sizeBefore);
          appliedFrom = Math.max(1, insertPos);
          appliedTo = Math.min(sizeAfter, insertPos + insertedSpan);
        }

        this.flashAppliedDiffRange(appliedFrom, appliedTo, mode, mode === "replace" ? previousExcerpt : "");

        const sessionId = reply.sessionId || "";
        this.appliedHistory.push({
          sessionId,
          instruction: activeAction || t("Sugestao IA", "AI Suggestion", "Sugerencia IA"),
          mode,
          preview: text.replace(/\s+/g, " ").slice(0, 90),
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });

        this.callbacks.onInlineAiApplied({
          sessionId,
          mode,
          originalText: previousExcerpt,
          appliedText: text,
        });

        // Reset AI window to clean default state while preserving user's stage position, size & expand settings
        selectedText = "";
        this.inlineAiRange = { from: appliedTo, to: appliedTo };
        const confirmText =
          mode === "replace"
            ? t(
                "Trecho substituido no manuscrito com destaque temporario e salvo no historico.",
                "Selection replaced with temporary diff highlight and saved to history.",
                "Trecho reemplazado con resaltado temporal y guardado en el historial."
              )
            : t(
                "Conteudo inserido no manuscrito com destaque temporario e salvo no historico.",
                "Content inserted with temporary diff highlight and saved to history.",
                "Contenido insertado con resaltado temporal y guardado en el historial."
              );
        renderState(false, null, "", "", confirmText);
      };

      this.inlineAiEl.querySelector("[data-iai-center]")?.addEventListener("click", () => {
        this.inlineAiWin?.snapToPreset("center");
      });
      this.inlineAiEl.querySelector("[data-iai-corner]")?.addEventListener("click", () => {
        this.inlineAiWin?.cycleCornerPreset();
      });
      this.inlineAiEl.querySelector("[data-iai-expand]")?.addEventListener("click", () => {
        this.inlineAiWin?.toggleExpand();
      });
      this.inlineAiEl.querySelector("[data-iai-sidebar]")?.addEventListener("click", () => handoffToSidebar());
      this.inlineAiEl.querySelector("[data-iai-sidebar-foot]")?.addEventListener("click", () => handoffToSidebar());
      this.inlineAiEl.querySelector("[data-iai-sidebar-hist]")?.addEventListener("click", (ev) => {
        const sid = (ev.currentTarget as HTMLElement).dataset.iaiSidebarHist || "";
        handoffToSidebar(sid);
      });
      this.inlineAiEl.querySelectorAll("[data-iai-hist-session]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const sid = (btn as HTMLElement).dataset.iaiHistSession || "";
          handoffToSidebar(sid);
        });
      });
      this.inlineAiEl.querySelector("[data-iai-close]")?.addEventListener("click", () => this.closeAllPopovers());

      this.inlineAiEl.querySelector("[data-iai-form]")?.addEventListener("submit", (ev) => {
        ev.preventDefault();
        void execute(inp?.value || "");
      });
      this.inlineAiEl.querySelectorAll("[data-iai-chip]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const el = btn as HTMLElement;
          void execute(el.dataset.iaiChip || "", el.dataset.iaiLabel || "");
        });
      });
      this.inlineAiEl.querySelector("[data-iai-replace]")?.addEventListener("click", () => {
        applyReplyToDocument("replace");
      });
      this.inlineAiEl.querySelector("[data-iai-insert]")?.addEventListener("click", () => {
        applyReplyToDocument("insert");
      });
    };

    renderState(false, null);
  }

  private async handleImageFile(file: File): Promise<void> {
    const url = await this.callbacks.onUploadImage(file);
    if (url) {
      this.insertImage(url, file.name);
    }
  }

  private checkSlashTrigger(editor: Editor): void {
    const { from, empty } = editor.state.selection;
    if (!empty) {
      this.slashOpen = false;
      this.slashEl?.classList.remove("is-visible");
      return;
    }
    const $pos = editor.state.doc.resolve(from);
    const textBefore = $pos.parent.textBetween(0, $pos.parentOffset, undefined, "\ufffc");
    const match = /(?:^|\s)\/([a-zA-Z0-9_-]*)$/.exec(textBefore);
    if (match) {
      const typed = match[1] || "";
      this.openSlashMenuAtCaret(typed, typed.length + 1);
    } else if (this.slashOpen) {
      this.slashOpen = false;
      this.slashEl?.classList.remove("is-visible");
    }
  }

  private renderSlashMenu(x: number, y: number): void {
    if (!this.slashEl) return;
    const left = Math.min(x, window.innerWidth - 290);
    const top = Math.min(y, window.innerHeight - 310);
    this.slashEl.style.left = `${Math.max(12, left)}px`;
    this.slashEl.style.top = `${Math.max(48, top)}px`;
    this.slashEl.innerHTML = `
      <div class="writtt-popover-header">
        ${t("Comandos Rapidos (ESC)", "Slash Commands (ESC)", "Comandos Rapidos (ESC)")}
      </div>
      ${this.slashCommands
        .map(
          (cmd, idx) => `
          <button class="writtt-popover-item ${idx === this.slashIndex ? "is-selected" : ""}" data-slash-idx="${idx}">
            <div>
              <div class="writtt-popover-label">${cmd.label}</div>
              <div class="writtt-popover-desc">${cmd.description}</div>
            </div>
            <span class="matz-badge writtt-mono writtt-badge-xs">${cmd.shortcut}</span>
          </button>`
        )
        .join("")}
    `;
    this.slashEl.classList.add("is-visible");
    this.slashEl.querySelectorAll("[data-slash-idx]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = Number((btn as HTMLElement).dataset.slashIdx || 0);
        this.applySlashCommand(this.slashCommands[idx]);
      });
    });
  }

  private applySlashCommand(cmd: SlashCommandItem | undefined): void {
    if (!cmd || !this.editor) return;
    const { from } = this.editor.state.selection;
    const len = Math.max(1, this.slashQueryLen);
    if (from >= len) {
      const tokenBefore = this.editor.state.doc.textBetween(from - len, from);
      if (tokenBefore.startsWith("/")) {
        this.editor.chain().focus().deleteRange({ from: from - len, to: from }).run();
      }
    }
    this.slashOpen = false;
    this.slashQueryLen = 1;
    this.slashEl?.classList.remove("is-visible");

    switch (cmd.id) {
      case "h1":
        this.runCommand("h1");
        break;
      case "h2":
        this.runCommand("h2");
        break;
      case "h3":
        this.runCommand("h3");
        break;
      case "task":
        this.runCommand("taskList");
        break;
      case "code":
        this.runCommand("codeBlock");
        break;
      case "callout":
      case "quote":
        this.runCommand("quote");
        break;
      case "hr":
        this.runCommand("hr");
        break;
      case "table":
        this.runCommand("table");
        break;
      case "ai":
        this.openInlineAiPopover();
        break;
      case "drawing":
        this.callbacks.onOpenDrawing();
        break;
      default:
        this.insertRawContent(cmd.snippet);
        break;
    }
  }

  private updateBubbleMenu(editor: Editor): void {
    if (!this.bubbleEl) return;
    const { from, to, empty } = editor.state.selection;
    if (empty || from === to || !editor.isEditable) {
      this.bubbleEl.classList.remove("is-visible");
      return;
    }
    const startCoords = editor.view.coordsAtPos(from);
    const endCoords = editor.view.coordsAtPos(to);
    const centerX = (startCoords.left + endCoords.right) / 2;
    const topY = Math.min(startCoords.top, endCoords.top) - 44;

    this.bubbleEl.style.left = `${Math.max(12, Math.min(centerX - 150, window.innerWidth - 330))}px`;
    this.bubbleEl.style.top = `${Math.max(46, topY)}px`;
    this.bubbleEl.classList.add("is-visible");

    const toggleActive = (fmt: string, active: boolean) => {
      const btn = this.bubbleEl?.querySelector(`[data-fmt="${fmt}"]`);
      btn?.classList.toggle("is-active", active);
    };
    toggleActive("bold", editor.isActive("bold"));
    toggleActive("italic", editor.isActive("italic"));
    toggleActive("underline", editor.isActive("underline"));
    toggleActive("strike", editor.isActive("strike"));
    toggleActive("highlight", editor.isActive("highlight"));
    toggleActive("code", editor.isActive("code"));
    toggleActive("h1", editor.isActive("heading", { level: 1 }));
    toggleActive("h2", editor.isActive("heading", { level: 2 }));
    toggleActive("quote", editor.isActive("blockquote"));
    toggleActive("link", editor.isActive("link"));
  }

  private updateTableBar(editor: Editor): void {
    if (!this.tableBarEl) return;
    this.tableBarEl.classList.toggle("is-visible", editor.isActive("table"));
  }

  private bindBubbleButtons(): void {
    this.bubbleEl?.querySelectorAll("[data-fmt]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fmt = (btn as HTMLElement).dataset.fmt || "";
        if (fmt === "inline-ai") {
          this.openInlineAiPopover();
        } else {
          this.runCommand(fmt);
        }
      });
    });
  }

  private bindTableButtons(): void {
    this.tableBarEl?.querySelectorAll("[data-tbl]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (!this.editor) return;
        const action = (btn as HTMLElement).dataset.tbl || "";
        const chain = this.editor.chain().focus() as any;
        if (typeof chain[action] === "function") {
          chain[action]().run();
        }
      });
    });
  }

  private extractWordAtCoords(clientX: number, clientY: number): string {
    if (!this.editor) return "";
    const hit = this.editor.view.posAtCoords({ left: clientX, top: clientY });
    if (!hit) return "";
    const $pos = this.editor.state.doc.resolve(hit.pos);
    const parentText = $pos.parent.textContent || "";
    const offset = $pos.parentOffset;
    if (!parentText) return "";

    const isWordChar = (ch: string) => /[\p{L}\p{N}_-]/u.test(ch);
    let start = offset;
    let end = offset;
    if (start > 0 && start === parentText.length) start--;
    if (!isWordChar(parentText[start] || "") && start > 0 && isWordChar(parentText[start - 1] || "")) {
      start--;
      end = start;
    }
    while (start > 0 && isWordChar(parentText[start - 1])) start--;
    while (end < parentText.length && isWordChar(parentText[end])) end++;
    return parentText.slice(start, end).trim();
  }

  private bindContextMenu(): void {
    this.proseEl?.addEventListener("contextmenu", (ev) => {
      if (!this.editor || !this.ctxEl) return;
      ev.preventDefault();
      const { from, to } = this.editor.state.selection;
      const sel = this.editor.state.doc.textBetween(from, to, " ").trim();
      this.ctxSelection = sel;
      const cleanFirstSelWord = (sel.split(/\s+/)[0] || "").replace(/^[^\p{L}\p{N}_-]+|[^\p{L}\p{N}_-]+$/gu, "");
      this.ctxWord = cleanFirstSelWord || this.extractWordAtCoords(ev.clientX, ev.clientY);

      const left = Math.min(ev.clientX, window.innerWidth - 280);
      const top = Math.min(ev.clientY, window.innerHeight - 210);
      this.ctxEl.style.left = `${Math.max(12, left)}px`;
      this.ctxEl.style.top = `${Math.max(48, top)}px`;

      this.ctxEl.innerHTML = `
        ${
          this.ctxWord
            ? `<button class="writtt-popover-item" data-ctx="dict">
                <span class="writtt-menu-item-left">${matzIcon("plus", 12)} ${t("Adicionar ao Dicionario", "Add to Dictionary", "Agregar al Diccionario")}: "${esc(this.ctxWord.slice(0, 18))}"</span>
              </button>`
            : ""
        }
        <button class="writtt-popover-item" data-ctx="drawing">
          <span class="writtt-menu-item-left">${matzIcon("edit", 12)} ${t("Inserir Desenho Vetorial SVG", "Insert Vector SVG Drawing", "Insertar Dibujo SVG")}</span>
        </button>
        <button class="writtt-popover-item" data-ctx="table">
          <span class="writtt-menu-item-left">${matzIcon("grid", 12)} ${t("Inserir Tabela 3x3", "Insert 3x3 Table", "Insertar Tabla 3x3")}</span>
        </button>
        <button class="writtt-popover-item" data-ctx="split">
          <span class="writtt-menu-item-left">${matzIcon("columns", 12)} ${t("Dividir em Sub-Capitulo", "Split into Sub-Chapter", "Dividir en Subcapitulo")}</span>
        </button>
        <button class="writtt-popover-item" data-ctx="ai">
          <span class="writtt-menu-item-left">${matzIcon("cpu", 12)} ${t("Revisar com IA Local", "Review with Local AI", "Revisar con IA Local")}</span>
        </button>
      `;
      this.ctxEl.classList.add("is-visible");

      this.ctxEl.querySelectorAll("[data-ctx]").forEach((btn) => {
        btn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          const act = (btn as HTMLElement).dataset.ctx;
          this.ctxEl?.classList.remove("is-visible");
          if (act === "dict" && this.ctxWord) this.callbacks.onAddDictionaryWord(this.ctxWord);
          if (act === "drawing") this.callbacks.onOpenDrawing();
          if (act === "table") this.runCommand("table");
          if (act === "split") this.callbacks.onSplitSubChapter();
          if (act === "ai") this.callbacks.onAskAI(this.ctxSelection);
        });
      });
    });
  }

  private handleGlobalKey(e: KeyboardEvent): void {
    if (e.key === "Escape" && this.isPopoverOpen()) {
      e.preventDefault();
      e.stopPropagation();
      this.closeAllPopovers();
      return;
    }
    if (!this.slashOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.slashIndex = (this.slashIndex + 1) % this.slashCommands.length;
      this.updateSlashSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.slashIndex = (this.slashIndex - 1 + this.slashCommands.length) % this.slashCommands.length;
      this.updateSlashSelection();
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      this.applySlashCommand(this.slashCommands[this.slashIndex]);
    }
  }

  private updateSlashSelection(): void {
    this.slashEl?.querySelectorAll("[data-slash-idx]").forEach((el) => {
      const idx = Number((el as HTMLElement).dataset.slashIdx || 0);
      el.classList.toggle("is-selected", idx === this.slashIndex);
    });
  }

  private handleGlobalClick(e: MouseEvent): void {
    const target = e.target as Node | null;
    if (this.slashOpen && this.slashEl && target && !this.slashEl.contains(target)) {
      this.slashOpen = false;
      this.slashEl.classList.remove("is-visible");
    }
    if (this.ctxEl?.classList.contains("is-visible") && target && !this.ctxEl.contains(target)) {
      this.ctxEl.classList.remove("is-visible");
    }
    // Keep inlineAiEl open across window/app clicks (maximize, scroll, sidebar) so AI responses are preserved.
  }

  destroy(): void {
    window.removeEventListener("keydown", this.docKeyHandler, true);
    window.removeEventListener("mousedown", this.docClickHandler);
    this.clearDiffTimers();
    if (this.windowFeedbackTimer !== null) {
      window.clearTimeout(this.windowFeedbackTimer);
      this.windowFeedbackTimer = null;
    }
    this.inlineSelectionSync = null;
    this.stageResizeObserver?.disconnect();
    this.stageResizeObserver = null;
    this.inlineAiWin?.destroy();
    this.inlineAiWin = null;
    this.editor?.destroy();
    this.editor = null;
    if (this.hostEl) {
      this.hostEl.innerHTML = "";
    }
  }
}
