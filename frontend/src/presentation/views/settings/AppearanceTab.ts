import {
  applyMatzThemeFamily,
  getMatzActiveThemeFamily,
  getMatzThemeMode,
  MATZ_THEME_FAMILIES,
  matzIcon,
  MatzThemeFamilyId,
  setMatzThemeMode,
} from "@matz/ui";
import { EditorialPreferences, ReleaseUpdateDTO, t } from "../../../domain";
import { esc } from "../../dom/domUtils";

export function renderAppearanceTab(
  container: HTMLElement,
  prefs: EditorialPreferences,
  updateInfo: ReleaseUpdateDTO | null,
  onUpdatePrefs: (patch: Partial<EditorialPreferences>) => void,
  onRerender: () => void,
  onCheckUpdatesNow?: () => Promise<void>,
  onOpenUpdateDownload?: () => void
): void {
  const activeFamily = getMatzActiveThemeFamily();
  const activeMode = getMatzThemeMode();

  container.innerHTML = `
    <h2 class="writtt-section-h2">${t("Aparencia, Temas de Cores & Escrita", "Appearance, Color Themes & Writing", "Apariencia, Temas y Escritura")}</h2>
    <p class="writtt-section-lead">${t("Escolha o tema de cores da interface, modo escuro/claro, tipografia e conforto visual.", "Choose your UI color theme, dark/light mode, typography and visual comfort.", "Elige el tema de colores, modo oscuro/claro y tipografia.")}</p>

    <div class="writtt-card">
      <div class="writtt-card-title">
        <span>${t("Modo & Paleta de Cores da Interface (@matz/ui)", "Interface Mode & Color Themes (@matz/ui)", "Modo y Temas de Colores")}</span>
        <div class="writtt-row-gap-xs">
          <button class="writtt-btn writtt-btn-xs ${activeMode === "dark" ? "is-active" : ""}" data-tmode="dark">${matzIcon("moon", 11)} Dark</button>
          <button class="writtt-btn writtt-btn-xs ${activeMode === "light" ? "is-active" : ""}" data-tmode="light">${matzIcon("sun", 11)} Light</button>
        </div>
      </div>
      <div class="writtt-theme-grid">
        ${MATZ_THEME_FAMILIES.filter((f) => f.id !== "custom")
          .map((fam) => {
            const pal = activeMode === "dark" ? fam.darkColors : fam.lightColors;
            const isSelected = activeFamily === fam.id;
            return `
              <button class="writtt-theme-card ${isSelected ? "is-active" : ""}" data-tfamily="${fam.id}">
                <div class="writtt-sidebar-row">
                  <div class="writtt-swatch-row">
                    <span class="writtt-swatch" style="background:${pal.bgPrimary};"></span>
                    <span class="writtt-swatch" style="background:${pal.bgSecondary};"></span>
                    <span class="writtt-swatch" style="background:${pal.accent};"></span>
                  </div>
                  ${isSelected ? `<span class="writtt-accent-icon">${matzIcon("check", 12)}</span>` : ""}
                </div>
                <div class="writtt-theme-name">${esc(fam.name.split("—")[0].trim())}</div>
              </button>`;
          })
          .join("")}
      </div>
    </div>

    <div class="writtt-card">
      <div class="writtt-card-title"><span>${t("Tipografia & Pagina do Editor", "Editor Typography & Page", "Tipografia y Pagina")}</span></div>
      <div class="writtt-grid-2 writtt-mb-md">
        <div>
          <label class="writtt-field-label">${t("Familia Tipografica", "Font Family", "Fuente")}</label>
          <select class="matz-select" id="st-font">
            <option value="serif" ${prefs.fontFamily === "serif" ? "selected" : ""}>Serif (Editorial / Livro)</option>
            <option value="sans" ${prefs.fontFamily === "sans" ? "selected" : ""}>Sans (Limpa / Moderna)</option>
            <option value="mono" ${prefs.fontFamily === "mono" ? "selected" : ""}>Monospace (Tecnica)</option>
          </select>
        </div>
        <div>
          <label class="writtt-field-label">${t("Largura da Coluna de Texto", "Page Column Width", "Ancho de Pagina")}</label>
          <select class="matz-select" id="st-width">
            <option value="focused" ${prefs.pageWidth === "focused" ? "selected" : ""}>${t("Focado (660px)", "Focused (660px)", "Enfocado (660px)")}</option>
            <option value="comfortable" ${prefs.pageWidth === "comfortable" ? "selected" : ""}>${t("Confortavel (780px)", "Comfortable (780px)", "Comodo (780px)")}</option>
            <option value="wide" ${prefs.pageWidth === "wide" ? "selected" : ""}>${t("Amplo (1060px)", "Wide (1060px)", "Amplio (1060px)")}</option>
          </select>
        </div>
      </div>

      <div class="writtt-grid-2 writtt-mb-md">
        <div>
          <label class="writtt-field-label writtt-sidebar-row">
            <span>${t("Tamanho do Texto", "Font Size", "Tamano de Texto")}</span>
            <b class="writtt-mono">${prefs.fontSize}px</b>
          </label>
          <input type="range" id="st-fontsize" min="14" max="20" value="${prefs.fontSize}" class="writtt-full-range" />
        </div>
        <div>
          <label class="writtt-field-label writtt-sidebar-row">
            <span>${t("Iluminacao Adaptativa (Brilho)", "Adaptive Lighting (Brightness)", "Iluminacion Adaptativa (Brillo)")}</span>
            <b class="writtt-mono">${prefs.brightness}%</b>
          </label>
          <input type="range" id="st-brightness" min="70" max="110" value="${prefs.brightness}" class="writtt-full-range writtt-mb-xs" />
          <div class="writtt-chip-row">
            <button type="button" class="writtt-btn writtt-btn-xs ${prefs.brightness === 80 ? "is-active" : ""}" data-bpreset="80">${t("Suave Noturno (80%)", "Soft Night (80%)", "Nocturno Suave (80%)")}</button>
            <button type="button" class="writtt-btn writtt-btn-xs ${prefs.brightness === 100 ? "is-active" : ""}" data-bpreset="100">${t("Natural (100%)", "Natural (100%)", "Natural (100%)")}</button>
            <button type="button" class="writtt-btn writtt-btn-xs ${prefs.brightness === 108 ? "is-active" : ""}" data-bpreset="108">${t("Vivido (108%)", "Vivid (108%)", "Vivido (108%)")}</button>
          </div>
        </div>
      </div>

      <div class="writtt-grid-2">
        <div>
          <label class="writtt-field-label">${t("Meta de Palavras por Obra", "Word Goal per Manuscript", "Meta de Palabras")}</label>
          <input type="number" class="matz-input writtt-mono" id="st-wordgoal" min="100" step="100" value="${prefs.wordGoal}" />
        </div>
        <div class="writtt-stack-sm writtt-mt-xs">
          <label class="writtt-check-label">
            <input type="checkbox" id="st-autosave" ${prefs.autoSave ? "checked" : ""} />
            <span>${t("Auto-Save silencioso (1.4s)", "Silent Auto-Save (1.4s)", "Auto-guardado silencioso")}</span>
          </label>
          <label class="writtt-check-label">
            <input type="checkbox" id="st-focusmode" ${prefs.focusMode ? "checked" : ""} />
            <span>${t("Modo Foco de Paragrafo (esmaece blocos inativos)", "Paragraph Focus Mode (dims inactive blocks)", "Modo Enfoque de Parrafo")}</span>
          </label>
        </div>
      </div>
    </div>

    <div class="writtt-card">
      <div class="writtt-card-title">
        <span>${t("Organizacao da Tela Inicial", "Home Screen Layout", "Organizacion de la Pantalla de Inicio")}</span>
        ${matzIcon("home", 12)}
      </div>
      <p class="writtt-help-note writtt-mb-xs">
        ${t(
          "Escolha quais blocos informativos aparecem na Tela Inicial. Se voce ocultou o cabecalho ou os recursos para deixar a mesa de entrada mais limpa, basta reativa-los aqui.",
          "Choose which informational panels appear on the Home screen. Re-enable hidden sections anytime for a fuller or cleaner start view.",
          "Elige que bloques informativos se muestran en la pantalla de Inicio. Puedes ocultarlos o reactivarlos cuando quieras."
        )}
      </p>
      <div class="writtt-stack-sm">
        <label class="writtt-check-label">
          <input type="checkbox" id="st-home-header" ${prefs.showHomeHeader !== false ? "checked" : ""} />
          <span>${t("Exibir cabecalho de boas-vindas e resumo de privacidade na Tela Inicial", "Show welcome header and privacy status summary on Home screen", "Mostrar encabezado de bienvenida en Inicio")}</span>
        </label>
        <label class="writtt-check-label">
          <input type="checkbox" id="st-home-caps" ${prefs.showHomeCapabilities !== false ? "checked" : ""} />
          <span>${t("Exibir painel 'Recursos do Estudio & Ferramentas Disponiveis' na Tela Inicial", "Show 'Studio Capabilities & Tools' panel on Home screen", "Mostrar panel 'Recursos del Estudio' en Inicio")}</span>
        </label>
      </div>
    </div>

    <div class="writtt-card">
      <div class="writtt-card-title">
        <span>${t("Atualizacoes do Writtt", "Writtt Software Updates", "Actualizaciones de Writtt")}</span>
        <span class="writtt-pill ${updateInfo?.hasUpdate ? "is-ok" : ""} writtt-mono">
          ${
            updateInfo?.hasUpdate
              ? `${t("NOVA VERSAO", "NEW RELEASE", "NUEVA VERSION")}: ${esc(updateInfo.latestVersion)}`
              : `v${esc((updateInfo?.currentVersion || "0.2.0").replace(/^v/i, ""))}`
          }
        </span>
      </div>
      <p class="writtt-help-note writtt-mb-xs">
        ${t(
          "O Writtt verifica apenas o manifesto publico de versao oficial (sem enviar nenhum dado ou texto seu). Quando houver uma versao mais recente disponivel para download, voce recebera um aviso discreto no topo da janela.",
          "Writtt checks only the public release version manifest (sending zero personal or manuscript data). Whenever a newer release is available for download, a discreet badge appears in the top bar.",
          "Writtt consulta unicamente el manifiesto publico de version sin enviar datos personales. Si hay una nueva version disponible, veras un aviso en la barra superior."
        )}
      </p>
      <div class="writtt-stack-sm writtt-mb-xs">
        <label class="writtt-check-label">
          <input type="checkbox" id="st-auto-updates" ${prefs.checkUpdatesAutomatically !== false ? "checked" : ""} />
          <span>${t("Avisar automaticamente quando uma nova versao do Writtt estiver disponivel", "Automatically notify when a new version of Writtt is available", "Avisar automaticamente cuando haya una nueva version disponible")}</span>
        </label>
      </div>
      <div class="writtt-inline-form">
        <button type="button" class="writtt-btn" id="st-check-updates">
          ${matzIcon("refresh", 12)} <span>${t("Verificar Nova Versao Agora", "Check for Updates Now", "Buscar Actualizaciones Ahora")}</span>
        </button>
        ${
          updateInfo?.hasUpdate
            ? `<button type="button" class="matz-btn matz-btn-primary" id="st-open-update-dl">
                ${matzIcon("download", 12)} <span>${t("Baixar", "Download", "Descargar")} ${esc(updateInfo.latestVersion)}</span>
              </button>`
            : ""
        }
      </div>
    </div>
  `;

  container.querySelectorAll("[data-tmode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = ((btn as HTMLElement).dataset.tmode as "dark" | "light") || "dark";
      setMatzThemeMode(m);
      onRerender();
    });
  });

  container.querySelectorAll("[data-tfamily]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fam = (btn as HTMLElement).dataset.tfamily as MatzThemeFamilyId;
      if (fam) {
        applyMatzThemeFamily(fam, undefined, getMatzThemeMode());
        onRerender();
      }
    });
  });

  (container.querySelector("#st-font") as HTMLSelectElement | null)?.addEventListener("change", (e) => {
    onUpdatePrefs({ fontFamily: (e.target as HTMLSelectElement).value as any });
  });
  (container.querySelector("#st-width") as HTMLSelectElement | null)?.addEventListener("change", (e) => {
    onUpdatePrefs({ pageWidth: (e.target as HTMLSelectElement).value as any });
  });
  (container.querySelector("#st-fontsize") as HTMLInputElement | null)?.addEventListener("input", (e) => {
    onUpdatePrefs({ fontSize: Number((e.target as HTMLInputElement).value) });
  });
  (container.querySelector("#st-brightness") as HTMLInputElement | null)?.addEventListener("input", (e) => {
    onUpdatePrefs({ brightness: Number((e.target as HTMLInputElement).value) });
  });
  container.querySelectorAll("[data-bpreset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = Number((btn as HTMLElement).dataset.bpreset || 100);
      onUpdatePrefs({ brightness: val });
      onRerender();
    });
  });
  (container.querySelector("#st-wordgoal") as HTMLInputElement | null)?.addEventListener("change", (e) => {
    onUpdatePrefs({ wordGoal: Math.max(100, Number((e.target as HTMLInputElement).value) || 1000) });
  });
  (container.querySelector("#st-autosave") as HTMLInputElement | null)?.addEventListener("change", (e) => {
    onUpdatePrefs({ autoSave: (e.target as HTMLInputElement).checked });
  });
  (container.querySelector("#st-focusmode") as HTMLInputElement | null)?.addEventListener("change", (e) => {
    onUpdatePrefs({ focusMode: (e.target as HTMLInputElement).checked });
  });
  (container.querySelector("#st-home-header") as HTMLInputElement | null)?.addEventListener("change", (e) => {
    onUpdatePrefs({ showHomeHeader: (e.target as HTMLInputElement).checked });
  });
  (container.querySelector("#st-home-caps") as HTMLInputElement | null)?.addEventListener("change", (e) => {
    onUpdatePrefs({ showHomeCapabilities: (e.target as HTMLInputElement).checked });
  });
  (container.querySelector("#st-auto-updates") as HTMLInputElement | null)?.addEventListener("change", (e) => {
    onUpdatePrefs({ checkUpdatesAutomatically: (e.target as HTMLInputElement).checked });
  });
  container.querySelector("#st-check-updates")?.addEventListener("click", () => {
    void onCheckUpdatesNow?.();
  });
  container.querySelector("#st-open-update-dl")?.addEventListener("click", () => {
    onOpenUpdateDownload?.();
  });
}
