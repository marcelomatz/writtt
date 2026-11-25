import { matzIcon } from "@matz/ui";
import { extractChaptersAndStats, SecurityConfigDTO, t } from "../../domain";

export interface StatusBarProps {
  inEditor: boolean;
  activeContent: string;
  totalWorksCount: number;
  saveState: "saved" | "dirty" | "saving";
  brightness: number;
  securityCfg: SecurityConfigDTO;
  onOpenSecuritySettings: () => void;
  onQuickLock: () => void;
  onBrightnessChange: (value: number) => void;
}

export function renderStatusBarView(statusbarEl: HTMLElement, props: StatusBarProps): void {
  const { inEditor, activeContent, totalWorksCount, saveState, brightness, securityCfg } = props;
  const { chapters, stats } = extractChaptersAndStats(inEditor ? activeContent : "");

  const saveLabel =
    saveState === "saving"
      ? t("Salvando...", "Saving...", "Guardando...")
      : saveState === "dirty"
      ? t("Alterado", "Unsaved", "Sin guardar")
      : t("Salvo", "Saved", "Guardado");

  const vaultStatusClass = securityCfg.password_enabled
    ? securityCfg.vault_unlocked
      ? "is-status-ok"
      : "is-status-warn"
    : "";

  statusbarEl.innerHTML = `
    <div class="writtt-statusbar-group">
      <button class="writtt-btn writtt-btn-ghost writtt-statusbar-btn ${vaultStatusClass}" id="sb-status-vault">
        ${matzIcon(securityCfg.vault_unlocked ? "unlock" : "lock", 11)}
        <span>${
          securityCfg.password_enabled
            ? securityCfg.vault_unlocked
              ? t("Cofre Aberto", "Vault Open", "Boveda Abierta")
              : t("Cofre Selado", "Vault Sealed", "Boveda Sellada")
            : t("Cofre Local", "Local Vault", "Boveda Local")
        }</span>
      </button>
      ${inEditor ? `<span class="writtt-mono ${saveState === "dirty" ? "is-status-warn" : ""}">${saveLabel}</span>` : ""}
    </div>

    <div class="writtt-statusbar-group writtt-mono">
      ${
        inEditor
          ? `<span>${stats.words} ${t("palavras", "words", "palabras")}</span>
             <span>~${stats.readMinutes} min</span>
             <span>${chapters.length} cap.</span>`
          : `<span>${totalWorksCount} ${t("obras", "works", "obras")}</span>`
      }
      <div class="writtt-brightness-wrap" title="${t("Brilho Ocular", "Eye Comfort Brightness", "Brillo Visual")}">
        ${matzIcon("sun", 11)}
        <input type="range" id="sb-brightness" class="writtt-brightness-slider" min="70" max="110" value="${brightness}" />
      </div>
      ${
        securityCfg.password_enabled
          ? `<button class="writtt-btn writtt-btn-ghost writtt-statusbar-btn" id="sb-quick-lock" title="Ctrl+L">${matzIcon("lock", 10)} Lock</button>`
          : ""
      }
    </div>
  `;

  statusbarEl.querySelector("#sb-status-vault")?.addEventListener("click", props.onOpenSecuritySettings);
  statusbarEl.querySelector("#sb-quick-lock")?.addEventListener("click", props.onQuickLock);
  const brEl = statusbarEl.querySelector("#sb-brightness") as HTMLInputElement | null;
  brEl?.addEventListener("input", () => props.onBrightnessChange(Number(brEl.value)));
}
