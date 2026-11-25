import { matzIcon } from "@matz/ui";
import {
  AuthorshipProofDTO,
  ChapterHeading,
  DocumentStats,
  DocumentVersion,
  EditorialInspectorTab,
  EditorialPreferences,
  SearchResult,
  t,
} from "../../domain";
import { esc } from "../dom/domUtils";

export interface InspectorState {
  tab: EditorialInspectorTab;
  activeDocId: string;
  activeDocTitle: string;
  activeDocParentId: string;
  activeDocVersion: number;
  chapters: ChapterHeading[];
  stats: DocumentStats;
  prefs: EditorialPreferences;
  docs: SearchResult[];
  docVersions: DocumentVersion[];
  customDictionary: string[];
  lastProof: AuthorshipProofDTO | null;
}

export interface InspectorCallbacks {
  onSelectTab: (tab: EditorialInspectorTab) => void;
  onClose: () => void;
  onJumpChapter: (headingIdx: number, lineNum: number) => void;
  onAddSubChapter: () => void;
  onDuplicateDoc: () => void;
  onMoveParent: (parentId: string) => void;
  onAddDictWord: (word: string) => void;
  onRemoveDictWord: (word: string) => void;
  onDiffVersion: (version: number) => void;
  onRestoreVersion: (version: number) => void;
  onGenerateAuthorshipProof: () => void;
  onCopyText: (text: string, label: string) => void;
  onSelectDoc: (id: string) => void;
  onExportFormat: (fmt: "epub" | "html" | "md") => void;
  onExportPack: (passphrase: string) => void;
  onImportPack: (passphrase: string) => void;
  onUpdatePrefs: (patch: Partial<EditorialPreferences>) => void;
}

export function renderInspectorPanel(
  container: HTMLElement,
  st: InspectorState,
  cb: InspectorCallbacks
): void {
  const goalPct =
    st.prefs.wordGoal > 0 ? Math.min(100, Math.round((st.stats.words / st.prefs.wordGoal) * 100)) : 0;

  container.innerHTML = `
    <div class="writtt-inspector-head">
      <span class="writtt-section-kicker">
        ${t("Painel Editorial", "Editorial Panel", "Panel Editorial")}
      </span>
      <button class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-insp-close title="ESC">${matzIcon("close", 12)}</button>
    </div>

    <div class="writtt-inspector-tabs is-three-tabs">
      <button class="writtt-insp-tab ${st.tab === "outline" ? "is-active" : ""}" data-itab="outline">
        ${matzIcon("layers", 11)} <span>${t("Sumario", "Outline", "Indice")}</span>
      </button>
      <button class="writtt-insp-tab ${st.tab === "history" ? "is-active" : ""}" data-itab="history">
        ${matzIcon("git-commit", 11)} <span>${t("Versoes", "History", "Historial")}</span>
      </button>
      <button class="writtt-insp-tab ${st.tab === "export" ? "is-active" : ""}" data-itab="export">
        ${matzIcon("download", 11)} <span>${t("Exportar", "Export", "Exportar")}</span>
      </button>
    </div>

    <div class="writtt-inspector-body">
      ${
        st.tab === "outline"
          ? renderOutlineTab(st, goalPct)
          : st.tab === "history"
          ? renderHistoryTab(st)
          : renderExportTab()
      }
    </div>
  `;

  container.querySelector("[data-insp-close]")?.addEventListener("click", cb.onClose);
  container.querySelectorAll("[data-itab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cb.onSelectTab(((btn as HTMLElement).dataset.itab as EditorialInspectorTab) || "outline");
    });
  });

  // Outline bindings
  container.querySelectorAll("[data-jump-idx]").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number((el as HTMLElement).dataset.jumpIdx || 0);
      const line = Number((el as HTMLElement).dataset.jumpLine || 1);
      cb.onJumpChapter(idx, line);
    });
  });
  container.querySelectorAll("[data-pref]").forEach((el) => {
    el.addEventListener("change", () => {
      const key = (el as HTMLElement).dataset.pref as keyof EditorialPreferences;
      if (key === "focusMode") cb.onUpdatePrefs({ focusMode: (el as HTMLInputElement).checked });
      else if (key === "fontSize") cb.onUpdatePrefs({ fontSize: Number((el as HTMLInputElement).value) });
      else if (key === "fontFamily") cb.onUpdatePrefs({ fontFamily: (el as HTMLSelectElement).value as any });
      else if (key === "pageWidth") cb.onUpdatePrefs({ pageWidth: (el as HTMLSelectElement).value as any });
    });
  });
  container.querySelector("#insp-apply-parent")?.addEventListener("click", () => {
    const val = (container.querySelector("#insp-move-parent") as HTMLSelectElement | null)?.value || "";
    cb.onMoveParent(val);
  });
  container.querySelector("#insp-add-subchapter")?.addEventListener("click", cb.onAddSubChapter);
  container.querySelector("#insp-dup-doc")?.addEventListener("click", cb.onDuplicateDoc);
  container.querySelectorAll("[data-open-subdoc]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = (el as HTMLElement).dataset.openSubdoc;
      if (id) cb.onSelectDoc(id);
    });
  });
  container.querySelector("#insp-dict-add")?.addEventListener("click", () => {
    const val = (container.querySelector("#insp-dict-input") as HTMLInputElement | null)?.value || "";
    if (val.trim()) cb.onAddDictWord(val.trim());
  });
  container.querySelectorAll("[data-rm-dict]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = (btn as HTMLElement).dataset.rmDict || "";
      if (w) cb.onRemoveDictWord(w);
    });
  });

  // History bindings
  container.querySelector("#insp-gen-proof")?.addEventListener("click", cb.onGenerateAuthorshipProof);
  container.querySelector("#insp-copy-proof")?.addEventListener("click", () => {
    if (st.lastProof) cb.onCopyText(st.lastProof.certificateText, "Authorship Certificate");
  });
  container.querySelectorAll("[data-diff-v]").forEach((btn) => {
    btn.addEventListener("click", () => cb.onDiffVersion(Number((btn as HTMLElement).dataset.diffV || 1)));
  });
  container.querySelectorAll("[data-restore-v]").forEach((btn) => {
    btn.addEventListener("click", () => cb.onRestoreVersion(Number((btn as HTMLElement).dataset.restoreV || 1)));
  });

  // Export bindings
  container.querySelectorAll("[data-exp-fmt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fmt = ((btn as HTMLElement).dataset.expFmt as "epub" | "html" | "md") || "md";
      cb.onExportFormat(fmt);
    });
  });
  container.querySelector("#insp-pack-export")?.addEventListener("click", () => {
    const pass = (container.querySelector("#insp-pack-pass") as HTMLInputElement | null)?.value || "";
    cb.onExportPack(pass);
  });
  container.querySelector("#insp-pack-import")?.addEventListener("click", () => {
    const pass = (container.querySelector("#insp-pack-pass") as HTMLInputElement | null)?.value || "";
    cb.onImportPack(pass);
  });
}

function renderOutlineTab(st: InspectorState, goalPct: number): string {
  return `
    <div class="writtt-card">
      <div class="writtt-card-title">
        <span>${t("Capitulos (H1/H2/H3)", "Chapters (H1/H2/H3)", "Capitulos (H1/H2/H3)")}</span>
        <span class="writtt-mono">${st.chapters.length}</span>
      </div>
      ${
        st.chapters.length === 0
          ? `<div class="writtt-help-note">${t("Adicione titulos H1, H2 ou H3 para navegar pelos capitulos.", "Add H1, H2 or H3 headings to navigate chapters.", "Agrega encabezados H1, H2 o H3.")}</div>`
          : st.chapters
              .map(
                (ch, idx) => `
                <div class="writtt-outline-item" data-jump-idx="${idx}" data-jump-line="${ch.line}" style="margin-left:${(ch.level - 1) * 10}px;">
                  <span class="writtt-outline-text ${ch.level === 1 ? "is-h1" : ""}">
                    <span class="writtt-mono writtt-accent-tag">H${ch.level}</span> ${esc(ch.text)}
                  </span>
                  <span class="writtt-mono writtt-help-note">${ch.wordCount}w</span>
                </div>`
              )
              .join("")
      }
    </div>

    <div class="writtt-card">
      <div class="writtt-card-title">
        <span>${t("Meta & Tipografia", "Writing Goal & Typography", "Meta y Tipografia")}</span>
        <span class="writtt-mono">${st.stats.words} / ${st.prefs.wordGoal || 1000}w</span>
      </div>
      <div class="writtt-progress-track">
        <div class="writtt-progress-bar" style="width:${goalPct}%;"></div>
      </div>
      <div class="writtt-grid-2 writtt-mb-xs">
        <select class="matz-select writtt-input-sm" data-pref="fontFamily">
          <option value="serif" ${st.prefs.fontFamily === "serif" ? "selected" : ""}>Serif (Editorial)</option>
          <option value="sans" ${st.prefs.fontFamily === "sans" ? "selected" : ""}>Sans (Modern)</option>
          <option value="mono" ${st.prefs.fontFamily === "mono" ? "selected" : ""}>Mono (Technical)</option>
        </select>
        <select class="matz-select writtt-input-sm" data-pref="pageWidth">
          <option value="focused" ${st.prefs.pageWidth === "focused" ? "selected" : ""}>${t("Focado (660px)", "Focused (660px)", "Enfocado")}</option>
          <option value="comfortable" ${st.prefs.pageWidth === "comfortable" ? "selected" : ""}>${t("Confortavel (780px)", "Comfortable (780px)", "Comodo")}</option>
          <option value="wide" ${st.prefs.pageWidth === "wide" ? "selected" : ""}>${t("Amplo (1060px)", "Wide (1060px)", "Amplio")}</option>
        </select>
      </div>
      <div class="writtt-sidebar-row writtt-mb-xs">
        <span class="writtt-help-note">${t("Tamanho", "Font Size", "Tamano")}: <b class="writtt-mono">${st.prefs.fontSize}px</b></span>
        <input type="range" data-pref="fontSize" min="14" max="20" value="${st.prefs.fontSize}" class="writtt-range-sm" />
      </div>
      <label class="writtt-check-label">
        <input type="checkbox" data-pref="focusMode" ${st.prefs.focusMode ? "checked" : ""} />
        <span>${t("Modo Foco de Paragrafo", "Paragraph Focus Mode", "Modo Enfoque")}</span>
      </label>
    </div>

    <div class="writtt-card">
      <div class="writtt-card-title">
        <span>${t("Subcapitulos & Copias desta Obra", "Sub-Chapters & Work Copies", "Subcapitulos y Copias")}</span>
        <span class="writtt-mono">${st.docs.filter((d) => d.parent_id === st.activeDocId).length}</span>
      </div>
      <div class="writtt-help-note writtt-mb-xs">
        ${t(
          "Subcapitulo cria uma nova parte em branco dentro desta obra. Criar Copia gera um documento independente com todo o texto atual.",
          "Sub-Chapter adds a new blank section inside this work. Make Copy creates a standalone duplicate of the full text.",
          "Subcapitulo crea una nueva parte en blanco. Crear Copia duplica todo el documento de forma independiente."
        )}
      </div>
      <div class="writtt-grid-2 writtt-mb-xs">
        <button class="matz-btn matz-btn-primary writtt-btn-xs" id="insp-add-subchapter">
          ${matzIcon("plus", 11)} <span>${t("Subcapitulo", "Sub-Chapter", "Subcapitulo")}</span>
        </button>
        <button class="writtt-btn writtt-btn-xs" id="insp-dup-doc">
          ${matzIcon("copy", 11)} <span>${t("Criar Copia", "Make Copy", "Crear Copia")}</span>
        </button>
      </div>
      ${st.docs
        .filter((d) => d.parent_id === st.activeDocId)
        .map(
          (sub) => `
          <div class="writtt-outline-item" data-open-subdoc="${esc(sub.id)}">
            <span class="writtt-outline-text">${matzIcon("file-text", 11)} ${esc(sub.title)}</span>
            <span class="writtt-mono writtt-help-note">SUB</span>
          </div>`
        )
        .join("")}
    </div>

    <div class="writtt-card">
      <div class="writtt-card-title"><span>${t("Hierarquia (Obra Principal)", "Hierarchy (Parent Work)", "Jerarquia")}</span></div>
      <div class="writtt-inline-form">
        <select class="matz-select writtt-input-sm" id="insp-move-parent">
          <option value="">${t("(Raiz - Obra Principal)", "(Root - Main Work)", "(Raiz - Obra Principal)")}</option>
          ${st.docs
            .filter((d) => d.id !== st.activeDocId)
            .map((d) => `<option value="${esc(d.id)}" ${st.activeDocParentId === d.id ? "selected" : ""}>${esc(d.title)}</option>`)
            .join("")}
        </select>
        <button class="writtt-btn" id="insp-apply-parent">${t("Mover", "Move", "Mover")}</button>
      </div>
    </div>

    <div class="writtt-card">
      <div class="writtt-card-title"><span>${t("Dicionario Personalizado", "Custom Dictionary", "Diccionario")}</span></div>
      <div class="writtt-inline-form writtt-mb-xs">
        <input class="matz-input writtt-input-sm" id="insp-dict-input" placeholder="${t("Termo ou nome proprio...", "Term or proper noun...", "Termino...")}" />
        <button class="writtt-btn" id="insp-dict-add">${matzIcon("plus", 11)}</button>
      </div>
      <div class="writtt-chip-row">
        ${st.customDictionary
          .map(
            (w) => `<span class="matz-badge writtt-mono writtt-dict-chip">
              ${esc(w)}
              <button data-rm-dict="${esc(w)}" class="writtt-chip-rm">x</button>
            </span>`
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderHistoryTab(st: InspectorState): string {
  return `
    <div class="writtt-card">
      <div class="writtt-card-title">
        <span>${t("Prova Criptografica de Autoria", "Cryptographic Authorship Proof", "Prueba de Autoria")}</span>
        ${matzIcon("shield", 12)}
      </div>
      <div class="writtt-help-note writtt-mb-xs">
        ${t(
          "Gere um recibo SHA-256 com carimbo UTC ancorado na cadeia forense para comprovar a existencia da obra antes da publicacao.",
          "Generate a UTC-timestamped SHA-256 receipt anchored in the forensic chain to prove pre-publication authorship.",
          "Genera un recibo SHA-256 con sello UTC para demostrar la autoria antes de publicar."
        )}
      </div>
      <button class="matz-btn matz-btn-primary writtt-full-btn" id="insp-gen-proof">
        ${matzIcon("shield", 12)} <span>${t("Emitir Certificado SHA-256", "Issue SHA-256 Certificate", "Emitir Certificado SHA-256")}</span>
      </button>
      ${
        st.lastProof && st.lastProof.docId === st.activeDocId
          ? `<div class="writtt-mt-xs">
              <pre class="writtt-mono writtt-code-box">${esc(st.lastProof.certificateText)}</pre>
              <button class="writtt-btn writtt-full-btn" id="insp-copy-proof">${matzIcon("copy", 11)} <span>${t("Copiar Certificado", "Copy Certificate", "Copiar Certificado")}</span></button>
            </div>`
          : ""
      }
    </div>

    <div class="writtt-card">
      <div class="writtt-card-title">
        <span>${t("Snapshots de Versao", "Version Snapshots", "Instantaneas")}</span>
        <span class="writtt-mono">${st.docVersions.length}</span>
      </div>
      ${
        st.docVersions.length === 0
          ? `<div class="writtt-help-note">${t("Pressione Ctrl+S para registrar um snapshot imutavel.", "Press Ctrl+S to record an immutable snapshot.", "Presiona Ctrl+S para guardar una version.")}</div>`
          : st.docVersions
              .slice()
              .reverse()
              .map(
                (v) => `
                <div class="writtt-subcard">
                  <div class="writtt-sidebar-row">
                    <span class="writtt-mono writtt-accent-tag">v${v.version}</span>
                    <span class="writtt-mono writtt-help-note">${esc(v.createdAt)}</span>
                  </div>
                  <div class="writtt-subcard-title">${esc(v.title)}</div>
                  <div class="writtt-inline-form">
                    <button class="writtt-btn writtt-flex-1" data-diff-v="${v.version}">${matzIcon("git-commit", 11)} <span>Diff</span></button>
                    <button class="writtt-btn" data-restore-v="${v.version}">${matzIcon("refresh", 11)} <span>${t("Restaurar", "Restore", "Restaurar")}</span></button>
                  </div>
                </div>`
              )
              .join("")
      }
    </div>
  `;
}

function renderExportTab(): string {
  return `
    <div class="writtt-card">
      <div class="writtt-card-title"><span>${t("Publicar & Exportar Obra", "Publish & Export Manuscript", "Publicar y Exportar")}</span></div>
      <div class="writtt-help-note writtt-mb-xs">
        ${t("Usa dialogos nativos do sistema operacional (Wails v3) para salvar sua obra pronta para publicacao.", "Uses native OS save dialogs (Wails v3) to export your publication-ready manuscript.", "Usa dialogos nativos del sistema (Wails v3).")}
      </div>
      <div class="writtt-stack-sm">
        <button class="writtt-btn writtt-export-row" data-exp-fmt="epub">
          <span class="writtt-row-gap-xs">${matzIcon("bookmark", 13)} <b>EPUB 3.0 (.epub)</b></span>
          <span class="writtt-mono writtt-help-note">Kindle / Kobo</span>
        </button>
        <button class="writtt-btn writtt-export-row" data-exp-fmt="html">
          <span class="writtt-row-gap-xs">${matzIcon("globe", 13)} <b>HTML5 (.html)</b></span>
          <span class="writtt-mono writtt-help-note">Web / Print</span>
        </button>
        <button class="writtt-btn writtt-export-row" data-exp-fmt="md">
          <span class="writtt-row-gap-xs">${matzIcon("file-text", 13)} <b>Markdown (.md)</b></span>
          <span class="writtt-mono writtt-help-note">Portable</span>
        </button>
      </div>
    </div>

    <div class="writtt-card">
      <div class="writtt-card-title"><span>${t("Backup Criptografado (.writttpack)", "Encrypted Vault Archive (.writttpack)", "Respaldo Cifrado (.writttpack)")}</span></div>
      <input type="password" class="matz-input writtt-input-sm writtt-mb-xs" id="insp-pack-pass" placeholder="${t("Frase-senha para selar/abrir pacote...", "Passphrase to seal/open archive...", "Frase de contrasena...")}" />
      <div class="writtt-grid-2">
        <button class="matz-btn matz-btn-primary writtt-btn-sm" id="insp-pack-export">
          ${matzIcon("download", 11)} <span>${t("Exportar", "Export", "Exportar")}</span>
        </button>
        <button class="writtt-btn writtt-btn-sm" id="insp-pack-import">
          ${matzIcon("upload", 11)} <span>${t("Importar", "Import", "Importar")}</span>
        </button>
      </div>
    </div>
  `;
}
