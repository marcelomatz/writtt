import { matzIcon, showMatzToast } from "@matz/ui";
import { StudioGateway as WritttIPC } from "../../../application/studioGateway";
import { DriveVaultFile, t } from "../../../domain";
import { esc, triggerBase64Download } from "../../dom/domUtils";

let selectedDriveId = "";

export function renderDriveBackupsTab(
  container: HTMLElement,
  driveFiles: DriveVaultFile[],
  onRefreshAll: () => Promise<void>,
  onRerender: () => void
): void {
  const selectedDrive = driveFiles.find((f) => f.id === selectedDriveId) || driveFiles[0] || null;

  container.innerHTML = `
    <h2 class="writtt-section-h2">${t("Cofre de Arquivos Anexos & Backups Completos", "Protected File Locker & Full Library Backups", "Boveda de Archivos y Respaldos")}</h2>
    <p class="writtt-section-lead">${t("Alem dos seus manuscritos, voce pode guardar aqui PDFs de pesquisa, contratos assinados, fotos e capas trancados por senha — ou gerar uma copia de seguranca unica (.writttpack) de toda a sua biblioteca para salvar em um pendrive.", "Beyond your manuscripts, lock research PDFs, signed contracts, reference photos, and cover art here — or export your entire library into a single password-protected backup file (.writttpack) for a USB drive.", "Guarda PDFs de investigacion, contratos o imagenes protegidos con contrasena y exporta toda tu biblioteca en un respaldo unico (.writttpack).")}</p>

    <div class="writtt-card writtt-mb-md">
      <div class="writtt-card-title"><span>${t("Backup Completo da Biblioteca (.writttpack)", "Full Library Backup (.writttpack)", "Respaldo Completo (.writttpack)")}</span></div>
      <p class="writtt-help-note writtt-mb-xs">${t("Reune todas as suas obras em um unico arquivo blindado por uma frase-senha escolhida por voce. Ideal para guardar copia externa ou levar seus textos para outro computador.", "Bundles all your manuscripts into one file protected by a passphrase you choose. Ideal for external USB backups or moving to a new computer.", "Reune todas tus obras en un solo archivo protegido por frase de contrasena.")}</p>
      <div class="writtt-inline-form">
        <input type="password" class="matz-input" id="st-pack-pass" placeholder="${t("Crie ou digite a frase-senha do backup .writttpack...", "Create or enter passphrase for .writttpack backup...", "Frase de contrasena del respaldo...")}" />
        <button class="matz-btn matz-btn-primary" id="st-pack-export">${matzIcon("download", 12)} <span>${t("Exportar Cofre", "Export Archive", "Exportar")}</span></button>
        <button class="writtt-btn" id="st-pack-import">${matzIcon("upload", 12)} <span>${t("Importar Cofre", "Import Archive", "Importar")}</span></button>
      </div>
    </div>

    <div class="writtt-sidebar-row writtt-mb-xs">
      <span class="writtt-nav-label"><b>${t("Arquivos Avulsos Guardados no Cofre", "Individual Files Locked in Vault", "Archivos Guardados en la Boveda")} (${driveFiles.length})</b></span>
      <button class="matz-btn matz-btn-primary writtt-btn-sm" id="st-drive-upload">${matzIcon("upload", 12)} <span>${t("Guardar Novo Arquivo...", "Lock New File...", "Guardar Archivo...")}</span></button>
    </div>

    <div class="writtt-drive-split">
      <div>
        ${
          driveFiles.length === 0
            ? `<div class="writtt-card writtt-empty-card">${t("Nenhum arquivo avulso guardado ainda. Clique em 'Guardar Novo Arquivo' para proteger PDFs, imagens ou documentos.", "No locked files yet. Click 'Lock New File' above to protect PDFs, images, or contracts.", "Aun no hay archivos guardados.")}</div>`
            : driveFiles
                .map(
                  (f) => `
                  <div class="writtt-card writtt-sidebar-row writtt-clickable ${selectedDrive?.id === f.id ? "writtt-active-border" : ""}" data-sdrive="${esc(f.id)}">
                    <div class="writtt-min-w0">
                      <div class="writtt-tree-title">${esc(f.filename)}</div>
                      <div class="writtt-mono writtt-help-note">${f.sizeOriginal}B -> ${f.sizeEncrypted}B · ${f.entropyBits.toFixed(2)} b/B</div>
                    </div>
                    <div class="writtt-row-gap-xs">
                      <button class="writtt-btn" data-sdrive-dec="${esc(f.id)}" title="${t("Destrancar e salvar copia original", "Unlock and save original file", "Guardar copia original")}">${matzIcon("download", 11)}</button>
                      <button class="writtt-btn writtt-btn-danger" data-sdrive-del="${esc(f.id)}" title="${t("Remover do cofre", "Delete from vault", "Eliminar")}">${matzIcon("trash", 11)}</button>
                    </div>
                  </div>`
                )
                .join("")
        }
      </div>
      <div class="writtt-card writtt-help-note">
        <div class="writtt-card-title"><span>${t("Ficha de Blindagem do Arquivo", "File Protection Details", "Detalles de Proteccion")}</span></div>
        ${
          selectedDrive
            ? `<div class="writtt-mono writtt-mb-xs">
                 <div><b>${t("Arquivo", "File", "Archivo")}:</b> ${esc(selectedDrive.filename)}</div>
                 <div><b>${t("Padrao de Cifra", "Cipher", "Cifrado")}:</b> ${esc(selectedDrive.algorithm)}</div>
                 <div><b>${t("Protecao da Senha", "Key Derivation", "Derivacion")}:</b> ${esc(selectedDrive.kdf)}</div>
                 <div><b>SHA-256:</b> ${esc(selectedDrive.sha256Hex.slice(0, 24))}...</div>
                 <div><b>${t("Grau de Embaralhamento", "Scramble Entropy", "Entropia")}:</b> ${selectedDrive.entropyBits.toFixed(2)} / 8.00</div>
               </div>
               <div>${t("Valores proximos de 8.00 confirmam que o arquivo salvo no seu disco esta completamente embaralhado (AES-256) e ilegivel sem sua Senha Mestra.", "Values near 8.00 confirm that the file on disk is completely scrambled (AES-256) and unreadable without your Master Password.", "Valores cercanos a 8.00 confirman que el archivo en disco es completamente ilegible sin tu contrasena.")}</div>`
            : `<div>${t("Selecione um arquivo ao lado para ver como ele esta protegido no seu disco.", "Select a locked file on the left to inspect its disk protection.", "Selecciona un archivo para ver los detalles de su proteccion.")}</div>`
        }
      </div>
    </div>
  `;

  container.querySelector("#st-pack-export")?.addEventListener("click", async () => {
    const pass = (container.querySelector("#st-pack-pass") as HTMLInputElement | null)?.value || "";
    try {
      const savedPath = await WritttIPC.exportWritttPackDialog("Writtt-Vault-Backup", pass);
      if (savedPath) {
        showMatzToast(`.writttpack salvo em: ${savedPath}`);
        return;
      }
    } catch {
      // fallback
    }
    try {
      const res = await WritttIPC.exportWritttPack("Writtt-Vault-Backup", pass);
      triggerBase64Download(res.filename, res.base64Data, "application/zip");
      showMatzToast(`Pacote .writttpack selado (${res.sizeBytes}B)`);
    } catch (e: any) {
      showMatzToast(`${e?.message || e}`);
    }
  });

  container.querySelector("#st-pack-import")?.addEventListener("click", async () => {
    const pass = (container.querySelector("#st-pack-pass") as HTMLInputElement | null)?.value || "";
    try {
      const count = await WritttIPC.importWritttPackDialog(pass);
      if (count > 0) {
        showMatzToast(`${count} documentos importados!`);
        await onRefreshAll();
        return;
      }
    } catch {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".writttpack,.zip";
      inp.onchange = () => {
        const f = inp.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
          try {
            const count = await WritttIPC.importWritttPack(String(r.result || ""), pass);
            showMatzToast(`${count} documentos importados!`);
            await onRefreshAll();
          } catch (e: any) {
            showMatzToast(`${e?.message || e}`);
          }
        };
        r.readAsDataURL(f);
      };
      inp.click();
    }
  });

  container.querySelector("#st-drive-upload")?.addEventListener("click", async () => {
    try {
      const up = await WritttIPC.uploadDriveFileDialog();
      if (up) {
        selectedDriveId = up.id;
        showMatzToast(`${up.filename} selado no Drive E2EE!`);
        await onRefreshAll();
      }
    } catch {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.onchange = () => {
        const f = inp.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
          try {
            const up = await WritttIPC.uploadDriveVaultFile(f.name, f.type || "application/octet-stream", String(r.result || ""));
            selectedDriveId = up.id;
            showMatzToast(`${f.name} selado!`);
            await onRefreshAll();
          } catch (e: any) {
            showMatzToast(`${e?.message || e}`);
          }
        };
        r.readAsDataURL(f);
      };
      inp.click();
    }
  });

  container.querySelectorAll("[data-sdrive]").forEach((el) => {
    el.addEventListener("click", () => {
      selectedDriveId = (el as HTMLElement).dataset.sdrive || "";
      onRerender();
    });
  });

  container.querySelectorAll("[data-sdrive-dec]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.sdriveDec || "";
      try {
        const savedPath = await WritttIPC.saveDecryptedDriveFileDialog(id);
        if (savedPath) showMatzToast(`Salvo em: ${savedPath}`);
      } catch {
        const meta = driveFiles.find((f) => f.id === id);
        const b64 = await WritttIPC.decryptDriveVaultFileBase64(id);
        triggerBase64Download(meta?.filename || "decrypted.bin", b64, meta?.mimeType || "application/octet-stream");
      }
    });
  });

  container.querySelectorAll("[data-sdrive-del]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await WritttIPC.deleteDriveVaultFile((btn as HTMLElement).dataset.sdriveDel || "");
      await onRefreshAll();
    });
  });
}
