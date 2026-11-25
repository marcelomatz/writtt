import { matzIcon } from "@matz/ui";
import { StudioGateway as WritttIPC } from "../../application/studioGateway";
import { SecurityConfigDTO, t } from "../../domain";
import { HumanAuthController, mountHumanAuthController } from "./HumanAuthGuard";

export interface LockScreenProps {
  securityCfg: SecurityConfigDTO;
  gateMode: "pin" | "password" | "change-pin";
  onChangeGateMode: (mode: "pin" | "password" | "change-pin") => void;
  onUnlocked: () => Promise<void>;
  onRefreshSecurity: () => Promise<void>;
}

let activeLockGuard: HumanAuthController | null = null;

export function renderLockScreenView(lockLayerEl: HTMLElement, props: LockScreenProps): void {
  activeLockGuard?.destroy();
  activeLockGuard = null;

  const { securityCfg } = props;
  const isLocked = securityCfg.password_enabled && !securityCfg.app_unlocked;
  if (!isLocked) {
    lockLayerEl.innerHTML = "";
    return;
  }

  const pinReady = Boolean(securityCfg.vault_pin_enabled && securityCfg.vault_pin_ready);
  const effectiveMode = pinReady && props.gateMode === "pin" ? "pin" : "password";

  lockLayerEl.innerHTML = `
    <div class="writtt-modal-backdrop writtt-lock-backdrop">
      <div class="writtt-card writtt-lock-card">
        <div class="writtt-lock-shield">${matzIcon("shield", 34)}</div>
        <div class="writtt-lock-title">${t("Writtt Protegido", "Writtt Locked", "Writtt Protegido")}</div>
        <div class="writtt-lock-desc writtt-mono" id="gate-status-line">
          ${t("Acesso restrito", "Restricted access", "Acceso restringido")}
        </div>

        ${
          effectiveMode === "pin"
            ? `<form id="gate-pin-form" class="writtt-stack-form" autocomplete="off">
                <div class="writtt-inline-form">
                  <input type="password" class="matz-input writtt-mono writtt-pin-input" id="gate-pin" inputmode="numeric" autocomplete="off" placeholder="PIN" />
                  <button type="submit" class="matz-btn matz-btn-primary" id="gate-submit-btn">${t("Entrar", "Unlock", "Entrar")}</button>
                </div>
                ${securityCfg.totp_enabled ? `<input type="text" class="matz-input writtt-mono writtt-pin-input" id="gate-totp" autocomplete="off" placeholder="2FA" />` : ""}
                <div id="gate-human-slot"></div>
              </form>
              <div class="writtt-lock-links">
                <button type="button" class="writtt-btn writtt-btn-ghost" id="gate-to-pwd">
                  ${matzIcon("lock", 11)} <span>${t("Senha", "Password", "Contrasena")}</span>
                </button>
              </div>`
            : `<form id="gate-pwd-form" class="writtt-stack-form" autocomplete="off">
                <div class="writtt-inline-form">
                  <input type="password" class="matz-input" id="gate-pwd" autocomplete="off" placeholder="${t("Senha", "Password", "Contrasena")}" />
                  <button type="submit" class="matz-btn matz-btn-primary" id="gate-submit-btn">${t("Entrar", "Unlock", "Entrar")}</button>
                </div>
                ${securityCfg.totp_enabled ? `<input type="text" class="matz-input writtt-mono writtt-pin-input" id="gate-totp" autocomplete="off" placeholder="2FA" />` : ""}
                <div id="gate-human-slot"></div>
              </form>
              <div class="writtt-lock-links">
                ${
                  pinReady
                    ? `<button type="button" class="writtt-btn writtt-btn-ghost" id="gate-to-pin">
                        ${matzIcon("key", 11)} <span>PIN</span>
                      </button>`
                    : ""
                }
                ${
                  securityCfg.recovery_configured
                    ? `<button type="button" class="writtt-btn writtt-btn-ghost" id="gate-rk-btn">
                        ${matzIcon("shield", 11)} <span>${t("Recuperacao", "Recovery", "Recuperacion")}</span>
                      </button>`
                    : ""
                }
              </div>`
        }
      </div>
    </div>
  `;

  lockLayerEl.querySelector("#gate-to-pwd")?.addEventListener("click", () => props.onChangeGateMode("password"));
  lockLayerEl.querySelector("#gate-to-pin")?.addEventListener("click", () => props.onChangeGateMode("pin"));

  const pinInput = lockLayerEl.querySelector("#gate-pin") as HTMLInputElement | null;
  const pwdInput = lockLayerEl.querySelector("#gate-pwd") as HTMLInputElement | null;
  const totpInput = lockLayerEl.querySelector("#gate-totp") as HTMLInputElement | null;
  const submitBtn = lockLayerEl.querySelector("#gate-submit-btn") as HTMLButtonElement | null;
  const statusEl = lockLayerEl.querySelector("#gate-status-line") as HTMLElement | null;
  const holdSlotEl = lockLayerEl.querySelector("#gate-human-slot") as HTMLElement | null;

  const runUnlock = async () => {
    if (!activeLockGuard) return;
    const secret = effectiveMode === "pin" ? pinInput?.value || "" : pwdInput?.value || "";
    const totp = (totpInput?.value || "").trim();
    const res = await activeLockGuard.attemptUnlock(effectiveMode, secret, totp);
    if (res.status === "unlocked") {
      activeLockGuard.destroy();
      activeLockGuard = null;
      await props.onUnlocked();
    }
  };

  activeLockGuard = mountHumanAuthController({
    container: lockLayerEl,
    inputs: [pinInput, pwdInput, totpInput],
    submitButtons: [submitBtn],
    statusEl,
    holdSlotEl,
    initialLocked: Boolean(securityCfg.brute_force_locked),
    initialRetrySec: Number(securityCfg.brute_force_retry_sec || 0),
    initialRequireHold: Boolean(securityCfg.human_hold_required),
    onReadyToSubmitAfterHold: () => void runUnlock(),
  });

  if (!securityCfg.brute_force_locked) {
    (pinInput || pwdInput)?.focus();
  }

  lockLayerEl.querySelector("#gate-pin-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void runUnlock();
  });

  lockLayerEl.querySelector("#gate-pwd-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void runUnlock();
  });

  lockLayerEl.querySelector("#gate-rk-btn")?.addEventListener("click", () => {
    const rk = window.prompt(t("Chave:", "Key:", "Clave:"));
    if (!rk) return;
    const newPwd = window.prompt(t("Nova senha:", "New password:", "Nueva contrasena:"));
    if (!newPwd) return;
    void WritttIPC.recoverVaultWithKey(rk, newPwd)
      .then(async () => {
        activeLockGuard?.destroy();
        activeLockGuard = null;
        await props.onUnlocked();
      })
      .catch(async () => {
        await props.onRefreshSecurity();
      });
  });
}
