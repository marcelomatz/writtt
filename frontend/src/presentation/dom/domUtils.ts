import { showMatzToast } from "@matz/ui";

/**
 * Escapes arbitrary strings for safe interpolation into HTML attributes and text nodes.
 */
export function esc(raw: string): string {
  return (raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Formats an ISO-8601 timestamp into a compact locale-aware date/time string.
 */
export function formatShortDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso.slice(0, 16);
  }
}

/**
 * Triggers a browser Blob download for Base64-encoded artifacts when running outside native Wails dialogs.
 */
export function triggerBase64Download(
  filename: string,
  base64Data: string,
  mimeType = "application/octet-stream"
): void {
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e: any) {
    showMatzToast(`Download error: ${e?.message || e}`);
  }
}

/**
 * Wires drag-to-resize behavior onto a vertical splitter handle between panels.
 */
export function bindHorizontalResizer(options: {
  resizerEl: HTMLElement | null;
  targetEl: HTMLElement | null;
  cssVarName: string;
  minPx: number;
  maxPx: number;
  side: "left" | "right";
}): void {
  const { resizerEl, targetEl, cssVarName, minPx, maxPx, side } = options;
  if (!resizerEl || !targetEl) return;

  resizerEl.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    const startX = ev.clientX;
    const startWidth = targetEl.getBoundingClientRect().width || minPx;
    resizerEl.classList.add("is-dragging");
    const onMove = (m: MouseEvent) => {
      const delta = side === "left" ? m.clientX - startX : startX - m.clientX;
      const clamped = Math.max(minPx, Math.min(maxPx, Math.round(startWidth + delta)));
      targetEl.style.width = `${clamped}px`;
      document.documentElement.style.setProperty(cssVarName, `${clamped}px`);
    };
    const onUp = () => {
      resizerEl.classList.remove("is-dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

/**
 * Mounts a single delegated, viewport-clamped hover tooltip overlay for editor toolbars
 * (`[data-tip]`, `.writtt-bubble-menu [title]`, `.writtt-table-bar [title]`) so descriptions
 * appear cleanly on mouse hover without clipping inside `overflow: hidden` containers.
 */
export function bindViewportHoverTooltips(): void {
  if (document.getElementById("writtt-hover-tooltip")) return;

  const tipEl = document.createElement("div");
  tipEl.id = "writtt-hover-tooltip";
  tipEl.className = "writtt-hover-tooltip";
  tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);

  let activeTarget: HTMLElement | null = null;

  const hideTip = () => {
    activeTarget = null;
    tipEl.classList.remove("is-visible");
  };

  const resolveTipHost = (node: EventTarget | null): HTMLElement | null => {
    if (!(node instanceof HTMLElement)) return null;
    const explicit = node.closest("[data-tip]") as HTMLElement | null;
    if (explicit) return explicit;
    const toolbarTitled = node.closest(
      ".writtt-bubble-menu [title], .writtt-table-bar [title]"
    ) as HTMLElement | null;
    if (toolbarTitled) {
      const tVal = toolbarTitled.getAttribute("title") || "";
      if (tVal) {
        toolbarTitled.setAttribute("data-tip", tVal);
        toolbarTitled.setAttribute("aria-label", tVal);
        toolbarTitled.removeAttribute("title");
        return toolbarTitled;
      }
    }
    return null;
  };

  document.addEventListener(
    "mouseover",
    (ev) => {
      const host = resolveTipHost(ev.target);
      if (!host) {
        if (activeTarget) hideTip();
        return;
      }
      if (host.hasAttribute("title")) {
        host.setAttribute("aria-label", host.getAttribute("title") || "");
        host.removeAttribute("title");
      }
      const text = (host.getAttribute("data-tip") || "").trim();
      if (!text) {
        hideTip();
        return;
      }

      activeTarget = host;
      tipEl.textContent = text;
      tipEl.classList.add("is-visible");

      const rect = host.getBoundingClientRect();
      const tipW = tipEl.offsetWidth || 180;
      const tipH = tipEl.offsetHeight || 28;
      const pad = 8;

      const centerLeft = rect.left + rect.width / 2 - tipW / 2;
      const clampedLeft = Math.round(
        Math.max(pad, Math.min(window.innerWidth - tipW - pad, centerLeft))
      );
      const preferBelow = rect.bottom + 7;
      const top =
        preferBelow + tipH <= window.innerHeight - pad
          ? Math.round(preferBelow)
          : Math.max(pad, Math.round(rect.top - tipH - 7));

      tipEl.style.left = `${clampedLeft}px`;
      tipEl.style.top = `${top}px`;
    },
    { passive: true }
  );

  document.addEventListener("mousedown", hideTip, { passive: true });
  document.addEventListener("keydown", hideTip, { passive: true });
  window.addEventListener("scroll", hideTip, { capture: true, passive: true });
  window.addEventListener("blur", hideTip);
}
