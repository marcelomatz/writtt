import { matzIcon, showMatzToast } from "@matz/ui";
import { StudioGateway as WritttIPC } from "../../application/studioGateway";
import { markOnboardingDone } from "../../application/storageStore";
import { t } from "../../domain";

export function openOnboardingModal(
  host: HTMLElement,
  onComplete: () => Promise<void>
): void {
  const backdrop = document.createElement("div");
  backdrop.className = "writtt-modal-backdrop writtt-onboarding-backdrop";

  backdrop.innerHTML = `
    <div class="writtt-modal-panel writtt-onboarding-panel">
      <div class="writtt-modal-header">
        <div class="writtt-modal-title">
          <span class="writtt-accent-icon">${matzIcon("shield", 16)}</span>
          <span>${t("Bem-vindo ao Writtt", "Welcome to Writtt", "Bienvenido a Writtt")}</span>
        </div>
        <button class="writtt-btn writtt-btn-ghost" id="ob-skip">
          ${t("Configurar depois", "Skip for now", "Omitir")}
        </button>
      </div>

      <div class="writtt-modal-body">
        <p class="writtt-section-lead">
          ${t(
            "Antes de comecar a escrever, defina sua identidade de autor. Ela sera usada nos seus Certificados de Autoria e envelopes lacrados. Tudo fica salvo apenas neste computador.",
            "Before you start writing, set up your author identity. It is used in your Pre-Publication Authorship Certificates and sealed envelopes. Everything stays strictly on this computer.",
            "Antes de comenzar a escribir, define tu identidad de autor. Todo se guarda solo en este equipo."
          )}
        </p>

        <div class="writtt-card">
          <div class="writtt-card-title">
            <span>1. ${t("Sua Identidade de Autor (@alias)", "Your Author Identity (@alias)", "Tu Identidad de Autor (@alias)")}</span>
          </div>
          <input class="matz-input writtt-mono writtt-mb-xs" id="ob-alias" placeholder="@seu-nome" />
          <div class="writtt-help-note">
            ${t("Ex.: @maria.silva ou @autor-principal. Usado para assinar provas de autoria das suas obras.", "E.g. @jane.doe - used to sign authorship proofs for your manuscripts.", "Ej.: @juan.perez - usado para firmar pruebas de autoria.")}
          </div>
        </div>

        <div class="writtt-card">
          <div class="writtt-card-title">
            <span>2. ${t("Senha Mestra do Cofre (Opcional)", "Vault Master Password (Optional)", "Contrasena Maestra (Opcional)")}</span>
          </div>
          <input type="password" class="matz-input writtt-mb-xs" id="ob-pwd" placeholder="${t("Crie uma senha forte (ou deixe em branco para configurar depois)", "Create a strong password (or leave blank for later)", "Crea una contrasena fuerte (opcional)")}" />
          <input type="password" class="matz-input writtt-mb-xs" id="ob-pwd-confirm" placeholder="${t("Confirmar senha...", "Confirm password...", "Confirmar contrasena...")}" />
          <div class="writtt-help-note">
            ${t("Com a Senha Mestra voce pode trancar obras ineditas no Cofre e depois ativar um PIN rapido.", "With a Master Password you can lock unpublished works in the Vault and enable a Quick PIN later.", "Con una Contrasena Maestra puedes bloquear obras en la Boveda.")}
          </div>
        </div>

        <div class="writtt-row-end">
          <button class="matz-btn matz-btn-primary" id="ob-finish">
            ${matzIcon("check", 13)} <span>${t("Salvar Identidade e Comecar", "Save Identity & Start Writing", "Guardar y Comenzar")}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  host.appendChild(backdrop);

  const close = () => {
    markOnboardingDone();
    backdrop.remove();
  };

  backdrop.querySelector("#ob-skip")?.addEventListener("click", close);

  backdrop.querySelector("#ob-finish")?.addEventListener("click", async () => {
    const rawAlias = (backdrop.querySelector("#ob-alias") as HTMLInputElement | null)?.value.trim() || "";
    const pwd = (backdrop.querySelector("#ob-pwd") as HTMLInputElement | null)?.value || "";
    const pwdConfirm = (backdrop.querySelector("#ob-pwd-confirm") as HTMLInputElement | null)?.value || "";

    if (pwd && pwd !== pwdConfirm) {
      showMatzToast(t("As senhas nao coincidem.", "Passwords do not match.", "Las contrasenas no coinciden."));
      return;
    }
    if (pwd && pwd.length < 6) {
      showMatzToast(t("A senha mestra deve ter pelo menos 6 caracteres.", "Master password must be at least 6 characters.", "La contrasena debe tener al menos 6 caracteres."));
      return;
    }

    try {
      if (rawAlias) {
        const formatted = rawAlias.startsWith("@") ? rawAlias : `@${rawAlias}`;
        await WritttIPC.setOperatorAlias(formatted);
      }
      if (pwd) {
        await WritttIPC.setPassword("", pwd);
      }
      close();
      await onComplete();
      showMatzToast(t("Identidade configurada! Bom trabalho nas suas obras.", "Identity configured! Happy writing.", "Identidad configurada!"));
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  (backdrop.querySelector("#ob-alias") as HTMLInputElement | null)?.focus();
}
