import { matzIcon } from "@matz/ui";
import { t } from "./i18n";
import { DrawingStroke } from "./models";

export function renderDrawingStrokesToSVG(
  strokes: DrawingStroke[],
  width = 560,
  height = 240
): string {
  const elements: string[] = [];
  for (const s of strokes) {
    if (!s.points || s.points.length === 0) continue;
    const color = s.color || "#38bdf8";
    const sw = s.width || 2;
    if (s.tool === "pen") {
      const d = s.points
        .map((pt, i) => `${i === 0 ? "M" : "L"}${Math.round(pt.x)} ${Math.round(pt.y)}`)
        .join(" ");
      elements.push(
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    } else if (s.tool === "line" && s.points.length >= 2) {
      const p0 = s.points[0];
      const p1 = s.points[s.points.length - 1];
      elements.push(
        `<line x1="${Math.round(p0.x)}" y1="${Math.round(p0.y)}" x2="${Math.round(p1.x)}" y2="${Math.round(p1.y)}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`
      );
    } else if (s.tool === "rect" && s.points.length >= 2) {
      const p0 = s.points[0];
      const p1 = s.points[s.points.length - 1];
      const x = Math.round(Math.min(p0.x, p1.x));
      const y = Math.round(Math.min(p0.y, p1.y));
      const w = Math.round(Math.abs(p1.x - p0.x));
      const h = Math.round(Math.abs(p1.y - p0.y));
      elements.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" stroke="${color}" stroke-width="${sw}"/>`
      );
    } else if (s.tool === "circle" && s.points.length >= 2) {
      const p0 = s.points[0];
      const p1 = s.points[s.points.length - 1];
      const r = Math.round(Math.hypot(p1.x - p0.x, p1.y - p0.y));
      elements.push(
        `<circle cx="${Math.round(p0.x)}" cy="${Math.round(p0.y)}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"/>`
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="writtt-vector-svg">${elements.join("")}</svg>`;
}

function escapeHtmlBasic(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Renders Markdown to HTML obeying Rule #1 (Zero Emojis: uses matzIcon SVG for task lists)
 * and supporting embedded SVG drawings, syntax code blocks, GFM tables, and attachments.
 */
export function renderMarkdownHtml(md: string): string {
  if (!md.trim()) {
    return `<p class="writtt-empty-preview">${t(
      "Nenhum conteudo para pre-visualizar.",
      "No content to preview.",
      "Sin contenido para previsualizar."
    )}</p>`;
  }

  const svgPlaceholders: string[] = [];
  const withPlaceholders = md.replace(/<svg[\s\S]*?<\/svg>/gi, (svgMatch) => {
    const idx = svgPlaceholders.length;
    svgPlaceholders.push(`<div class="writtt-drawing-embed">${svgMatch}</div>`);
    return `@@WRITTT_SVG_${idx}@@`;
  });

  let html = escapeHtmlBasic(withPlaceholders);

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const badge = lang ? `<div class="writtt-code-lang">${lang.toUpperCase()}</div>` : "";
    return `<div class="writtt-code-block">${badge}<pre><code>${code.trim()}</code></pre></div>`;
  });

  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/^---$/gm, "<hr/>");
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" class="writtt-md-img" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const checkedSvg = matzIcon("check-circle", 14);
  const uncheckedSvg = matzIcon("minus", 14);
  html = html.replace(
    /^- \[x\] (.+)$/gim,
    `<li class="task-done"><span class="writtt-task-icon is-checked">${checkedSvg}</span> <span>$1</span></li>`
  );
  html = html.replace(
    /^- \[ \] (.+)$/gm,
    `<li class="task-todo"><span class="writtt-task-icon">${uncheckedSvg}</span> <span>$1</span></li>`
  );
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");

  html = html.replace(
    /(?:^\|.+\|[ \t]*\n\|[ \t:|-]+\|[ \t]*(?:\n\|.+\|[ \t]*)*)/gm,
    (tableBlock) => {
      const rows = tableBlock
        .trim()
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);
      if (rows.length < 2) return tableBlock;
      const splitCells = (row: string) =>
        row
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
      const headers = splitCells(rows[0]);
      const bodyRows = rows.slice(2).map(splitCells);
      const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${bodyRows
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      return `\n\n<table class="matz-table">${thead}${tbody}</table>\n\n`;
    }
  );

  html = html
    .split("\n\n")
    .map((block) => {
      const b = block.trim();
      if (!b) return "";
      if (/^<(h[1-4]|pre|div|blockquote|hr|li|ul|ol|img|table)/.test(b)) return b;
      return `<p>${b.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  html = html.replace(/@@WRITTT_SVG_(\d+)@@/g, (_m, idxStr) => {
    return svgPlaceholders[Number(idxStr)] || "";
  });

  return html;
}
