import { describe, expect, it } from "vitest";
import {
  buildChatbotContextExcerpts,
  buildDocumentTree,
  classifyEntropyBits,
  computeStringEntropyBits,
  extractChaptersAndStats,
  flattenDocumentTree,
  formatChatbotExcerptsForEditorialAI,
  getSlashCommands,
  renderDrawingStrokesToSVG,
  renderMarkdownHtml,
  sanitizeContextForAI,
} from "./index";

describe("Writtt Frontend Pure Domain Layer", () => {
  it("extracts chapters, word counts, tasks, code blocks, and Shannon entropy", () => {
    const md = [
      "# Capitulo 1",
      "",
      "Introducao ao protocolo zero-knowledge com varias palavras.",
      "- [x] Configurar Argon2id",
      "- [ ] Ativar TOTP 2FA",
      "",
      "```go",
      "# Ignorado dentro de codeblock",
      "func main() {}",
      "```",
      "",
      "## Secao 1.1",
      "",
      "Detalhes da curva e selagem AES-256-GCM.",
    ].join("\n");

    const { chapters, stats } = extractChaptersAndStats(md);
    expect(chapters.length).toBe(2);
    expect(chapters[0].level).toBe(1);
    expect(chapters[0].text).toBe("Capitulo 1");
    expect(chapters[0].wordCount).toBeGreaterThan(5);
    expect(chapters[1].level).toBe(2);
    expect(stats.codeBlockCount).toBe(1);
    expect(stats.taskTotal).toBe(2);
    expect(stats.taskCompleted).toBe(1);
    expect(stats.entropyBits).toBeGreaterThan(2.5);
    expect(classifyEntropyBits(7.2)).toBe("CIPHERTEXT_SEALED");
    expect(classifyEntropyBits(5.0)).toBe("HIGH_ENTROPY_DENSE");
    expect(classifyEntropyBits(4.0)).toBe("NATURAL_PROSE");
    expect(classifyEntropyBits(1.0)).toBe("LOW_ENTROPY_SPARSE");
  });

  it("builds and flattens hierarchical parent/child document tree with cycle safety", () => {
    const docs = [
      {
        id: "child-1",
        type: "markdown",
        title: "Subcapitulo 1.1",
        snippet: "...",
        tags: [],
        is_vault: false,
        updated_at: "2026-11-07T10:00:00Z",
        parent_id: "root-1",
        sort_order: 2,
      },
      {
        id: "root-1",
        type: "markdown",
        title: "Livro Principal",
        snippet: "...",
        tags: ["book"],
        is_vault: true,
        updated_at: "2026-11-07T09:00:00Z",
        sort_order: 1,
      },
    ];
    const roots = buildDocumentTree(docs);
    expect(roots.length).toBe(1);
    expect(roots[0].doc.id).toBe("root-1");
    expect(roots[0].children.length).toBe(1);
    expect(roots[0].children[0].depth).toBe(1);

    const flat = flattenDocumentTree(roots);
    expect(flat.map((n) => n.doc.id)).toEqual(["root-1", "child-1"]);

    const cyclicDocs = [
      {
        id: "node-a",
        type: "markdown",
        title: "Node A",
        snippet: "",
        tags: [],
        is_vault: false,
        updated_at: "2026-11-07T10:00:00Z",
        parent_id: "node-b",
        sort_order: 1,
      },
      {
        id: "node-b",
        type: "markdown",
        title: "Node B",
        snippet: "",
        tags: [],
        is_vault: false,
        updated_at: "2026-11-07T10:00:00Z",
        parent_id: "node-a",
        sort_order: 2,
      },
    ];
    const cyclicFlat = flattenDocumentTree(buildDocumentTree(cyclicDocs));
    expect(cyclicFlat.length).toBe(2);
  });

  it("blocks ciphertext and redacts high-entropy secrets in AI context sanitizer", () => {
    expect(() => sanitizeContextForAI("enc:AAECAwQFBgcICQoLDA0ODw==")).toThrow();
    const res = sanitizeContextForAI(
      "Chave de teste sk-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 em prosa normal."
    );
    expect(res.redactedCount).toBe(1);
    expect(res.sanitized).toContain("[REDACTED_HIGH_ENTROPY_SECRET]");
  });

  it("renders Markdown with SVG task icons (zero emojis), GFM tables, and vector drawings", () => {
    const svg = renderDrawingStrokesToSVG([
      { tool: "pen", color: "#38bdf8", width: 2, points: [{ x: 10, y: 10 }, { x: 40, y: 50 }] },
      { tool: "rect", color: "#22c55e", width: 2, points: [{ x: 5, y: 5 }, { x: 80, y: 60 }] },
      { tool: "circle", color: "#f59e0b", width: 2, points: [{ x: 30, y: 30 }, { x: 50, y: 50 }] },
      { tool: "line", color: "#ef4444", width: 2, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] },
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    expect(svg).toContain("<rect");
    expect(svg).toContain("<circle");

    const html = renderMarkdownHtml(
      `# Titulo\n\n- [x] Feito\n- [ ] Pendente\n\n| Param | Algo |\n| --- | --- |\n| KDF | **Argon2id** |\n\n${svg}`
    );
    expect(html).toContain("<h1>Titulo</h1>");
    expect(html).toContain("task-done");
    expect(html).toContain('<table class="matz-table">');
    expect(html).toContain("<th>Param</th>");
    expect(html).toContain("<td><strong>Argon2id</strong></td>");
    expect(html).toContain("writtt-drawing-embed");
    const slashIds = getSlashCommands().map((c) => c.id);
    expect(slashIds).toEqual(
      expect.arrayContaining(["h1", "h2", "h3", "task", "table", "callout", "hr", "code", "ai", "drawing"])
    );
    expect(computeStringEntropyBits("")).toBe(0);
  });

  it("extracts and sanitizes selected Chatbot replies for Editorial AI context handoff", () => {
    const thread = [
      { role: "user" as const, content: "Como estruturar o capitulo sobre autenticacao?" },
      { role: "assistant" as const, content: "Sugiro abrir com o problema de phishing e depois comparar TOTP vs chaves fisicas." },
      { role: "user" as const, content: "E para a conclusao?" },
      { role: "assistant" as const, content: "Feche recomendando chaves FIDO2 sem expor token sk-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789." },
    ];

    const excerpts = buildChatbotContextExcerpts(thread, [3, 1, 1, 0, 99]);
    expect(excerpts.length).toBe(2);
    expect(excerpts[0].turnIndex).toBe(1);
    expect(excerpts[0].userPrompt).toContain("autenticacao");
    expect(excerpts[1].turnIndex).toBe(3);

    const formatted = formatChatbotExcerptsForEditorialAI(excerpts);
    expect(formatted.redactedCount).toBe(1);
    expect(formatted.contextBlock).toContain("[Diretriz/Analise do Chatbot #1]");
    expect(formatted.contextBlock).toContain("[Diretriz/Analise do Chatbot #2]");
    expect(formatted.contextBlock).toContain("[REDACTED_HIGH_ENTROPY_SECRET]");
  });
});
