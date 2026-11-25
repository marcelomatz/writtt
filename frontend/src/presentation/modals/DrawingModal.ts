import { matzIcon } from "@matz/ui";
import { DrawingPoint, DrawingStroke, renderDrawingStrokesToSVG, t } from "../../domain";

export function openDrawingModal(
  host: HTMLElement,
  onInsertSvg: (svgMarkup: string) => void
): () => void {
  let tool: "pen" | "line" | "rect" | "circle" = "pen";
  let color = "#38bdf8";
  let strokes: DrawingStroke[] = [];
  let current: DrawingStroke | null = null;

  const overlay = document.createElement("div");
  overlay.className = "writtt-modal-backdrop";

  const close = () => {
    window.removeEventListener("keydown", onEsc);
    overlay.remove();
  };

  const onEsc = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  window.addEventListener("keydown", onEsc);

  overlay.innerHTML = `
    <div class="writtt-modal-panel writtt-drawing-panel">
      <div class="writtt-modal-header">
        <span class="writtt-modal-title">
          ${matzIcon("edit", 14)} ${t("Quadro de Desenho Vetorial SVG", "Vector SVG Drawing Canvas", "Lienzo Vectorial SVG")}
        </span>
        <button class="writtt-btn" data-draw-close>ESC</button>
      </div>
      <div class="writtt-modal-body">
        <div class="writtt-drawing-toolbar">
          <button class="writtt-btn is-active" data-draw-tool="pen">Pen</button>
          <button class="writtt-btn" data-draw-tool="line">Line</button>
          <button class="writtt-btn" data-draw-tool="rect">Rect</button>
          <button class="writtt-btn" data-draw-tool="circle">Circle</button>
          <input type="color" data-draw-color value="${color}" class="writtt-color-picker" />
          <button class="writtt-btn" data-draw-undo>${t("Desfazer", "Undo", "Deshacer")}</button>
          <button class="writtt-btn" data-draw-clear>${t("Limpar", "Clear", "Limpiar")}</button>
          <button class="matz-btn matz-btn-primary writtt-btn-sm writtt-ml-auto" data-draw-insert>
            ${matzIcon("check", 12)} <span>${t("Inserir no Documento", "Insert into Document", "Insertar")}</span>
          </button>
        </div>
        <canvas data-draw-canvas width="590" height="280" class="writtt-drawing-canvas"></canvas>
      </div>
    </div>
  `;

  host.appendChild(overlay);

  const canvas = overlay.querySelector("[data-draw-canvas]") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(9, 11, 16, 0.94)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    const all = current ? [...strokes, current] : strokes;
    for (const s of all) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (s.tool === "pen") {
        s.points.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      } else if (s.tool === "line" && s.points.length >= 2) {
        ctx.moveTo(s.points[0].x, s.points[0].y);
        ctx.lineTo(s.points[s.points.length - 1].x, s.points[s.points.length - 1].y);
        ctx.stroke();
      } else if (s.tool === "rect" && s.points.length >= 2) {
        const p0 = s.points[0];
        const p1 = s.points[s.points.length - 1];
        ctx.strokeRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
      } else if (s.tool === "circle" && s.points.length >= 2) {
        const p0 = s.points[0];
        const p1 = s.points[s.points.length - 1];
        ctx.arc(p0.x, p0.y, Math.hypot(p1.x - p0.x, p1.y - p0.y), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };

  redraw();

  const toPt = (ev: MouseEvent): DrawingPoint => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * canvas.width,
      y: ((ev.clientY - r.top) / r.height) * canvas.height,
    };
  };

  canvas.onmousedown = (ev) => {
    current = { tool, color, width: 2, points: [toPt(ev)] };
    redraw();
  };
  canvas.onmousemove = (ev) => {
    if (!current) return;
    if (tool === "pen") current.points.push(toPt(ev));
    else current.points = [current.points[0], toPt(ev)];
    redraw();
  };
  const finish = () => {
    if (current && current.points.length > 0) strokes.push(current);
    current = null;
    redraw();
  };
  canvas.onmouseup = finish;
  canvas.onmouseleave = finish;

  overlay.querySelectorAll("[data-draw-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      tool = ((btn as HTMLElement).dataset.drawTool as any) || "pen";
      overlay.querySelectorAll("[data-draw-tool]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  const colorEl = overlay.querySelector("[data-draw-color]") as HTMLInputElement;
  colorEl?.addEventListener("input", () => {
    color = colorEl.value;
  });

  overlay.querySelector("[data-draw-undo]")?.addEventListener("click", () => {
    strokes.pop();
    redraw();
  });
  overlay.querySelector("[data-draw-clear]")?.addEventListener("click", () => {
    strokes = [];
    redraw();
  });
  overlay.querySelector("[data-draw-close]")?.addEventListener("click", close);
  overlay.querySelector("[data-draw-insert]")?.addEventListener("click", () => {
    const svg = renderDrawingStrokesToSVG(strokes, 590, 260);
    close();
    onInsertSvg(svg);
  });

  return close;
}
