import { matzIcon, showMatzToast } from "@matz/ui";
import { StudioGateway as WritttIPC } from "../../../application/studioGateway";
import { EditorialPreferences, SecurityConfigDTO, t, TOTPEnrollmentBundle } from "../../../domain";
import { esc } from "../../dom/domUtils";
import { HumanAuthController, mountHumanAuthController } from "../../shell/HumanAuthGuard";

let lastRecoveryKey = "";
let totpBundle: TOTPEnrollmentBundle | null = null;
let settingsAuthGuard: HumanAuthController | null = null;

export function renderSecurityVaultTab(
  container: HTMLElement,
  cfg: SecurityConfigDTO,
  prefs: EditorialPreferences,
  onUpdatePrefs: (patch: Partial<EditorialPreferences>) => void,
  onRefreshAll: () => Promise<void>
): void {
  settingsAuthGuard?.destroy();
  settingsAuthGuard = null;

  container.innerHTML = `
    <h2 class="writtt-section-h2">${t("Cofre Pessoal & Protecao das Obras", "Personal Vault & Manuscript Protection", "Boveda Personal y Seguridad")}</h2>
    <p class="writtt-section-lead">${t("Tranque suas obras com senha forte diretamente no seu computador. Nenhum arquivo vai para a nuvem e ninguem alem de voce consegue ler os textos protegidos.", "Lock your manuscripts with a strong password directly on your computer. Nothing is uploaded to the cloud and only you can read sealed works.", "Bloquea tus obras con contrasena fuerte en tu equipo, 100% sin nube.")}</p>

    <div class="writtt-grid-2">
      <div class="writtt-card">
        <div class="writtt-card-title">
          <span>1. ${cfg.password_enabled ? t("Alterar / Gerenciar Senha Mestra", "Change / Manage Master Password", "Cambiar Contrasena Maestra") : t("Criar Senha Mestra do Cofre", "Create Vault Master Password", "Crear Contrasena Maestra")}</span>
          <span class="writtt-pill ${cfg.password_enabled ? (cfg.vault_unlocked ? "is-ok" : "is-vault") : ""}">${cfg.password_enabled ? (cfg.vault_unlocked ? t("ABERTO", "OPEN", "ABIERTA") : t("SELADO", "SEALED", "SELLADA")) : t("NAO DEFINIDA", "NOT SET", "NO DEFINIDA")}</span>
        </div>
        ${
          !cfg.password_enabled
            ? `<p class="writtt-help-note writtt-mb-xs">
                ${t("Voce ainda nao cadastrou uma Senha Mestra. Crie uma senha abaixo para ativar o Cofre Pessoal e liberar o PIN rapido, a Chave de Recuperacao e o 2FA.", "You have not created a Master Password yet. Create one below to enable your Personal Vault, Quick PIN, Recovery Key and 2FA.", "Aun no tienes una Contrasena Maestra. Crea una abajo para activar la Boveda.")}
              </p>
              <input type="password" class="matz-input writtt-mb-xs" id="st-new-pwd" placeholder="${t("Criar nova Senha Mestra (min. 6 caracteres)...", "Create new Master Password (min. 6 chars)...", "Nueva Contrasena Maestra...")}" />
              <input type="password" class="matz-input writtt-mb-xs" id="st-confirm-pwd" placeholder="${t("Confirmar nova Senha Mestra...", "Confirm new Master Password...", "Confirmar Contrasena Maestra...")}" />
              <button class="matz-btn matz-btn-primary writtt-full-btn" id="st-set-pwd">
                ${matzIcon("lock", 12)} <span>${t("Criar Senha Mestra", "Create Master Password", "Crear Contrasena Maestra")}</span>
              </button>`
            : `<p class="writtt-help-note writtt-mb-xs">
                ${t("Sua Senha Mestra esta ativa. Informe a senha atual para altera-la, desbloquear ou remover a protecao.", "Your Master Password is active. Enter your current password to change it, unlock, or remove protection.", "Tu Contrasena Maestra esta activa.")}
              </p>
              <input type="password" class="matz-input writtt-mb-xs" id="st-cur-pwd" placeholder="${t("Senha Mestra atual...", "Current Master Password...", "Contrasena Maestra actual...")}" />
              <input type="password" class="matz-input writtt-mb-xs" id="st-new-pwd" placeholder="${t("Nova Senha Mestra (para alterar)...", "New Master Password (to edit)...", "Nueva Contrasena Maestra...")}" />
              <div id="st-human-slot" class="writtt-mb-xs"></div>
              <div class="writtt-help-note writtt-mono writtt-mb-xs" id="st-auth-status"></div>
              <div class="writtt-inline-form writtt-mb-xs">
                <button class="matz-btn matz-btn-primary writtt-flex-1" id="st-set-pwd">${t("Alterar Senha", "Change Password", "Cambiar")}</button>
                <button class="writtt-btn" id="st-unlock-pwd">${t("Desbloquear", "Unlock", "Desbloquear")}</button>
              </div>
              <div class="writtt-inline-form">
                <button class="writtt-btn writtt-flex-1" id="st-lock-vault">${t("Selar Cofre", "Seal Vault", "Sellar Boveda")}</button>
                <button class="writtt-btn writtt-btn-danger" id="st-remove-pwd">${t("Remover Senha", "Remove", "Quitar")}</button>
              </div>`
        }
      </div>

      <div class="writtt-card ${!cfg.password_enabled ? "writtt-dimmed-card" : ""}">
        <div class="writtt-card-title">
          <span>2. ${t("PIN Rapido & Auto-Bloqueio", "Quick PIN & Auto-Lock", "PIN y Auto-Bloqueo")}</span>
          <span class="writtt-mono">${cfg.vault_pin_enabled ? "ATIVO" : cfg.password_enabled ? "DISPONIVEL" : "REQUER SENHA"}</span>
        </div>
        ${
          !cfg.password_enabled
            ? `<div class="writtt-dashed-box writtt-mb-xs">
                ${t("Cadastre primeiro uma Senha Mestra no cartao ao lado para poder configurar um PIN rapido de 4 a 8 digitos.", "Create a Master Password first before setting up a 4-8 digit Quick PIN.", "Crea primero una Contrasena Maestra para configurar un PIN rapido.")}
              </div>`
            : `<p class="writtt-help-note writtt-mb-xs">
                ${t("O PIN e um atalho numerico (4 a 8 digitos) para reabrir obras do cofre rapidamente sem digitar sua senha longa toda vez.", "Quick PIN (4-8 digits) lets you reopen vaulted works quickly without typing your long password every time.", "Atajo numerico de 4 a 8 digitos para reabrir la boveda.")}
              </p>
              <div class="writtt-inline-form writtt-mb-md">
                <button class="matz-btn matz-btn-primary writtt-flex-1" id="st-open-pin-wizard">
                  ${matzIcon("key", 12)} <span>${cfg.vault_pin_enabled ? t("Alterar PIN Rapido", "Change Quick PIN", "Cambiar PIN") : t("Cadastrar PIN Rapido", "Set Up Quick PIN", "Configurar PIN")}</span>
                </button>
                ${
                  cfg.vault_pin_enabled
                    ? `<button class="writtt-btn writtt-btn-danger" id="st-remove-pin">${t("Remover PIN", "Remove PIN", "Quitar PIN")}</button>`
                    : ""
                }
              </div>`
        }
        <label class="writtt-field-label">${t("Bloquear automaticamente apos inatividade:", "Auto-lock after inactivity:", "Auto-bloquear por inactividad:")}</label>
        <select class="matz-select" id="st-autolock">
          <option value="0" ${prefs.autoLockMinutes === 0 ? "selected" : ""}>${t("Desativado", "Disabled", "Desactivado")}</option>
          <option value="5" ${prefs.autoLockMinutes === 5 ? "selected" : ""}>5 minutos</option>
          <option value="15" ${prefs.autoLockMinutes === 15 ? "selected" : ""}>15 minutos</option>
          <option value="30" ${prefs.autoLockMinutes === 30 ? "selected" : ""}>30 minutos</option>
        </select>
      </div>

      <div class="writtt-card ${!cfg.password_enabled ? "writtt-dimmed-card" : ""}">
        <div class="writtt-card-title">
          <span>3. ${t("Chave de Recuperacao (Plano B)", "Recovery Key (Backup Plan)", "Clave de Recuperacion")}</span>
          <span class="writtt-mono">${cfg.recovery_configured ? "PRONTA" : "NAO GERADA"}</span>
        </div>
        <p class="writtt-help-note writtt-mb-xs">
          <b>${t("O que e?", "What is this?", "Que es?")}</b>
          ${t(" Como o Writtt funciona 100% offline sem servidor, nao existe 'esqueci minha senha por e-mail'. Esta chave e o unico modo de recuperar seu cofre caso voce esqueca a Senha Mestra. Gere e guarde em papel ou cofre fisico.", " Because Writtt is 100% offline with no server, there is no email password reset. This key is your only way to recover the vault if you forget your Master Password. Print or store it safely.", " Como Writtt es 100% offline, esta clave es tu unico respaldo si olvidas tu Contrasena Maestra.")}
        </p>
        <button class="writtt-btn writtt-full-btn writtt-mb-xs" id="st-gen-rk" ${!cfg.password_enabled ? "disabled" : ""}>
          ${matzIcon("key", 12)} <span>${t("Gerar Chave de Recuperacao", "Generate Recovery Key", "Generar Clave")}</span>
        </button>
        ${
          lastRecoveryKey
            ? `<div class="writtt-mono writtt-warn-box writtt-mb-xs">${esc(lastRecoveryKey)}</div>`
            : ""
        }
        <div class="writtt-inline-form">
          <input class="matz-input writtt-mono writtt-input-sm" id="st-rk-input" placeholder="XXXX-XXXX-..." ${!cfg.password_enabled ? "disabled" : ""} />
          <button class="writtt-btn" id="st-rk-recover" ${!cfg.password_enabled ? "disabled" : ""}>${t("Recuperar", "Recover", "Recuperar")}</button>
        </div>
      </div>

      <div class="writtt-card ${!cfg.password_enabled ? "writtt-dimmed-card" : ""}">
        <div class="writtt-card-title">
          <span>4. ${t("Verificacao em 2 Etapas (TOTP 2FA)", "Two-Factor Auth (TOTP 2FA)", "Autenticacion 2FA (TOTP)")}</span>
          <span class="writtt-mono">${cfg.totp_enabled ? `ON (${cfg.backup_codes_left} backups)` : "OFF"}</span>
        </div>
        <p class="writtt-help-note writtt-mb-xs">
          <b>${t("O que e Segredo TOTP?", "What is a TOTP Secret?", "Que es el Secreto TOTP?")}</b>
          ${t(" E um codigo secreto que voce cadastra em um app autenticador no celular (Google Authenticator, Authy, 1Password). O app gera codigos temporarios de 6 digitos a cada 30 segundos para proteger ainda mais seu cofre, alem de 8 codigos reserva de uso unico.", " A secret key you add to an authenticator app (Google Authenticator, Authy, 1Password) to generate 6-digit codes every 30s, plus 8 single-use backup codes.", " Es una clave para tu app autenticadora que genera codigos de 6 digitos cada 30 segundos.")}
        </p>
        <div class="writtt-inline-form writtt-mb-xs">
          <button class="writtt-btn writtt-flex-1" id="st-setup-totp" ${!cfg.password_enabled ? "disabled" : ""}>${t("Gerar Segredo TOTP", "Generate TOTP Secret", "Generar Secreto TOTP")}</button>
          ${cfg.totp_enabled ? `<button class="writtt-btn writtt-btn-danger" id="st-disable-totp">${t("Desativar", "Disable", "Desactivar")}</button>` : ""}
        </div>
        ${
          totpBundle
            ? `<div class="writtt-mono writtt-code-box writtt-mb-xs">
                <div><b>${t("Chave para App Autenticador", "Authenticator Key", "Clave Autenticador")}:</b> ${esc(totpBundle.secret_base32)}</div>
                <div><b>${t("8 Codigos Reserva", "8 Backup Codes", "8 Codigos de Respaldo")}:</b> ${totpBundle.backup_codes.map(esc).join(" · ")}</div>
              </div>
              <div class="writtt-chip-row writtt-mb-xs">
                <button type="button" class="writtt-btn writtt-btn-xs" id="st-copy-totp-sec">${matzIcon("copy", 10)} <span>${t("Copiar Chave", "Copy Key", "Copiar Clave")}</span></button>
                <button type="button" class="writtt-btn writtt-btn-xs" id="st-copy-totp-bkp">${matzIcon("copy", 10)} <span>${t("Copiar Codigos Reserva", "Copy Backup Codes", "Copiar Respaldos")}</span></button>
              </div>`
            : ""
        }
        <div class="writtt-inline-form">
          <input class="matz-input writtt-mono writtt-input-sm" id="st-totp-code" placeholder="6 digitos ou XXXX-XXXX" ${!cfg.password_enabled ? "disabled" : ""} />
          <button class="writtt-btn" id="st-enable-totp" ${!cfg.password_enabled ? "disabled" : ""}>${t("Ativar", "Enable", "Activar")}</button>
          <button class="writtt-btn" id="st-verify-totp" ${!cfg.password_enabled ? "disabled" : ""}>${t("Validar", "Verify", "Validar")}</button>
        </div>
      </div>
    </div>
  `;

  container.querySelector("#st-set-pwd")?.addEventListener("click", async () => {
    const cur = (container.querySelector("#st-cur-pwd") as HTMLInputElement | null)?.value || "";
    const nw = (container.querySelector("#st-new-pwd") as HTMLInputElement | null)?.value || "";
    const confirmEl = container.querySelector("#st-confirm-pwd") as HTMLInputElement | null;
    if (!cfg.password_enabled) {
      if (nw.length < 6) {
        showMatzToast(t("A senha mestra deve ter pelo menos 6 caracteres.", "Password must be at least 6 characters.", "Minimo 6 caracteres."));
        return;
      }
      if (confirmEl && nw !== confirmEl.value) {
        showMatzToast(t("As senhas nao coincidem.", "Passwords do not match.", "Las contrasenas no coinciden."));
        return;
      }
    }
    try {
      await WritttIPC.setPassword(cur, nw);
      showMatzToast(
        cfg.password_enabled
          ? t("Senha Mestra alterada com sucesso!", "Master Password changed!", "Contrasena cambiada!")
          : t("Senha Mestra criada! Agora voce pode configurar um PIN rapido.", "Master Password created! You can now set up a Quick PIN.", "Contrasena creada!")
      );
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  if (cfg.password_enabled) {
    const curPwdEl = container.querySelector("#st-cur-pwd") as HTMLInputElement | null;
    const newPwdEl = container.querySelector("#st-new-pwd") as HTMLInputElement | null;
    const unlockBtnEl = container.querySelector("#st-unlock-pwd") as HTMLButtonElement | null;
    const statusEl = container.querySelector("#st-auth-status") as HTMLElement | null;
    const holdSlotEl = container.querySelector("#st-human-slot") as HTMLElement | null;

    const triggerSettingsUnlock = async () => {
      if (!settingsAuthGuard) return;
      const pwd = curPwdEl?.value || newPwdEl?.value || "";
      const outcome = await settingsAuthGuard.attemptUnlock("vault-password", pwd);
      if (outcome.status === "unlocked") {
        showMatzToast(t("Cofre desbloqueado!", "Vault unlocked!", "Boveda desbloqueada!"));
        await onRefreshAll();
      } else if (outcome.status === "locked") {
        await onRefreshAll();
      }
    };

    settingsAuthGuard = mountHumanAuthController({
      container,
      inputs: [curPwdEl, newPwdEl],
      submitButtons: [unlockBtnEl],
      statusEl,
      holdSlotEl,
      initialLocked: Boolean(cfg.brute_force_locked),
      initialRetrySec: Number(cfg.brute_force_retry_sec || 0),
      initialRequireHold: Boolean(cfg.human_hold_required),
      onReadyToSubmitAfterHold: () => void triggerSettingsUnlock(),
    });

    unlockBtnEl?.addEventListener("click", () => void triggerSettingsUnlock());
  }

  container.querySelector("#st-lock-vault")?.addEventListener("click", async () => {
    await WritttIPC.lockVault();
    showMatzToast(t("Cofre selado!", "Vault sealed!", "Boveda sellada!"));
    await onRefreshAll();
  });

  container.querySelector("#st-remove-pwd")?.addEventListener("click", async () => {
    const cur = (container.querySelector("#st-cur-pwd") as HTMLInputElement | null)?.value || "";
    try {
      await WritttIPC.removePassword(cur);
      showMatzToast(t("Senha removida.", "Password removed.", "Contrasena eliminada."));
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-open-pin-wizard")?.addEventListener("click", () => {
    openQuickPinWizardModal(cfg.vault_pin_enabled, onRefreshAll);
  });

  container.querySelector("#st-remove-pin")?.addEventListener("click", async () => {
    const pwd = window.prompt(t("Digite sua Senha Mestra para remover o PIN rapido:", "Enter your Master Password to remove the Quick PIN:", "Contrasena Maestra:"));
    if (!pwd) return;
    try {
      await WritttIPC.removeVaultPIN(pwd);
      showMatzToast(t("PIN rapido removido.", "Quick PIN removed.", "PIN eliminado."));
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  (container.querySelector("#st-autolock") as HTMLSelectElement | null)?.addEventListener("change", (e) => {
    const mins = Number((e.target as HTMLSelectElement).value) || 0;
    onUpdatePrefs({ autoLockMinutes: mins });
    showMatzToast(mins > 0 ? `Auto-lock: ${mins} min` : t("Auto-bloqueio desativado", "Auto-lock disabled", "Auto-bloqueo desactivado"));
  });

  container.querySelector("#st-gen-rk")?.addEventListener("click", async () => {
    const cur = (container.querySelector("#st-cur-pwd") as HTMLInputElement | null)?.value || "";
    try {
      lastRecoveryKey = await WritttIPC.generateRecoveryKey(cur);
      showMatzToast(t("Recovery Key gerada! Guarde em local seguro.", "Recovery Key generated!", "Recovery Key generada!"));
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-rk-recover")?.addEventListener("click", async () => {
    const rk = (container.querySelector("#st-rk-input") as HTMLInputElement | null)?.value || "";
    const newPwd = (container.querySelector("#st-new-pwd") as HTMLInputElement | null)?.value || "";
    try {
      await WritttIPC.recoverVaultWithKey(rk, newPwd);
      showMatzToast(t("Cofre recuperado!", "Vault recovered!", "Boveda recuperada!"));
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-setup-totp")?.addEventListener("click", async () => {
    const cur = (container.querySelector("#st-cur-pwd") as HTMLInputElement | null)?.value || "";
    try {
      totpBundle = await WritttIPC.setupVaultTOTP(cur);
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-enable-totp")?.addEventListener("click", async () => {
    const cur = (container.querySelector("#st-cur-pwd") as HTMLInputElement | null)?.value || "";
    const code = (container.querySelector("#st-totp-code") as HTMLInputElement | null)?.value || "";
    try {
      await WritttIPC.enableVaultTOTP(cur, code);
      showMatzToast("TOTP 2FA ativado!");
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-verify-totp")?.addEventListener("click", async () => {
    const code = (container.querySelector("#st-totp-code") as HTMLInputElement | null)?.value || "";
    try {
      const ok = await WritttIPC.verifyVaultTOTP(code);
      showMatzToast(ok ? "TOTP verificado!" : "Codigo rejeitado");
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-disable-totp")?.addEventListener("click", async () => {
    const cur = (container.querySelector("#st-cur-pwd") as HTMLInputElement | null)?.value || "";
    try {
      await WritttIPC.disableVaultTOTP(cur);
      totpBundle = null;
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-copy-totp-sec")?.addEventListener("click", async () => {
    if (!totpBundle) return;
    await navigator.clipboard.writeText(totpBundle.secret_base32).catch(() => {});
    showMatzToast(t("Chave copiada! Cole no seu app autenticador.", "Key copied! Paste into your authenticator app.", "Clave copiada!"));
  });

  container.querySelector("#st-copy-totp-bkp")?.addEventListener("click", async () => {
    if (!totpBundle) return;
    await navigator.clipboard.writeText(totpBundle.backup_codes.join("\n")).catch(() => {});
    showMatzToast(t("Codigos reserva copiados! Guarde em local seguro.", "Backup codes copied! Store them safely.", "Codigos de respaldo copiados!"));
  });
}

function openQuickPinWizardModal(pinEnabled: boolean, onRefreshAll: () => Promise<void>): void {
  const host = document.getElementById("writtt-modal-layer") || document.body;
  const backdrop = document.createElement("div");
  backdrop.className = "writtt-modal-backdrop";
  let step: 1 | 2 = 1;
  let verifiedMasterPwd = "";

  const close = () => {
    window.removeEventListener("keydown", onEsc);
    backdrop.remove();
  };
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  window.addEventListener("keydown", onEsc);

  const renderWizard = () => {
    backdrop.innerHTML = `
      <div class="writtt-modal-panel writtt-onboarding-panel">
        <div class="writtt-modal-header">
          <div class="writtt-modal-title">
            <span class="writtt-accent-icon">${matzIcon("key", 15)}</span>
            <span>${pinEnabled ? t("Alterar PIN Rapido", "Change Quick PIN", "Cambiar PIN") : t("Cadastrar PIN Rapido", "Set Up Quick PIN", "Configurar PIN")}</span>
          </div>
          <button class="writtt-btn" id="pin-wiz-close">ESC</button>
        </div>
        <div class="writtt-modal-body">
          <div class="writtt-chip-row writtt-mb-md">
            <span class="writtt-pill ${step === 1 ? "is-ok" : ""}">1. ${t("Senha Mestra", "Master Password", "Contrasena")}</span>
            <span class="writtt-pill ${step === 2 ? "is-ok" : ""}">2. ${t("Escolher PIN", "Choose PIN", "Elegir PIN")}</span>
          </div>
          ${
            step === 1
              ? `<p class="writtt-card-copy writtt-mb-xs">
                  ${t("Primeiro, confirme sua Senha Mestra atual para autorizar o cadastro do PIN rapido.", "First, confirm your current Master Password to authorize Quick PIN setup.", "Primero confirma tu Contrasena Maestra actual.")}
                </p>
                <input type="password" class="matz-input writtt-mb-md" id="pin-wiz-master" placeholder="${t("Digite sua Senha Mestra...", "Enter your Master Password...", "Contrasena Maestra...")}" />
                <div class="writtt-row-end">
                  <button class="writtt-btn" id="pin-wiz-cancel">${t("Cancelar", "Cancel", "Cancelar")}</button>
                  <button class="matz-btn matz-btn-primary" id="pin-wiz-next">
                    <span>${t("Continuar", "Continue", "Continuar")}</span>
                  </button>
                </div>`
              : `<p class="writtt-card-copy writtt-mb-xs">
                  ${t("Senha Mestra verificada! Agora escolha um PIN numerico de 4 a 8 digitos.", "Master Password verified! Now choose a 4 to 8 digit numeric PIN.", "Contrasena verificada! Elige un PIN de 4 a 8 digitos.")}
                </p>
                <input type="password" class="matz-input writtt-mono writtt-pin-input writtt-mb-xs" id="pin-wiz-pin1" inputmode="numeric" maxlength="8" placeholder="${t("Novo PIN (4 a 8 digitos)...", "New PIN (4-8 digits)...", "Nuevo PIN (4-8 digitos)...")}" />
                <input type="password" class="matz-input writtt-mono writtt-pin-input writtt-mb-md" id="pin-wiz-pin2" inputmode="numeric" maxlength="8" placeholder="${t("Confirmar PIN...", "Confirm PIN...", "Confirmar PIN...")}" />
                <div class="writtt-sidebar-row">
                  <button class="writtt-btn" id="pin-wiz-back">${t("Voltar", "Back", "Volver")}</button>
                  <button class="matz-btn matz-btn-primary" id="pin-wiz-save">
                    ${matzIcon("check", 12)} <span>${t("Salvar PIN Rapido", "Save Quick PIN", "Guardar PIN")}</span>
                  </button>
                </div>`
          }
        </div>
      </div>
    `;

    backdrop.querySelector("#pin-wiz-close")?.addEventListener("click", close);
    backdrop.querySelector("#pin-wiz-cancel")?.addEventListener("click", close);

    if (step === 1) {
      const masterInput = backdrop.querySelector("#pin-wiz-master") as HTMLInputElement | null;
      masterInput?.focus();
      const verifyMaster = () => {
        const pwd = masterInput?.value || "";
        if (!pwd) {
          showMatzToast(t("Digite sua Senha Mestra.", "Enter your Master Password.", "Ingresa tu Contrasena Maestra."));
          return;
        }
        verifiedMasterPwd = pwd;
        step = 2;
        renderWizard();
      };
      backdrop.querySelector("#pin-wiz-next")?.addEventListener("click", () => verifyMaster());
      masterInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") verifyMaster();
      });
    } else {
      const pin1 = backdrop.querySelector("#pin-wiz-pin1") as HTMLInputElement | null;
      const pin2 = backdrop.querySelector("#pin-wiz-pin2") as HTMLInputElement | null;
      pin1?.focus();
      backdrop.querySelector("#pin-wiz-back")?.addEventListener("click", () => {
        step = 1;
        renderWizard();
      });
      const savePin = async () => {
        const p1 = (pin1?.value || "").trim();
        const p2 = (pin2?.value || "").trim();
        if (!/^\d{4,8}$/.test(p1)) {
          showMatzToast(t("O PIN deve conter entre 4 e 8 digitos numericos.", "PIN must be 4 to 8 numeric digits.", "El PIN debe tener entre 4 y 8 digitos."));
          return;
        }
        if (p1 !== p2) {
          showMatzToast(t("Os PINs digitados nao coincidem.", "PINs do not match.", "Los PINs no coinciden."));
          return;
        }
        try {
          await WritttIPC.setVaultPIN(verifiedMasterPwd, p1);
          close();
          showMatzToast(t("PIN rapido cadastrado com sucesso!", "Quick PIN configured!", "PIN configurado!"));
          await onRefreshAll();
        } catch (e: any) {
          showMatzToast(`${e?.message || e}`);
        }
      };
      backdrop.querySelector("#pin-wiz-save")?.addEventListener("click", () => void savePin());
      pin2?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void savePin();
      });
    }
  };

  host.appendChild(backdrop);
  renderWizard();
}
