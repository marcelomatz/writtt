import { matzIcon } from "@matz/ui";
import {
  DocFilterMode,
  HelpTopicId,
  SearchResult,
  SecurityConfigDTO,
  SettingsTabId,
  t,
} from "../../domain";
import { esc, formatShortDate } from "../dom/domUtils";

export interface HomeViewState {
  docs: SearchResult[];
  allTags: string[];
  filter: DocFilterMode;
  selectedTag: string;
  searchQuery: string;
  securityCfg: SecurityConfigDTO;
  localAiOnline?: boolean;
  aiModelCount?: number;
  showHomeHeader?: boolean;
  showHomeCapabilities?: boolean;
}

export interface HomeViewHandlers {
  onNewPublicDoc: () => void;
  onNewVaultDoc: () => void;
  onImportDoc: (isVault: boolean) => void;
  onOpenSettings: () => void;
  onOpenSettingsTab?: (tab: SettingsTabId) => void;
  onOpenHelp: () => void;
  onOpenHelpTopic?: (topic: HelpTopicId) => void;
  onOpenEditorAi?: () => void;
  onHideSection?: (section: "header" | "capabilities") => void;
  onSelectDoc: (id: string) => void;
  onFilterChange: (filter: DocFilterMode) => void;
  onTagChange: (tag: string) => void;
  onSearchChange: (query: string) => void;
  onDuplicateDoc?: (doc: SearchResult) => void;
  onRenameDoc: (doc: SearchResult) => void;
  onToggleVaultDoc: (doc: SearchResult) => void;
  onEditTagsDoc: (doc: SearchResult) => void;
  onDeleteDoc: (doc: SearchResult) => void;
}

export function renderHomeView(
  container: HTMLElement,
  st: HomeViewState,
  handlers: HomeViewHandlers
): void {
  const childCountByParent = new Map<string, number>();
  for (const d of st.docs) {
    if (d.parent_id) {
      childCountByParent.set(d.parent_id, (childCountByParent.get(d.parent_id) || 0) + 1);
    }
  }

  const visibleDocs =
    st.filter === "split" || st.searchQuery.trim().length > 0
      ? st.docs
      : st.docs.filter((d) => !d.parent_id && d.doc_type !== "split");

  const vaultCount = st.docs.filter((d) => d.is_vault && !d.parent_id && d.doc_type !== "split").length;
  const subCount = st.docs.filter((d) => Boolean(d.parent_id) || d.doc_type === "split").length;
  const rootCount = st.docs.filter((d) => !d.parent_id && d.doc_type !== "split").length;

  const vaultLabel = st.securityCfg.password_enabled
    ? st.securityCfg.vault_unlocked
      ? t("Cofre Aberto", "Vault Open", "Boveda Abierta")
      : t("Cofre Selado", "Vault Sealed", "Boveda Sellada")
    : t("Ativar Cofre", "Setup Vault", "Activar Boveda");

  const aiOnline = Boolean(st.localAiOnline);
  const showHeader = st.showHomeHeader !== false;
  const showCapabilities = st.showHomeCapabilities !== false;

  container.innerHTML = `
    <div class="writtt-home">
      <div class="writtt-home-stage">
        ${
          showHeader
            ? `<section class="writtt-home-hero-surface">
                <div class="writtt-home-hero-grid">
                  <div class="writtt-home-hero-left">
                    <div class="writtt-home-hero-badge-row">
                      <span class="writtt-home-manifesto-badge">
                        ${matzIcon("shield-check", 11)}
                        <span>${t(
                          "OPEN SOURCE · 100% NO SEU COMPUTADOR · ZERO SERVIDORES",
                          "OPEN SOURCE · 100% ON YOUR COMPUTER · ZERO SERVERS",
                          "OPEN SOURCE · 100% EN TU COMPUTADORA · CERO SERVIDORES"
                        )}</span>
                      </span>
                      <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs writtt-home-dismiss-btn" data-home-hide="header" title="${t("Ocultar este cabecalho da Tela Inicial (reative em Configuracoes -> Aparencia)", "Hide this header from Home screen (restore in Settings -> Appearance)", "Ocultar encabezado (restaurar en Configuracion)")}">
                        ${matzIcon("eye-off", 11)}
                        <span>${t("Ocultar", "Hide", "Ocultar")}</span>
                      </button>
                    </div>

                    <div class="writtt-home-hero-copy">
                      <h1 class="writtt-home-display-title">
                        ${t(
                          "Feito para escrever. Blindado por design.",
                          "Built to write. Armored by design.",
                          "Hecho para escribir. Blindado por diseno."
                        )}
                      </h1>
                      <p class="writtt-home-display-lead">
                        ${t(
                          "O Writtt vive no seu computador — ponto final. Sem contas, sem sincronizacao forcada em nuvem e sem empresas lendo o que voce escreve. Escrever para pensar, com privacidade total: suas palavras sao suas, completamente.",
                          "Writtt lives on your computer — full stop. No accounts, no forced cloud sync, and no companies reading your texts. Write to think in complete privacy: your words are yours, completely.",
                          "Writtt vive en tu computadora — punto final. Sin cuentas, sin nube forzada y sin empresas leyendo lo que escribes. Tus palabras son completamente tuyas."
                        )}
                      </p>
                    </div>
                  </div>

                  <div class="writtt-home-hero-right">
                    <div class="writtt-home-top-pills">
                      <button class="writtt-btn writtt-btn-xs ${st.securityCfg.password_enabled ? (st.securityCfg.vault_unlocked ? "is-status-ok" : "is-status-warn") : ""}" id="home-pill-vault" title="${t("Gerenciar Senha Mestra, PIN rapido e bloqueio do cofre", "Manage Master Password, Quick PIN and Vault lock", "Gestionar Contrasena Maestra y PIN")}">
                        ${matzIcon(st.securityCfg.vault_unlocked ? "unlock" : "lock", 11)}
                        <span>${vaultLabel}</span>
                      </button>
                      <button class="writtt-btn writtt-btn-xs" id="home-pill-ai" title="${t("Entenda e use a IA local privada via Ollama", "Learn about and use private local AI via Ollama", "Usar IA local privada con Ollama")}">
                        <span class="writtt-status-dot ${aiOnline ? "is-online" : "is-offline"}"></span>
                        <span>${
                          aiOnline
                            ? `${t("IA Local Pronta", "Local AI Ready", "IA Local Lista")}${st.aiModelCount ? ` (${st.aiModelCount})` : ""}`
                            : t("IA Local Offline", "Local AI Offline", "IA Local Offline")
                        }</span>
                      </button>
                      <button class="writtt-btn writtt-btn-xs" id="home-pill-help" title="F1">
                        ${matzIcon("help-circle", 11)}
                        <span>${t("Guia Completo", "Complete Guide", "Guia Completa")}</span>
                      </button>
                    </div>

                    <div class="writtt-home-pillars">
                      <div class="writtt-home-pillar">
                        <span class="writtt-accent-icon">${matzIcon("hard-drive", 13)}</span>
                        <div>
                          <div class="writtt-home-pillar-title">${t("100% Offline Sempre", "100% Offline Always", "100% Offline Siempre")}</div>
                          <div class="writtt-home-pillar-sub">${t("Nenhum dado sai da sua maquina", "Zero data leaves your device", "Ningun dato sale de tu equipo")}</div>
                        </div>
                      </div>
                      <div class="writtt-home-pillar">
                        <span class="writtt-vault-icon">${matzIcon("vault", 13)}</span>
                        <div>
                          <div class="writtt-home-pillar-title">${t("Cofre Criptografado", "Encrypted Vault", "Boveda Cifrada")}</div>
                          <div class="writtt-home-pillar-sub">${t("Ilegivel ate no disco rigido", "Unreadable even on raw disk", "Ilegible incluso en el disco")}</div>
                        </div>
                      </div>
                      <div class="writtt-home-pillar">
                        <span class="writtt-accent-icon">${matzIcon("brain", 13)}</span>
                        <div>
                          <div class="writtt-home-pillar-title">${t("IA Privada Local", "Private Local AI", "IA Privada Local")}</div>
                          <div class="writtt-home-pillar-sub">${t("Seu texto nunca vira treino externo", "Never trains third-party models", "Nunca entrena modelos externos")}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>`
            : ""
        }

        <section class="writtt-home-primary-grid">
          <button class="writtt-home-start-card is-primary" id="home-new-doc">
            <div class="writtt-home-start-head">
              <span class="writtt-home-icon-box is-accent">${matzIcon("feather", 16)}</span>
              <span class="matz-badge writtt-mono writtt-badge-xs">Ctrl+N</span>
            </div>
            <div class="writtt-home-start-title">
              ${t("Escrever Novo Manuscrito", "Write New Manuscript", "Escribir Nuevo Manuscrito")}
            </div>
            <p class="writtt-home-start-desc">
              ${t(
                "A pagina em branco, sem ninguem olhando. Editor completo com capitulos, tabelas, desenhos e atalhos /.",
                "A blank page with no one watching. Full rich-text studio with chapters, tables, drawings and / commands.",
                "La pagina en blanco sin distracciones. Editor completo con capitulos, tablas, dibujos y comandos /."
              )}
            </p>
          </button>

          <button class="writtt-home-start-card is-vault" id="home-new-vault-doc">
            <div class="writtt-home-start-head">
              <span class="writtt-home-icon-box is-warn">${matzIcon("lock", 16)}</span>
              <span class="matz-badge writtt-mono writtt-badge-xs">${t("COFRE", "VAULT", "BOVEDA")}</span>
            </div>
            <div class="writtt-home-start-title">
              ${t("Criar Obra no Cofre Protegido", "Create in Protected Vault", "Crear en Boveda Protegida")}
            </div>
            <p class="writtt-home-start-desc">
              ${t(
                "Algumas coisas nao sao para ninguem. Seu texto e embaralhado por senha antes de ser salvo no computador.",
                "Some things aren't meant for anyone else. Scrambled with your password before touching the hard drive.",
                "Algunas cosas son solo para ti. Protegido con tu contrasena antes de guardarse en el disco."
              )}
            </p>
          </button>

          <button class="writtt-home-start-card" id="home-import-doc">
            <div class="writtt-home-start-head">
              <span class="writtt-home-icon-box">${matzIcon("upload", 16)}</span>
              <span class="matz-badge writtt-mono writtt-badge-xs">.MD / .TXT</span>
            </div>
            <div class="writtt-home-start-title">
              ${t("Importar Texto do Computador", "Import Local Draft", "Importar Borrador Local")}
            </div>
            <p class="writtt-home-start-desc">
              ${t(
                "Traga rascunhos, anotacoes ou livros que ja estao nas suas pastas para editar, organizar e blindar aqui.",
                "Bring existing drafts, notes or chapters from your folders to organize, edit and protect here.",
                "Trae textos o capitulos existentes desde tus carpetas para editarlos y protegerlos aqui."
              )}
            </p>
          </button>
        </section>

        ${
          showCapabilities
            ? `<section class="writtt-home-ecosystem">
                <div class="writtt-home-section-head">
                  <span class="writtt-section-kicker">
                    ${t("RECURSOS DO ESTUDIO & FERRAMENTAS DISPONIVEIS", "STUDIO CAPABILITIES & TOOLS", "RECURSOS DEL ESTUDIO")}
                  </span>
                  <div class="writtt-row-gap-xs">
                    <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-home-help-topic="overview">
                      ${matzIcon("bookmark", 11)}
                      <span>${t("Entender todos os recursos", "Explore how everything works", "Explorar todos los recursos")}</span>
                    </button>
                    <button type="button" class="writtt-btn writtt-btn-ghost writtt-btn-xs writtt-home-dismiss-btn" data-home-hide="capabilities" title="${t("Ocultar este painel da Tela Inicial (reative em Configuracoes -> Aparencia)", "Hide from Home screen (restore in Settings -> Appearance)", "Ocultar de Inicio (restaurar en Configuracion)")}">
                      ${matzIcon("eye-off", 11)}
                      <span>${t("Ocultar", "Hide", "Ocultar")}</span>
                    </button>
                  </div>
                </div>

                <div class="writtt-home-cap-grid">
                  <button class="writtt-home-cap-tile" data-home-stab="security">
                    <span class="writtt-home-cap-icon is-warn">${matzIcon("key", 14)}</span>
                    <div class="writtt-min-w0">
                      <div class="writtt-home-cap-title">${t("Senha Mestra, PIN & 2FA", "Password, PIN & 2FA", "Contrasena, PIN y 2FA")}</div>
                      <div class="writtt-home-cap-desc">${t("Trava dupla: senha forte no disco e PIN curto no dia a dia.", "Dual lock: strong disk password plus quick daily PIN.", "Contrasena fuerte y PIN rapido diario.")}</div>
                    </div>
                  </button>

                  <button class="writtt-home-cap-tile" id="home-cap-ai">
                    <span class="writtt-home-cap-icon is-accent">${matzIcon("sparkles", 14)}</span>
                    <div class="writtt-min-w0">
                      <div class="writtt-home-cap-title">${t("Assistente IA Offline", "Offline AI Assistant", "Asistente IA Offline")}</div>
                      <div class="writtt-home-cap-desc">${t("Reescreva, resuma e converse usando Ollama na sua maquina.", "Rewrite, summarize and chat via Ollama on your hardware.", "Reescribe y chatea con Ollama en tu equipo.")}</div>
                    </div>
                  </button>

                  <button class="writtt-home-cap-tile" data-home-stab="express">
                    <span class="writtt-home-cap-icon is-accent">${matzIcon("certificate", 14)}</span>
                    <div class="writtt-min-w0">
                      <div class="writtt-home-cap-title">${t("Prova de Autoria & Envelopes", "Authorship & Envelopes", "Autoria y Sobres")}</div>
                      <div class="writtt-home-cap-desc">${t("Comprove data e autoria de obras ineditas e lacre notas.", "Prove authorship dates for unpublished works & seal notes.", "Comprueba autoria y sella notas confidenciales.")}</div>
                    </div>
                  </button>

                  <button class="writtt-home-cap-tile" data-home-stab="drive">
                    <span class="writtt-home-cap-icon">${matzIcon("archive", 14)}</span>
                    <div class="writtt-min-w0">
                      <div class="writtt-home-cap-title">${t("Arquivos & Backup Selado", "Sealed Files & Backups", "Archivos y Respaldos")}</div>
                      <div class="writtt-home-cap-desc">${t("Guarde PDFs/contratos protegidos e gere pacotes de backup.", "Lock PDFs/contracts and export encrypted backup bundles.", "Guarda PDFs protegidos y exporta respaldos.")}</div>
                    </div>
                  </button>

                  <button class="writtt-home-cap-tile" data-home-stab="appearance">
                    <span class="writtt-home-cap-icon">${matzIcon("palette", 14)}</span>
                    <div class="writtt-min-w0">
                      <div class="writtt-home-cap-title">${t("Iluminacao, Temas & Foco", "Lighting, Themes & Focus", "Temas, Brillo y Enfoque")}</div>
                      <div class="writtt-home-cap-desc">${t("Ajuste tipografia, brilho adaptativo e dicionario proprio.", "Customize typography, adaptive brightness & dictionary.", "Ajusta tipografia, brillo y diccionario.")}</div>
                    </div>
                  </button>
                </div>
              </section>`
            : ""
        }

        <section class="writtt-home-library-surface">
          <div class="writtt-home-filterbar">
            <div class="writtt-home-search">
              <span class="writtt-muted-icon">${matzIcon("search", 13)}</span>
              <input class="matz-input writtt-input-sm" id="home-search-input" value="${esc(st.searchQuery)}" placeholder="${t("Buscar instantaneamente por titulo, trecho ou #tag...", "Instant local search by title, phrase or #tag...", "Buscar al instante por titulo, frase o #tag...")}" />
            </div>

            <div class="writtt-row-gap-xs">
              <button class="writtt-btn writtt-btn-sm ${st.filter === "all" ? "is-active" : ""}" data-hfilter="all">
                ${matzIcon("file-text", 11)}
                <span>${t("Minhas Obras", "My Works", "Mis Obras")}</span>
                <span class="writtt-mono">(${rootCount})</span>
              </button>
              <button class="writtt-btn writtt-btn-sm ${st.filter === "vault" ? "is-active" : ""}" data-hfilter="vault">
                ${matzIcon("lock", 11)}
                <span>${t("No Cofre", "In Vault", "En Boveda")}</span>
                <span class="writtt-mono">(${vaultCount})</span>
              </button>
              <button class="writtt-btn writtt-btn-sm ${st.filter === "split" ? "is-active" : ""}" data-hfilter="split" title="${t("Capitulos filhos e rascunhos paralelos ligados a uma obra principal", "Child chapters and parallel drafts linked to a parent work", "Subcapitulos y borradores paralelos")}">
                ${matzIcon("columns", 11)}
                <span>${t("Sub-Capitulos", "Sub-Chapters", "Subcapitulos")}</span>
                <span class="writtt-mono">(${subCount})</span>
              </button>
            </div>
          </div>

          ${
            st.allTags.length > 0
              ? `<div class="writtt-chip-row writtt-home-tags-bar">
                  <span class="writtt-help-note">${matzIcon("tag", 10)} Tags:</span>
                  <button class="matz-badge writtt-tag-chip ${!st.selectedTag ? "is-active" : ""}" data-htag="">${t("Todas", "All", "Todas")}</button>
                  ${st.allTags
                    .slice(0, 14)
                    .map(
                      (tg) =>
                        `<button class="matz-badge writtt-tag-chip ${st.selectedTag === tg ? "is-active" : ""}" data-htag="${esc(tg)}">#${esc(tg)}</button>`
                    )
                    .join("")}
                </div>`
              : ""
          }

          ${
            visibleDocs.length === 0
              ? `<div class="writtt-home-empty">
                  <div class="writtt-home-empty-icon">${matzIcon("feather", 24)}</div>
                  <div class="writtt-empty-title">
                    ${
                      st.searchQuery.trim() || st.selectedTag || st.filter !== "all"
                        ? t("Nenhuma obra corresponde ao filtro atual", "No manuscripts match the current filter", "Ninguna obra coincide con el filtro actual")
                        : t("Sua mesa de escrita esta pronta", "Your writing desk is ready", "Tu mesa de escritura esta lista")
                    }
                  </div>
                  <p class="writtt-home-empty-copy">
                    ${
                      st.searchQuery.trim() || st.selectedTag || st.filter !== "all"
                        ? t("Limpe a busca ou altere a aba acima para ver todos os seus manuscritos.", "Clear the search box or switch tabs above to view all manuscripts.", "Limpia la busqueda o cambia el filtro arriba.")
                        : t(
                            "Toda vez que voce abre um documento novo, e o mesmo momento: a pagina em branco, sem notificacoes e sem ninguem olhando. Crie seu primeiro manuscrito acima.",
                            "Every new document begins the same way: a quiet blank page, no notifications, and no one watching. Create your first manuscript above.",
                            "Cada documento nuevo comienza igual: una pagina en blanco, sin notificaciones y sin nadie mirando. Crea tu primer manuscrito arriba."
                          )
                    }
                  </p>
                </div>`
              : `<div class="writtt-home-grid writtt-home-docs-grid">
                  ${visibleDocs
                    .map((d) => {
                      const kids = childCountByParent.get(d.id) || 0;
                      return `
                      <article class="writtt-home-doc-card writtt-doc-tile ${d.is_vault ? "is-vault-doc" : ""}" data-home-open="${esc(d.id)}">
                        <div>
                          <div class="writtt-doc-tile-head">
                            <div class="writtt-min-w0">
                              <div class="writtt-doc-tile-kicker">
                                ${
                                  d.is_vault
                                    ? `<span class="writtt-pill is-vault">${matzIcon("lock", 9)} ${t("Cofre", "Vault", "Boveda")}</span>`
                                    : `<span class="writtt-pill">${matzIcon("file-text", 9)} ${t("Local", "Local", "Local")}</span>`
                                }
                                <span class="writtt-mono writtt-doc-tile-meta">v${d.version || 1} · ${formatShortDate(d.updated_at)}</span>
                              </div>
                              <div class="writtt-doc-tile-title">${esc(d.title || t("Sem titulo", "Untitled", "Sin titulo"))}</div>
                            </div>
                            <div class="writtt-doc-tile-actions">
                              <button class="writtt-btn writtt-btn-ghost writtt-icon-btn-sm ${d.is_vault ? "is-status-warn" : ""}" data-hact-vault="${esc(d.id)}" title="${d.is_vault ? t("Protegido no Cofre (clique para tornar comum)", "Protected in Vault (click to unseal)", "Protegido en Boveda") : t("Guardar esta obra no Cofre Protegido", "Lock this work in Protected Vault", "Proteger en Boveda")}">
                                ${matzIcon(d.is_vault ? "lock" : "unlock", 12)}
                              </button>
                              <button class="writtt-btn writtt-btn-ghost writtt-icon-btn-sm" data-hact-dup="${esc(d.id)}" title="${t("Criar copia independente desta obra", "Create independent copy of this work", "Crear copia independiente")}">
                                ${matzIcon("copy", 12)}
                              </button>
                              <button class="writtt-btn writtt-btn-ghost writtt-icon-btn-sm" data-hact-rename="${esc(d.id)}" title="${t("Renomear titulo", "Rename title", "Renombrar")}">
                                ${matzIcon("edit", 12)}
                              </button>
                              <button class="writtt-btn writtt-btn-ghost writtt-btn-danger writtt-icon-btn-sm" data-hact-del="${esc(d.id)}" title="${t("Excluir permanentemente", "Delete permanently", "Eliminar")}">
                                ${matzIcon("trash", 12)}
                              </button>
                            </div>
                          </div>

                          <div class="writtt-doc-tile-snippet">
                            ${
                              d.is_vault && !st.securityCfg.vault_unlocked
                                ? t("Obra trancada com criptografia no seu computador. Desbloqueie o cofre para ler.", "Encrypted on your computer. Unlock your vault to read.", "Obra cifrada en tu equipo. Desbloquea la boveda para leer.")
                                : esc(d.snippet || t("Pagina pronta para continuar escrevendo...", "Ready to continue writing...", "Listo para seguir escribiendo..."))
                            }
                          </div>
                        </div>

                        <div class="writtt-doc-tile-foot">
                          <div class="writtt-chip-row writtt-min-w0">
                            ${kids > 0 ? `<span class="matz-badge writtt-badge-accent">${kids} ${t("sub-cap.", "sub-ch.", "subcap.")}</span>` : ""}
                            ${d.doc_type === "split" ? `<span class="matz-badge writtt-badge-xs">SUB</span>` : ""}
                            ${(d.tags || [])
                              .slice(0, 3)
                              .map((tg) => `<span class="matz-badge writtt-badge-xs">#${esc(tg)}</span>`)
                              .join("")}
                            ${kids === 0 && (d.tags || []).length === 0 ? `<span class="writtt-help-note">${t("Sem tags", "No tags", "Sin etiquetas")}</span>` : ""}
                          </div>
                          <button class="writtt-btn writtt-btn-ghost writtt-btn-xs" data-hact-tags="${esc(d.id)}">
                            # ${t("Tags", "Tags", "Tags")}
                          </button>
                        </div>
                      </article>`;
                    })
                    .join("")}
                </div>`
          }
        </section>
      </div>
    </div>
  `;

  container.querySelector("#home-new-doc")?.addEventListener("click", handlers.onNewPublicDoc);
  container.querySelector("#home-new-vault-doc")?.addEventListener("click", handlers.onNewVaultDoc);
  container.querySelector("#home-import-doc")?.addEventListener("click", () => handlers.onImportDoc(false));
  container.querySelector("#home-pill-vault")?.addEventListener("click", () => {
    if (handlers.onOpenSettingsTab) handlers.onOpenSettingsTab("security");
    else handlers.onOpenSettings();
  });
  container.querySelector("#home-pill-ai")?.addEventListener("click", () => {
    if (handlers.onOpenEditorAi) handlers.onOpenEditorAi();
    else if (handlers.onOpenHelpTopic) handlers.onOpenHelpTopic("ai");
    else handlers.onOpenHelp();
  });
  container.querySelector("#home-cap-ai")?.addEventListener("click", () => {
    if (handlers.onOpenHelpTopic) handlers.onOpenHelpTopic("ai");
    else handlers.onOpenHelp();
  });
  container.querySelector("#home-pill-help")?.addEventListener("click", handlers.onOpenHelp);

  container.querySelectorAll("[data-home-hide]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sec = ((btn as HTMLElement).dataset.homeHide as "header" | "capabilities") || "header";
      handlers.onHideSection?.(sec);
    });
  });

  container.querySelectorAll("[data-home-stab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = ((btn as HTMLElement).dataset.homeStab as SettingsTabId) || "security";
      if (handlers.onOpenSettingsTab) handlers.onOpenSettingsTab(tab);
      else handlers.onOpenSettings();
    });
  });

  container.querySelectorAll("[data-home-help-topic]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tp = ((btn as HTMLElement).dataset.homeHelpTopic as HelpTopicId) || "overview";
      if (handlers.onOpenHelpTopic) handlers.onOpenHelpTopic(tp);
      else handlers.onOpenHelp();
    });
  });

  const searchInput = container.querySelector("#home-search-input") as HTMLInputElement | null;
  searchInput?.addEventListener("input", () => handlers.onSearchChange(searchInput.value));

  container.querySelectorAll("[data-hfilter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handlers.onFilterChange(((btn as HTMLElement).dataset.hfilter as DocFilterMode) || "all");
    });
  });
  container.querySelectorAll("[data-htag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handlers.onTagChange((btn as HTMLElement).dataset.htag || "");
    });
  });

  const byId = new Map(st.docs.map((d) => [d.id, d]));

  container.querySelectorAll("[data-home-open]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = (card as HTMLElement).dataset.homeOpen;
      if (id) handlers.onSelectDoc(id);
    });
  });
  container.querySelectorAll("[data-hact-vault]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const doc = byId.get((btn as HTMLElement).dataset.hactVault || "");
      if (doc) handlers.onToggleVaultDoc(doc);
    });
  });
  container.querySelectorAll("[data-hact-dup]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const doc = byId.get((btn as HTMLElement).dataset.hactDup || "");
      if (doc) handlers.onDuplicateDoc?.(doc);
    });
  });
  container.querySelectorAll("[data-hact-rename]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const doc = byId.get((btn as HTMLElement).dataset.hactRename || "");
      if (doc) handlers.onRenameDoc(doc);
    });
  });
  container.querySelectorAll("[data-hact-tags]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const doc = byId.get((btn as HTMLElement).dataset.hactTags || "");
      if (doc) handlers.onEditTagsDoc(doc);
    });
  });
  container.querySelectorAll("[data-hact-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const doc = byId.get((btn as HTMLElement).dataset.hactDel || "");
      if (doc) handlers.onDeleteDoc(doc);
    });
  });
}
