import { matzIcon } from "@matz/ui";
import { AppViewMode, EditorViewMode, SecurityConfigDTO, t } from "../../domain";

export interface TopMenuBarState {
  activeView: AppViewMode;
  hasActiveDoc: boolean;
  isSubChapter: boolean;
  editorMode: EditorViewMode;
  sidebarOpen: boolean;
  formatBarOpen: boolean;
  zenMode: boolean;
  focusMode: boolean;
  localAiOnline: boolean;
  aiModelCount: number;
  securityCfg: SecurityConfigDTO;
}

export interface TopMenuBarCallbacks {
  onNavigate: (view: AppViewMode) => void;
  onAction: (actionId: string) => void;
}

interface MenuEntry {
  divider?: boolean;
  id?: string;
  label?: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
}

interface MenuGroup {
  id: string;
  label: string;
  items: MenuEntry[];
}

export class TopMenuBar {
  private container: HTMLElement | null = null;
  private openGroupId: string | null = null;
  private state: TopMenuBarState | null = null;
  private cb: TopMenuBarCallbacks;

  private onDocClick = (e: MouseEvent) => {
    if (!this.openGroupId || !this.container) return;
    if (!this.container.contains(e.target as Node)) {
      this.openGroupId = null;
      this.renderDropdown();
    }
  };

  private onDocKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.openGroupId) {
      e.preventDefault();
      this.openGroupId = null;
      this.renderDropdown();
    }
  };

  constructor(cb: TopMenuBarCallbacks) {
    this.cb = cb;
    window.addEventListener("mousedown", this.onDocClick);
    window.addEventListener("keydown", this.onDocKey);
  }

  private buildMenus(st: TopMenuBarState): MenuGroup[] {
    const inEditor = st.activeView === "editor" && st.hasActiveDoc;
    return [
      {
        id: "file",
        label: t("Arquivo", "File", "Archivo"),
        items: [
          { id: "new-doc", label: t("Novo Manuscrito", "New Manuscript", "Nuevo Manuscrito"), icon: "plus", shortcut: "Ctrl+N" },
          { id: "new-vault-doc", label: t("Novo Manuscrito no Cofre E2EE", "New Sealed Vault Doc", "Nuevo en Boveda E2EE"), icon: "lock" },
          { id: "duplicate-doc", label: t("Criar Copia Independente da Obra", "Make Standalone Copy of Work", "Crear Copia Independiente"), icon: "copy", disabled: !inEditor },
          { id: "split-sub", label: t("Adicionar Novo Subcapitulo em Branco", "Add New Blank Sub-Chapter", "Agregar Subcapitulo en Blanco"), icon: "layers", disabled: !inEditor },
          { id: "import-doc", label: t("Importar .md / .txt do Disco...", "Import .md / .txt from Disk...", "Importar .md / .txt..."), icon: "upload" },
          { divider: true },
          { id: "save-snapshot", label: t("Salvar Snapshot de Versao", "Save Version Snapshot", "Guardar Version"), icon: "check", shortcut: "Ctrl+S", disabled: !inEditor },
          { id: "export-epub", label: t("Exportar como EPUB 3.0 (.epub)...", "Export as EPUB 3.0 (.epub)...", "Exportar EPUB 3.0..."), icon: "bookmark", disabled: !inEditor },
          { id: "export-html", label: t("Exportar como HTML5 (.html)...", "Export as HTML5 (.html)...", "Exportar HTML5..."), icon: "globe", disabled: !inEditor },
          { id: "export-md", label: t("Exportar como Markdown (.md)...", "Export as Markdown (.md)...", "Exportar Markdown..."), icon: "file-text", disabled: !inEditor },
          { divider: true },
          { id: "open-drive-backups", label: t("Backup & Restauracao (.writttpack)...", "Encrypted Backup (.writttpack)...", "Respaldo (.writttpack)..."), icon: "hard-drive" },
          { divider: true },
          { id: "go-home", label: t("Voltar para Tela Inicial", "Back to Home Library", "Volver al Inicio"), icon: "home" },
        ],
      },
      {
        id: "edit",
        label: t("Editar", "Edit", "Editar"),
        items: [
          { id: "cmd-undo", label: t("Desfazer", "Undo", "Deshacer"), icon: "refresh", shortcut: "Ctrl+Z", disabled: !inEditor },
          { id: "cmd-redo", label: t("Refazer", "Redo", "Rehacer"), icon: "refresh", shortcut: "Ctrl+Y", disabled: !inEditor },
          { divider: true },
          { id: "open-slash", label: t("Comandos Rapidos (/ Slash)", "Slash Commands (/)", "Comandos Rapidos (/)"), icon: "terminal", shortcut: "/", disabled: !inEditor },
          { id: "cmd-table", label: t("Inserir Tabela 3x3", "Insert 3x3 Table", "Insertar Tabla 3x3"), icon: "grid", disabled: !inEditor },
          { id: "cmd-taskList", label: t("Inserir Lista de Tarefas", "Insert Task Checklist", "Insertar Lista de Tareas"), icon: "check-circle", disabled: !inEditor },
          { id: "cmd-codeBlock", label: t("Inserir Bloco de Codigo", "Insert Code Block", "Insertar Bloque de Codigo"), icon: "code", disabled: !inEditor },
          { id: "open-drawing", label: t("Inserir Desenho Vetorial SVG", "Insert Vector SVG Drawing", "Insertar Dibujo SVG"), icon: "feather", disabled: !inEditor },
          { divider: true },
          { id: "split-sub", label: t("Adicionar Novo Subcapitulo na Obra", "Add New Sub-Chapter to Work", "Agregar Subcapitulo"), icon: "plus", disabled: !inEditor },
          { id: "duplicate-doc", label: t("Criar Copia Independente da Obra", "Make Standalone Copy of Work", "Crear Copia Independiente"), icon: "copy", disabled: !inEditor },
          { id: "merge-parent", label: t("Incorporar Subcapitulo na Obra Principal", "Append Sub-Chapter to Parent Work", "Incorporar a Obra Principal"), icon: "git-merge", disabled: !(inEditor && st.isSubChapter) },
          { divider: true },
          { id: "open-dictionary", label: t("Gerenciar Dicionario Pessoal...", "Manage Custom Dictionary...", "Diccionario Personal..."), icon: "bookmark" },
        ],
      },
      {
        id: "view",
        label: t("Exibir", "View", "Ver"),
        items: [
          { id: "toggle-sidebar", label: t("Barra Lateral do Editor", "Editor Document Tree", "Barra Lateral"), icon: "sidebar", shortcut: "Ctrl+\\", checked: st.sidebarOpen, disabled: !inEditor },
          { id: "toggle-fmt-bar", label: t("Barra de Formatacao", "Formatting Toolbar", "Barra de Formato"), icon: "feather", checked: st.formatBarOpen, disabled: !inEditor },
          { divider: true },
          { id: "mode-rich", label: t("Modo Editor Rico (WYSIWYG)", "Rich Text Mode (WYSIWYG)", "Modo Editor Rico"), icon: "edit", checked: st.editorMode === "rich", disabled: !inEditor },
          { id: "mode-markdown", label: t("Modo Codigo Markdown", "Markdown Source Mode", "Modo Markdown"), icon: "code", checked: st.editorMode === "markdown", disabled: !inEditor },
          { id: "mode-dual", label: t("Modo Dual (Pai e Sub-Capitulo)", "Dual Mode (Parent & Child)", "Modo Dual"), icon: "columns", checked: st.editorMode === "dual", disabled: !(inEditor && st.isSubChapter) },
          { divider: true },
          { id: "toggle-zen", label: t("Modo Zen (Sem Distracoes)", "Zen Distraction-Free Mode", "Modo Zen"), icon: "eye", shortcut: "Alt+Z", checked: st.zenMode, disabled: !inEditor },
          { id: "toggle-focus", label: t("Modo Foco de Paragrafo", "Paragraph Focus Mode", "Modo Enfoque"), icon: "eye", checked: st.focusMode, disabled: !inEditor },
          { divider: true },
          { id: "insp-outline", label: t("Painel: Sumario & Capitulos", "Panel: Chapters & Outline", "Panel: Capitulos"), icon: "layers", disabled: !inEditor },
          { id: "insp-history", label: t("Painel: Historico, Diff & Autoria", "Panel: History, Diff & Proof", "Panel: Historial y Diff"), icon: "git-commit", disabled: !inEditor },
          { id: "insp-export", label: t("Painel: Publicar & Exportar", "Panel: Publish & Export", "Panel: Exportar"), icon: "download", disabled: !inEditor },
          { divider: true },
          { id: "open-ai-direct", label: t("Estudio IA & RAG (Chatbot / Editor IA)", "AI & RAG Studio (Chatbot / Editorial)", "Estudio IA y RAG"), icon: "sparkles" },
          { id: "open-ai-os-window", label: t("Destacar IA em Nova Janela (2o Monitor)", "Detach AI in New Window (2nd Monitor)", "Destacar IA en Nueva Ventana"), icon: "external" },
        ],
      },
      {
        id: "vault",
        label: t("Cofre", "Vault", "Boveda"),
        items: [
          {
            id: "lock-app",
            label: t("Bloquear Aplicacao & Zerar Chaves", "Lock App & Zeroize RAM Keys", "Bloquear Aplicacion"),
            icon: "lock",
            shortcut: "Ctrl+L",
            disabled: !st.securityCfg.password_enabled,
          },
          { id: "toggle-doc-vault", label: t("Selar / Desproteger Obra Atual", "Seal / Unseal Current Manuscript", "Sellar / Desproteger Obra"), icon: "shield", disabled: !inEditor },
          { id: "issue-proof", label: t("Emitir Certificado SHA-256 de Autoria", "Issue SHA-256 Authorship Certificate", "Emitir Certificado SHA-256"), icon: "shield", disabled: !inEditor },
          { divider: true },
          { id: "settings-security", label: t("Senha Mestra, PIN, Recovery Key & 2FA...", "Master Password, PIN, Recovery & 2FA...", "Seguridad y 2FA..."), icon: "key" },
          { id: "settings-drive", label: t("Cofre de Arquivos (Drive E2EE)...", "Encrypted File Vault (E2EE Drive)...", "Archivos E2EE..."), icon: "hard-drive" },
          { id: "settings-express", label: t("Writtt Express (Envelopes RSA-2048)...", "Writtt Express (RSA-2048 Envelopes)...", "Writtt Express (RSA)..."), icon: "send" },
          { id: "settings-audit", label: t("Dispositivos & Auditoria Forense...", "Trusted Devices & Forensic Audit...", "Auditoria Forense..."), icon: "terminal" },
        ],
      },
      {
        id: "tools",
        label: t("Ferramentas", "Tools", "Herramientas"),
        items: [
          { id: "open-palette", label: t("Paleta de Comandos", "Command Palette", "Paleta de Comandos"), icon: "search", shortcut: "Ctrl+K" },
          { id: "open-ai-direct", label: t("Estudio IA & RAG (Chatbot / Editor IA)", "AI & RAG Studio (Chatbot / Editorial)", "Estudio IA y RAG"), icon: "sparkles" },
          { id: "open-ai-os-window", label: t("Abrir IA em Nova Janela (2o Monitor)", "Open AI in New Window (2nd Monitor)", "Abrir IA en Nueva Ventana"), icon: "external" },
          { id: "settings-appearance", label: t("Configuracoes & Tipografia", "Settings & Typography", "Configuracion"), icon: "sliders", shortcut: "Ctrl+," },
        ],
      },
      {
        id: "help",
        label: t("Ajuda", "Help", "Ayuda"),
        items: [
          { id: "help-overview", label: t("1. Por que o Writtt Existe", "1. Why Writtt Exists", "1. Por que Existe Writtt"), icon: "home", shortcut: "F1" },
          { id: "help-editor", label: t("2. Editor, Barra / & Desenhos", "2. Editor, Slash / & Drawings", "2. Editor y Dibujos"), icon: "feather" },
          { id: "help-chapters", label: t("3. Capitulos, Rascunhos & Versoes", "3. Chapters, Drafts & Versions", "3. Capitulos y Versiones"), icon: "columns" },
          { id: "help-vault", label: t("4. Cofre, Senha, PIN & Provas", "4. Vault, Password, PIN & Proofs", "4. Boveda, PIN y Autoria"), icon: "shield-check" },
          { id: "help-ai", label: t("5. IA Local Privada & Memoria", "5. Private Local AI & Memory", "5. IA Local Privada"), icon: "brain" },
          { id: "help-publish", label: t("6. E-books, Arquivos & Backups", "6. E-books, Files & Backups", "6. E-books y Respaldos"), icon: "archive" },
          { divider: true },
          { id: "help-shortcuts", label: t("7. Atalhos de Teclado", "7. Keyboard Shortcuts", "7. Atajos de Teclado"), icon: "keyboard" },
        ],
      },
    ];
  }

  render(container: HTMLElement, state: TopMenuBarState): void {
    this.container = container;
    this.state = state;
    const menus = this.buildMenus(state);

    container.innerHTML = `
      <div class="writtt-menubar">
        <div class="writtt-menubar-left">
          ${menus
            .map(
              (m) => `
              <div class="writtt-menu-anchor">
                <button class="writtt-menu-trigger ${this.openGroupId === m.id ? "is-open" : ""}" data-mgroup="${m.id}">
                  ${m.label}
                </button>
              </div>`
            )
            .join("")}
        </div>

        <div class="writtt-menubar-actions">
          <button class="writtt-btn writtt-btn-ghost writtt-btn-compact" id="mb-ai-btn" title="${
            state.localAiOnline
              ? t("Assistente IA Local conectado ao Ollama", "Local AI Assistant connected to Ollama", "IA Local conectada a Ollama")
              : t("Ollama offline - clique para abrir painel de IA e reconectar", "Ollama offline - click to open AI panel", "Ollama desconectado")
          }">
            <span class="writtt-status-dot ${state.localAiOnline ? "is-online" : "is-offline"}"></span>
            ${matzIcon("cpu", 12)}
            <span>${t("IA Local", "Local AI", "IA Local")}</span>
          </button>
          <button class="writtt-btn writtt-btn-ghost writtt-btn-compact" id="mb-cmd-btn" title="Ctrl+K">
            ${matzIcon("search", 11)} <span class="writtt-mono">Ctrl+K</span>
          </button>
        </div>
      </div>
      <div class="writtt-menu-dropdown-host" id="writtt-menu-dropdown-host"></div>
    `;

    container.querySelectorAll("[data-mgroup]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.mgroup || "";
        this.openGroupId = this.openGroupId === id ? null : id;
        this.renderDropdown();
      });
      btn.addEventListener("mouseenter", () => {
        if (!this.openGroupId) return;
        const id = (btn as HTMLElement).dataset.mgroup || "";
        if (id && id !== this.openGroupId) {
          this.openGroupId = id;
          this.renderDropdown();
        }
      });
    });

    container.querySelector("#mb-ai-btn")?.addEventListener("click", () => {
      this.openGroupId = null;
      this.renderDropdown();
      this.cb.onAction("open-ai-direct");
    });
    container.querySelector("#mb-cmd-btn")?.addEventListener("click", () => {
      this.openGroupId = null;
      this.renderDropdown();
      this.cb.onAction("open-palette");
    });

    this.renderDropdown();
  }

  private renderDropdown(): void {
    if (!this.container || !this.state) return;
    const host = this.container.querySelector("#writtt-menu-dropdown-host") as HTMLElement | null;
    if (!host) return;

    this.container.querySelectorAll("[data-mgroup]").forEach((btn) => {
      btn.classList.toggle("is-open", (btn as HTMLElement).dataset.mgroup === this.openGroupId);
    });

    if (!this.openGroupId) {
      host.innerHTML = "";
      return;
    }

    const menus = this.buildMenus(this.state);
    const group = menus.find((m) => m.id === this.openGroupId);
    const trigger = this.container.querySelector(`[data-mgroup="${this.openGroupId}"]`) as HTMLElement | null;
    if (!group || !trigger) {
      host.innerHTML = "";
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 290);

    host.innerHTML = `
      <div class="writtt-menu-dropdown" style="left:${Math.max(8, left)}px;top:${rect.bottom + 2}px;">
        ${group.items
          .map((item) => {
            if (item.divider) return `<div class="writtt-menu-divider"></div>`;
            return `
              <button class="writtt-menu-item ${item.disabled ? "is-disabled" : ""}" data-mact="${item.id || ""}" ${item.disabled ? "disabled" : ""}>
                <span class="writtt-menu-item-left">
                  <span class="writtt-menu-item-icon ${item.checked ? "is-checked" : ""}">
                    ${item.checked ? matzIcon("check", 12) : item.icon ? matzIcon(item.icon, 12) : ""}
                  </span>
                  <span>${item.label || ""}</span>
                </span>
                ${item.shortcut ? `<span class="writtt-mono writtt-menu-shortcut">${item.shortcut}</span>` : ""}
              </button>
            `;
          })
          .join("")}
      </div>
    `;

    host.querySelectorAll("[data-mact]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = (btn as HTMLElement).dataset.mact || "";
        this.openGroupId = null;
        this.renderDropdown();
        if (act) this.cb.onAction(act);
      });
    });
  }

  destroy(): void {
    window.removeEventListener("mousedown", this.onDocClick);
    window.removeEventListener("keydown", this.onDocKey);
  }
}
