import { Window } from "@wailsio/runtime";
import { matzIcon, renderMatzTitleBar } from "@matz/ui";
import { StudioGateway } from "../../application/studioGateway";
import { ActiveEditorDoc, AppViewMode, ReleaseUpdateDTO, t } from "../../domain";
import { esc } from "../dom/domUtils";

export interface TitleBarNavProps {
  isLocked: boolean;
  activeView: AppViewMode;
  activeDoc: ActiveEditorDoc | null;
  updateInfo?: ReleaseUpdateDTO | null;
  onNavigateView: (target: AppViewMode) => void;
  onOpenCommandPalette: () => void;
  onOpenUpdateDownload?: () => void;
}

export function renderWritttTitleBar(container: HTMLElement, props: TitleBarNavProps): void {
  const {
    isLocked,
    activeView,
    activeDoc,
    updateInfo,
    onNavigateView,
    onOpenCommandPalette,
    onOpenUpdateDownload,
  } = props;

  const subtitle = isLocked
    ? t("Cofre Selado", "Vault Sealed", "Boveda Sellada")
    : activeView === "home"
    ? t("Biblioteca de Obras", "Manuscript Library", "Biblioteca de Obras")
    : activeView === "settings"
    ? t("Configuracoes & Cofre", "Settings & Vault", "Configuracion y Boveda")
    : activeView === "help"
    ? t("Central de Ajuda", "Help Center", "Centro de Ayuda")
    : activeDoc
    ? `${activeDoc.title} — ${activeDoc.is_vault ? t("Cofre E2EE", "E2EE Vault", "Boveda E2EE") : "Studio"}`
    : "Writtt Studio";

  void StudioGateway.setWindowTitle(`Writtt — ${subtitle}`);

  const navHtml = isLocked
    ? ""
    : `
    <nav class="writtt-tb-nav matz-no-drag" data-no-drag="true">
      <button type="button" class="writtt-tb-nav-btn matz-no-drag ${activeView === "home" ? "is-active" : ""}" data-tb-nav="home">
        ${matzIcon("home", 11)} <span>${t("Inicio", "Home", "Inicio")}</span>
      </button>
      <button type="button" class="writtt-tb-nav-btn matz-no-drag ${activeView === "editor" ? "is-active" : ""}" data-tb-nav="editor">
        ${matzIcon("edit", 11)} <span>${t("Editor", "Editor", "Editor")}</span>
      </button>
      <button type="button" class="writtt-tb-nav-btn matz-no-drag ${activeView === "settings" ? "is-active" : ""}" data-tb-nav="settings">
        ${matzIcon("sliders", 11)} <span>${t("Configuracoes", "Settings", "Ajustes")}</span>
      </button>
      <button type="button" class="writtt-tb-nav-btn matz-no-drag ${activeView === "help" ? "is-active" : ""}" data-tb-nav="help">
        ${matzIcon("bookmark", 11)} <span>${t("Ajuda", "Help", "Ayuda")}</span>
      </button>
    </nav>
  `;

  const updatePillHtml =
    !isLocked && updateInfo?.hasUpdate
      ? `<button type="button" class="writtt-update-pill matz-no-drag" id="writtt-tb-update-btn" data-no-drag="true" data-tip="${t("Nova versao disponivel para download em writtt.com", "New version available for download at writtt.com", "Nueva version disponible para descargar en writtt.com")}">
          ${matzIcon("download", 11)}
          <span class="writtt-mono">${esc(updateInfo.latestVersion)}</span>
          <span>${t("Atualizar", "Update", "Actualizar")}</span>
        </button>`
      : "";

  renderMatzTitleBar(container, {
    currentProduct: "writtt",
    title: "Writtt",
    version: "0.2.0",
    subtitle,
    showSuiteSwitcher: false,
    centerHtml: navHtml,
    rightActionsHtml: updatePillHtml,
    onOpenCommandPalette: isLocked ? undefined : onOpenCommandPalette,
    onMinimize: () => Window.Minimise(),
    onMaximize: () => Window.ToggleMaximise(),
    onClose: () => Window.Close(),
  });

  container.querySelector("#writtt-tb-update-btn")?.addEventListener("click", () => {
    onOpenUpdateDownload?.();
  });

  container.querySelectorAll("[data-tb-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = ((btn as HTMLElement).dataset.tbNav as AppViewMode) || "home";
      onNavigateView(target);
    });
  });
}
