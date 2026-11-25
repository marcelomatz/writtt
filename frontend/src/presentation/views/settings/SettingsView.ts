import { matzIcon } from "@matz/ui";
import {
  AliasConfigDTO,
  DriveVaultFile,
  EditorialPreferences,
  ExpressMessageDTO,
  ReleaseUpdateDTO,
  SearchResult,
  SecurityConfigDTO,
  SettingsTabId,
  t,
  TrustedDeviceDTO,
  WritttAlgorithmsReport,
} from "../../../domain";
import { bindHorizontalResizer } from "../../dom/domUtils";
import { renderAppearanceTab } from "./AppearanceTab";
import { renderAuditDevicesTab, renderDictionaryTab } from "./AuditDictionaryTab";
import { renderDriveBackupsTab } from "./DriveBackupsTab";
import { renderExpressIdentityTab } from "./ExpressIdentityTab";
import { renderSecurityVaultTab } from "./SecurityVaultTab";

export interface SettingsViewData {
  activeTab: SettingsTabId;
  prefs: EditorialPreferences;
  docs: SearchResult[];
  securityCfg: SecurityConfigDTO;
  driveFiles: DriveVaultFile[];
  expressInbox: ExpressMessageDTO[];
  trustedDevices: TrustedDeviceDTO[];
  customDictionary: string[];
  aliasConfig: AliasConfigDTO;
  algoReport: WritttAlgorithmsReport | null;
  updateInfo: ReleaseUpdateDTO | null;
}

export interface SettingsViewCallbacks {
  onSelectTab: (tab: SettingsTabId) => void;
  onBackHome: () => void;
  onUpdatePrefs: (patch: Partial<EditorialPreferences>) => void;
  onRefreshAll: () => Promise<void>;
  onOpenDoc?: (id: string) => void;
  onCheckUpdatesNow?: () => Promise<void>;
  onOpenUpdateDownload?: () => void;
}

let settingsRailCollapsed = false;

export function renderSettingsView(
  container: HTMLElement,
  data: SettingsViewData,
  cb: SettingsViewCallbacks
): void {
  const navItems: Array<{ id: SettingsTabId; icon: string; label: string; desc: string }> = [
    {
      id: "appearance",
      icon: "sliders",
      label: t("Aparencia & Escrita", "Appearance & Writing", "Apariencia y Escritura"),
      desc: t("Temas, fonte, brilho da tela e auto-salvamento", "Themes, font, screen brightness & auto-save", "Temas, fuente, brillo y auto-guardado"),
    },
    {
      id: "security",
      icon: "lock",
      label: t("Cofre & Seguranca", "Vault & Security", "Boveda y Seguridad"),
      desc: t("Senha Mestra, PIN rapido, recuperacao e 2FA", "Master Password, Quick PIN, recovery & 2FA", "Contrasena, PIN rapido y recuperacion"),
    },
    {
      id: "drive",
      icon: "hard-drive",
      label: t("Arquivos & Backups", "Protected Files & Backups", "Archivos y Respaldos"),
      desc: t("Guardar PDFs/imagens no cofre e backups completos", "Lock PDFs/images & export full library backups", "Guardar PDFs protegidos y respaldos"),
    },
    {
      id: "express",
      icon: "certificate",
      label: t("Identidade & Envelopes", "Author Identity & Envelopes", "Identidad y Sobres"),
      desc: t("Sua assinatura @alias e capsulas confidenciais", "Your @alias signature & sealed text capsules", "Tu firma @alias y sobres confidenciales"),
    },
    {
      id: "dictionary",
      icon: "bookmark",
      label: t("Dicionario Pessoal", "Custom Dictionary", "Diccionario Personal"),
      desc: t("Nomes de personagens, siglas e termos proprios", "Character names, acronyms & custom vocabulary", "Nombres propios y vocabulario personal"),
    },
    {
      id: "audit",
      icon: "shield-check",
      label: t("Dispositivos & Historico Antifraude", "Devices & Tamper-Proof Log", "Dispositivos y Registro Antifraude"),
      desc: t("Computadores autorizados e prova de integridade", "Authorized computers & integrity verification", "Equipos autorizados y prueba de integridad"),
    },
  ];

  container.innerHTML = `
    <div class="writtt-settings-layout">
      <aside class="writtt-settings-rail ${settingsRailCollapsed ? "is-collapsed" : ""}" id="st-rail">
        <div class="writtt-rail-head">
          <span class="writtt-rail-text writtt-rail-heading">${t("Configuracoes", "Settings", "Configuracion")}</span>
          <button class="writtt-btn writtt-btn-ghost writtt-icon-btn-sm" id="st-rail-collapse" title="${t("Recolher / Expandir menu", "Collapse / Expand menu", "Colapsar")}">
            ${matzIcon("sidebar", 13)}
          </button>
        </div>
        <div class="writtt-rail-list">
          ${navItems
            .map(
              (item) => `
              <button class="writtt-settings-nav-item ${data.activeTab === item.id ? "is-active" : ""}" data-stab="${item.id}" title="${item.label}">
                <span class="${data.activeTab === item.id ? "writtt-accent-icon" : "writtt-muted-icon"}">${matzIcon(item.icon, 14)}</span>
                <div class="writtt-rail-text writtt-min-w0">
                  <div class="writtt-nav-label">${item.label}</div>
                  <div class="writtt-tree-snippet">${item.desc}</div>
                </div>
              </button>`
            )
            .join("")}
        </div>
      </aside>
      <div class="writtt-resizer ${settingsRailCollapsed ? "is-hidden" : ""}" id="st-rail-resizer" title="${t("Arraste para redimensionar", "Drag to resize", "Arrastra para redimensionar")}"></div>

      <section class="writtt-settings-content">
        <div class="writtt-settings-inner" id="st-tab-mount"></div>
      </section>
    </div>
  `;

  container.querySelector("#st-rail-collapse")?.addEventListener("click", () => {
    settingsRailCollapsed = !settingsRailCollapsed;
    renderSettingsView(container, data, cb);
  });

  bindHorizontalResizer({
    resizerEl: container.querySelector("#st-rail-resizer") as HTMLElement | null,
    targetEl: container.querySelector("#st-rail") as HTMLElement | null,
    cssVarName: "--writtt-rail-width",
    minPx: 185,
    maxPx: 360,
    side: "left",
  });

  container.querySelectorAll("[data-stab]").forEach((btn) => {
    btn.addEventListener("click", () => cb.onSelectTab(((btn as HTMLElement).dataset.stab as SettingsTabId) || "appearance"));
  });

  const mountEl = container.querySelector("#st-tab-mount") as HTMLElement | null;
  if (!mountEl) return;

  const rerenderSelf = () => renderSettingsView(container, data, cb);

  switch (data.activeTab) {
    case "appearance":
      renderAppearanceTab(
        mountEl,
        data.prefs,
        data.updateInfo,
        cb.onUpdatePrefs,
        rerenderSelf,
        cb.onCheckUpdatesNow,
        cb.onOpenUpdateDownload
      );
      break;
    case "security":
      renderSecurityVaultTab(mountEl, data.securityCfg, data.prefs, cb.onUpdatePrefs, cb.onRefreshAll);
      break;
    case "drive":
      renderDriveBackupsTab(mountEl, data.driveFiles, cb.onRefreshAll, rerenderSelf);
      break;
    case "express":
      renderExpressIdentityTab(
        mountEl,
        data.securityCfg,
        data.aliasConfig,
        data.docs,
        data.expressInbox,
        cb.onRefreshAll,
        cb.onOpenDoc
      );
      break;
    case "dictionary":
      renderDictionaryTab(mountEl, data.customDictionary, cb.onRefreshAll);
      break;
    case "audit":
      renderAuditDevicesTab(mountEl, data.trustedDevices, data.algoReport, cb.onRefreshAll);
      break;
  }
}
