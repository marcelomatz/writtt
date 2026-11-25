import { matzIcon } from "@matz/ui";
import { StudioGateway as WritttIPC } from "../../../application/studioGateway";
import { t, TrustedDeviceDTO, WritttAlgorithmsReport, ZKPSoundnessProof } from "../../../domain";
import { esc } from "../../dom/domUtils";

let zkpRound = 0;
let lastZkp: ZKPSoundnessProof | null = null;

export function renderDictionaryTab(
  container: HTMLElement,
  customDictionary: string[],
  onRefreshAll: () => Promise<void>
): void {
  container.innerHTML = `
    <h2 class="writtt-section-h2">${t("Dicionario Pessoal", "Custom Dictionary", "Diccionario Personal")}</h2>
    <p class="writtt-section-lead">${t("Cadastre nomes de personagens, lugares ficticios e termos tecnicos para sua obra.", "Register character names, fictional places and technical terms for your work.", "Registra nombres propios y terminos tecnicos.")}</p>

    <div class="writtt-card">
      <div class="writtt-inline-form writtt-mb-md">
        <input class="matz-input" id="st-dict-in" placeholder="${t("Adicionar nova palavra...", "Add new word...", "Agregar palabra...")}" />
        <button class="matz-btn matz-btn-primary" id="st-dict-add">${matzIcon("plus", 12)} <span>${t("Adicionar", "Add", "Agregar")}</span></button>
      </div>
      <div class="writtt-chip-row">
        ${
          customDictionary.length === 0
            ? `<span class="writtt-help-note">${t("Nenhuma palavra cadastrada.", "No words added yet.", "Aun no hay palabras.")}</span>`
            : customDictionary
                .map(
                  (w) => `<span class="matz-badge writtt-mono writtt-dict-chip">
                    ${esc(w)}
                    <button data-sdict-rm="${esc(w)}" class="writtt-chip-rm">x</button>
                  </span>`
                )
                .join("")
        }
      </div>
    </div>
  `;

  container.querySelector("#st-dict-add")?.addEventListener("click", async () => {
    const w = (container.querySelector("#st-dict-in") as HTMLInputElement | null)?.value || "";
    if (!w.trim()) return;
    await WritttIPC.addDictionaryWord(w.trim());
    await onRefreshAll();
  });

  container.querySelectorAll("[data-sdict-rm]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await WritttIPC.removeDictionaryWord((btn as HTMLElement).dataset.sdictRm || "");
      await onRefreshAll();
    });
  });
}

export function renderAuditDevicesTab(
  container: HTMLElement,
  trustedDevices: TrustedDeviceDTO[],
  algoReport: WritttAlgorithmsReport | null,
  onRefreshAll: () => Promise<void>
): void {
  container.innerHTML = `
    <h2 class="writtt-section-h2">${t("Computadores Autorizados & Historico Antifraude", "Authorized Computers & Tamper-Proof Activity Log", "Equipos Autorizados y Registro Antifraude")}</h2>
    <p class="writtt-section-lead">${t("Veja quais computadores voce autorizou e acompanhe o registro antifraude das acoes importantes feitas nas suas obras. Cada registro recebe um selo matematico encadeado (tecnologia ForensicChain SHA-256): se alguem tentasse apagar ou adulterar uma linha do passado, o sistema detectaria na hora.", "Manage your authorized computers and inspect the tamper-proof activity log of your manuscripts. Every event is mathematically chained (SHA-256 ForensicChain) so any silent alteration to past records is immediately detected.", "Gestiona tus equipos autorizados y revisa el registro antifraude encadenado (SHA-256 ForensicChain) de tus obras.")}</p>

    <div class="writtt-grid-2">
      <div class="writtt-card">
        <div class="writtt-card-title"><span>${t("Meus Computadores Confiaveis", "My Trusted Computers", "Mis Equipos Confiables")}</span><span class="writtt-mono">${trustedDevices.length}</span></div>
        <p class="writtt-help-note writtt-mb-xs">${t("Identifique as maquinas onde voce utiliza seu cofre pessoal (ex.: Notebook Casa, PC Escritorio) e remova estacoes antigas.", "Label the computers where you use your personal vault (e.g. Home Laptop, Office PC) and revoke old machines anytime.", "Identifica los equipos donde usas tu boveda personal.")}</p>
        <div class="writtt-inline-form writtt-mb-xs">
          <input class="matz-input writtt-input-sm" id="st-dev-in" placeholder="${t("Ex.: Notebook Pessoal...", "E.g. Personal Laptop...", "Ej.: Portatil Personal...")}" />
          <button class="writtt-btn" id="st-dev-add">${matzIcon("plus", 11)}</button>
        </div>
        ${trustedDevices
          .map(
            (dv) => `
            <div class="writtt-subcard writtt-sidebar-row">
              <div class="writtt-min-w0">
                <div class="writtt-tree-title">${esc(dv.label)}</div>
                <div class="writtt-mono writtt-help-note">${esc(dv.fingerprint)} · ${esc(dv.platform)}</div>
              </div>
              <button class="writtt-btn writtt-btn-danger" data-sdev-rm="${esc(dv.id)}">${t("Remover", "Revoke", "Quitar")}</button>
            </div>`
          )
          .join("")}
      </div>

      <div class="writtt-card">
        <div class="writtt-card-title">
          <span>${t("Registro Antifraude (ForensicChain SHA-256)", "Tamper-Proof Trail (ForensicChain SHA-256)", "Registro Antifraude (ForensicChain)")}</span>
          <span class="writtt-pill is-ok">${algoReport?.forensicValid !== false ? t("INTEGRO", "INTACT", "INTEGRO") : t("ADULTERADO", "TAMPERED", "ALTERADO")}</span>
        </div>
        <p class="writtt-help-note writtt-mb-xs">${t("Historico local das operacoes (salvamentos, bloqueios e certificados). Abaixo voce tambem pode testar a Verificacao de Posse de Conhecimento Zero (ZKP), que comprova matematicamente sua chave sem exibir sua senha.", "Local history of saves, locks, and certificates. Below you can also run a Zero-Knowledge Ownership Check (ZKP), proving key possession mathematically without exposing your password.", "Historial local de operaciones y prueba matematica de posesion (ZKP) sin exponer tu contrasena.")}</p>
        <div class="writtt-mono writtt-code-box writtt-mb-xs">
          ${(algoReport?.forensicRecords || [])
            .slice(-16)
            .reverse()
            .map(
              (r) => `<div class="writtt-forensic-row"><span class="writtt-accent-tag">#${r.sequence}</span> <span class="is-status-ok">${esc(r.eventName)}</span> ${esc(r.canonicalPayload)}</div>`
            )
            .join("")}
        </div>
        <div class="writtt-row-gap-xs">
          <button class="writtt-btn" id="st-zkp-a">${t("Verificar Posse (Via A)", "Verify Ownership (Path A)", "Verificar Posesion (A)")}</button>
          <button class="writtt-btn" id="st-zkp-b">${t("Verificar Posse (Via B)", "Verify Ownership (Path B)", "Verificar Posesion (B)")}</button>
          ${lastZkp ? `<span class="writtt-mono writtt-accent-tag">${t("Rodada", "Round", "Ronda")} #${lastZkp.round} · ${lastZkp.soundnessConfidence.toFixed(2)}%</span>` : ""}
        </div>
      </div>
    </div>
  `;

  container.querySelector("#st-dev-add")?.addEventListener("click", async () => {
    const l = (container.querySelector("#st-dev-in") as HTMLInputElement | null)?.value || "";
    if (!l.trim()) return;
    await WritttIPC.registerTrustedDevice(l.trim());
    await onRefreshAll();
  });

  container.querySelectorAll("[data-sdev-rm]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await WritttIPC.revokeTrustedDevice((btn as HTMLElement).dataset.sdevRm || "");
      await onRefreshAll();
    });
  });

  const runZkp = async (path: string) => {
    zkpRound++;
    lastZkp = await WritttIPC.simulateZKPRound(zkpRound, path);
    await onRefreshAll();
  };
  container.querySelector("#st-zkp-a")?.addEventListener("click", () => void runZkp("path-A"));
  container.querySelector("#st-zkp-b")?.addEventListener("click", () => void runZkp("path-B"));
}
