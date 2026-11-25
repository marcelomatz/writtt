import { matzIcon } from "@matz/ui";
import { buildDocumentTree, flattenDocumentTree, SearchResult, t } from "../../domain";
import { esc } from "../dom/domUtils";

export interface EditorSidebarProps {
  visible: boolean;
  sidebarOpen: boolean;
  docs: SearchResult[];
  activeDocId: string;
  searchQuery: string;
  onToggleSidebar: (open: boolean) => void;
  onNewDocument: () => void;
  onAddSubChapter?: (parentId: string) => void;
  onDuplicateDocument?: (sourceId: string) => void;
  onSearchChange: (query: string) => void;
  onSelectDocument: (id: string) => void;
}

export function renderEditorSidebar(
  sidebarEl: HTMLElement,
  resizerEl: HTMLElement,
  props: EditorSidebarProps
): void {
  const { visible, sidebarOpen, docs, activeDocId, searchQuery } = props;

  sidebarEl.classList.toggle("is-hidden", !visible);
  sidebarEl.classList.toggle("is-collapsed", visible && !sidebarOpen);
  resizerEl.classList.toggle("is-hidden", !visible || !sidebarOpen);
  if (!visible) return;

  if (!sidebarOpen) {
    sidebarEl.innerHTML = `
      <div class="writtt-sidebar-rail">
        <button class="writtt-btn writtt-btn-ghost writtt-icon-btn" id="sb-collapse-btn" title="${t("Expandir Barra Lateral (Ctrl+\\)", "Expand Sidebar (Ctrl+\\)", "Expandir Barra Lateral")}">
          ${matzIcon("sidebar", 14)}
        </button>
        <button class="writtt-btn writtt-btn-ghost writtt-icon-btn" id="sb-new" title="${t("Novo Manuscrito (Ctrl+N)", "New Manuscript (Ctrl+N)", "Nuevo Manuscrito")}">
          ${matzIcon("plus", 14)}
        </button>
      </div>
    `;
    sidebarEl.querySelector("#sb-collapse-btn")?.addEventListener("click", () => props.onToggleSidebar(true));
    sidebarEl.querySelector("#sb-new")?.addEventListener("click", props.onNewDocument);
    return;
  }

  const flatTree = flattenDocumentTree(buildDocumentTree(docs));

  sidebarEl.innerHTML = `
    <div class="writtt-sidebar-head">
      <div class="writtt-sidebar-row">
        <span class="writtt-section-kicker">${t("Obras", "Works", "Obras")}</span>
        <div class="writtt-row-gap-xs">
          <button class="matz-btn matz-btn-primary writtt-btn-sm" id="sb-new" title="Ctrl+N">
            ${matzIcon("plus", 11)} <span>${t("Novo", "New", "Nuevo")}</span>
          </button>
          <button class="writtt-btn writtt-btn-ghost writtt-icon-btn-sm" id="sb-collapse-btn" title="${t("Recolher Barra Lateral (Ctrl+\\)", "Collapse Sidebar (Ctrl+\\)", "Colapsar")}">
            ${matzIcon("sidebar", 13)}
          </button>
        </div>
      </div>
      <input class="matz-input writtt-input-sm" id="sb-search" placeholder="${t("Filtrar manuscritos...", "Filter manuscripts...", "Filtrar...")}" value="${esc(searchQuery)}" />
    </div>

    <div class="writtt-sidebar-scroll">
      ${flatTree
        .map(({ doc: d, depth }) => {
          const isActive = activeDocId === d.id;
          const indent = Math.min(depth * 14, 42);
          return `
            <div class="writtt-tree-item ${isActive ? "is-active" : ""}" data-sb-doc="${esc(d.id)}" style="margin-left:${indent}px;">
              <div class="writtt-sidebar-row">
                <span class="writtt-tree-title">
                  ${depth > 0 ? `<span class="writtt-mono writtt-tree-branch">|-</span>` : ""}
                  ${esc(d.title || "Untitled")}
                </span>
                <span class="writtt-row-gap-xs writtt-tree-actions">
                  ${d.is_vault ? `<span class="writtt-vault-icon">${matzIcon("lock", 11)}</span>` : ""}
                  <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs writtt-tree-act-btn" data-sb-sub="${esc(d.id)}" title="${t("Adicionar novo subcapitulo em branco a esta obra", "Add new blank sub-chapter to this work", "Agregar subcapitulo en blanco")}">
                    ${matzIcon("plus", 10)}
                  </button>
                  <button type="button" class="writtt-btn writtt-btn-ghost writtt-icon-btn-xs writtt-tree-act-btn" data-sb-dup="${esc(d.id)}" title="${t("Criar copia independente desta obra", "Create standalone copy of this work", "Crear copia independiente")}">
                    ${matzIcon("copy", 10)}
                  </button>
                </span>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  sidebarEl.querySelector("#sb-collapse-btn")?.addEventListener("click", () => props.onToggleSidebar(false));
  sidebarEl.querySelector("#sb-new")?.addEventListener("click", props.onNewDocument);
  const searchInput = sidebarEl.querySelector("#sb-search") as HTMLInputElement | null;
  searchInput?.addEventListener("input", () => props.onSearchChange(searchInput.value));
  sidebarEl.querySelectorAll("[data-sb-doc]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.sbDoc;
      if (id) props.onSelectDocument(id);
    });
  });
  sidebarEl.querySelectorAll("[data-sb-sub]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.sbSub;
      if (id) props.onAddSubChapter?.(id);
    });
  });
  sidebarEl.querySelectorAll("[data-sb-dup]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.sbDup;
      if (id) props.onDuplicateDocument?.(id);
    });
  });
}
