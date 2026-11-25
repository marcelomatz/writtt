import { matzIcon, showMatzToast } from "@matz/ui";
import { StudioGateway as WritttIPC } from "../../../application/studioGateway";
import { AliasConfigDTO, ExpressMessageDTO, SearchResult, SecurityConfigDTO, t } from "../../../domain";
import { esc } from "../../dom/domUtils";

let selectedExpress: ExpressMessageDTO | null = null;

export function renderExpressIdentityTab(
  container: HTMLElement,
  cfg: SecurityConfigDTO,
  aliasConfig: AliasConfigDTO,
  docs: SearchResult[],
  expressInbox: ExpressMessageDTO[],
  onRefreshAll: () => Promise<void>,
  onOpenDoc?: (id: string) => void
): void {
  container.innerHTML = `
    <h2 class="writtt-section-h2">${t("Identidade do Autor & Envelopes Lacrados (Writtt Express)", "Author Identity & Sealed Envelopes (Writtt Express)", "Identidad y Sobres Sellados")}</h2>
    <p class="writtt-section-lead">
      ${t("Sua identidade (@alias) assina seus Certificados de Autoria. Ja o Envelope Lacrado cria uma capsula criptografada a partir de uma nota ou de um manuscrito seu — ideal para guardar trechos confidenciais, sinopses ou enviar provas fechadas que so podem ser abertas com sua chave privada.", "Your author @alias signs Authorship Certificates. Sealed Envelopes wrap a note or manuscript inside a tamper-proof cryptographic capsule that only your private key can open.", "Tu @alias firma Certificados de Autoria y los Sobres Sellados protegen trechos o manuscritos completos.")}
    </p>

    <div class="writtt-grid-2">
      <div class="writtt-card">
        <div class="writtt-card-title"><span>${t("Identidade & Selar Manuscrito/Nota", "Identity & Seal Manuscript/Note", "Identidad y Sellar Sobre")}</span></div>
        <div class="writtt-mono writtt-help-note writtt-mb-xs">ID Chave Publica: <b class="writtt-accent-tag">${esc(cfg.rsa_fingerprint || "READY")}</b></div>
        <div class="writtt-inline-form writtt-mb-xs">
          <input class="matz-input writtt-mono writtt-input-sm" id="st-alias-in" value="${esc(aliasConfig.alias)}" />
          <button class="writtt-btn" id="st-alias-save">${t("Salvar @alias", "Save @alias", "Guardar")}</button>
        </div>
        <div class="writtt-inline-form writtt-mb-xs">
          <select class="matz-select writtt-input-sm" id="st-exp-doc-pick">
            <option value="">${t("Opcional: carregar texto de uma obra...", "Optional: load text from a manuscript...", "Cargar de una obra...")}</option>
            ${docs.map((d) => `<option value="${esc(d.id)}">${esc(d.title)}</option>`).join("")}
          </select>
          <button class="writtt-btn" id="st-exp-load-doc">${t("Carregar", "Load", "Cargar")}</button>
        </div>
        <input class="matz-input writtt-input-sm writtt-mb-xs" id="st-exp-subj" placeholder="${t("Titulo ou assunto do envelope...", "Envelope title or subject...", "Asunto...")}" />
        <textarea class="matz-input writtt-ai-edit-ta writtt-mb-xs" id="st-exp-body" rows="4" placeholder="${t("Cole um trecho confidencial ou carregue uma obra acima para lacrar...", "Paste confidential text or load a manuscript above to seal...", "Texto confidencial...")}"></textarea>
        <button class="matz-btn matz-btn-primary writtt-full-btn" id="st-exp-send">${matzIcon("send", 12)} <span>${t("Lacrar Envelope Protegido", "Seal Protected Envelope", "Sellar Sobre")}</span></button>
      </div>

      <div class="writtt-card">
        <div class="writtt-card-title"><span>${t("Envelopes Lacrados", "Sealed Envelopes", "Sobres Sellados")} (${expressInbox.length})</span></div>
        ${
          expressInbox.length === 0
            ? `<div class="writtt-help-note">${t("Nenhum envelope lacrado ainda. Carregue uma obra ao lado para testar.", "No sealed envelopes yet. Load a manuscript on the left to create one.", "Sin sobres sellados.")}</div>`
            : expressInbox
                .map(
                  (m) => `
                  <div class="writtt-subcard">
                    <div class="writtt-sidebar-row">
                      <span class="writtt-tree-title">${esc(m.subject)}</span>
                      <span class="writtt-mono writtt-help-note">${esc(m.senderAlias)}</span>
                    </div>
                    <div class="writtt-inline-form writtt-mt-xs">
                      <button class="writtt-btn writtt-flex-1" data-sexp-open="${esc(m.id)}">${matzIcon("unlock", 11)} <span>${t("Abrir Envelope", "Unseal", "Abrir")}</span></button>
                      <button class="writtt-btn writtt-btn-danger" data-sexp-del="${esc(m.id)}">${matzIcon("trash", 11)}</button>
                    </div>
                  </div>`
                )
                .join("")
        }
        ${
          selectedExpress?.decryptedBody
            ? `<div class="writtt-ai-deliverable-box writtt-mt-xs">
                <div class="writtt-sidebar-row writtt-mb-xs">
                  <span class="writtt-accent-tag">ABERTO: ${esc(selectedExpress.subject)}</span>
                  <button class="writtt-btn writtt-btn-xs" id="st-exp-to-doc">${matzIcon("plus", 10)} <span>${t("Importar como Obra", "Import as Manuscript", "Importar")}</span></button>
                </div>
                <div class="writtt-ai-deliverable-text">${esc(selectedExpress.decryptedBody)}</div>
              </div>`
            : ""
        }
      </div>
    </div>
  `;

  container.querySelector("#st-exp-load-doc")?.addEventListener("click", async () => {
    const docId = (container.querySelector("#st-exp-doc-pick") as HTMLSelectElement | null)?.value || "";
    if (!docId) return;
    try {
      const doc = await WritttIPC.readDocument(docId, true);
      if (doc.frontmatter?.encrypted) {
        showMatzToast(t("Desbloqueie o cofre primeiro para carregar esta obra.", "Unlock the vault first to load this manuscript.", "Desbloquea la boveda primero."));
        return;
      }
      const subjEl = container.querySelector("#st-exp-subj") as HTMLInputElement | null;
      const bodyEl = container.querySelector("#st-exp-body") as HTMLTextAreaElement | null;
      if (subjEl) subjEl.value = doc.frontmatter?.title || "Manuscrito";
      if (bodyEl) bodyEl.value = doc.content || "";
      showMatzToast(t("Obra carregada no envelope!", "Manuscript loaded into envelope!", "Obra cargada!"));
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-exp-to-doc")?.addEventListener("click", async () => {
    if (!selectedExpress?.decryptedBody) return;
    try {
      const newId = await WritttIPC.importDocumentContent(
        `${selectedExpress.subject || "envelope"}.md`,
        selectedExpress.decryptedBody,
        false
      );
      await onRefreshAll();
      showMatzToast(t("Envelope importado como novo manuscrito!", "Envelope imported as new manuscript!", "Importado como obra!"));
      if (newId && onOpenDoc) onOpenDoc(newId);
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-alias-save")?.addEventListener("click", async () => {
    const h = (container.querySelector("#st-alias-in") as HTMLInputElement | null)?.value || "";
    try {
      await WritttIPC.setOperatorAlias(h);
      showMatzToast("Alias atualizado!");
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-exp-send")?.addEventListener("click", async () => {
    const subj = (container.querySelector("#st-exp-subj") as HTMLInputElement | null)?.value || "Sealed Drop";
    const body = (container.querySelector("#st-exp-body") as HTMLTextAreaElement | null)?.value || "";
    if (!body.trim()) return;
    try {
      await WritttIPC.sendExpressEnvelope(aliasConfig.alias || "@operator", subj, body, "");
      showMatzToast("Envelope RSA-2048 OAEP selado!");
      await onRefreshAll();
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelectorAll("[data-sexp-open]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      selectedExpress = await WritttIPC.unsealExpressMessage((btn as HTMLElement).dataset.sexpOpen || "");
      await onRefreshAll();
    });
  });

  container.querySelectorAll("[data-sexp-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = (btn as HTMLElement).dataset.sexpDel || "";
      await WritttIPC.deleteExpressMessage(id);
      if (selectedExpress?.id === id) selectedExpress = null;
      await onRefreshAll();
    });
  });
}
