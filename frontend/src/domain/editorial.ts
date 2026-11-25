import { joaat, shannonEntropy } from "@matz/ui";
import { t } from "./i18n";
import {
  AIChatMessage,
  ChapterHeading,
  ChatbotContextExcerpt,
  DocumentStats,
  DocumentTreeNode,
  SearchResult,
  SlashCommandItem,
} from "./models";

export function computeStringEntropyBits(text: string): number {
  if (!text) return 0;
  const counts: Record<string, number> = {};
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    counts[ch] = (counts[ch] ?? 0) + 1;
  }
  const { entropyBits } = shannonEntropy(counts);
  return Number(entropyBits.toFixed(2));
}

export function classifyEntropyBits(bits: number): string {
  if (bits >= 6.8) return "CIPHERTEXT_SEALED";
  if (bits >= 4.6) return "HIGH_ENTROPY_DENSE";
  if (bits >= 3.2) return "NATURAL_PROSE";
  return "LOW_ENTROPY_SPARSE";
}

export function extractChaptersAndStats(markdown: string): {
  chapters: ChapterHeading[];
  stats: DocumentStats;
} {
  const normalized = (markdown || "").replace(/\r\n/g, "\n");
  const lines = normalized ? normalized.split("\n") : [];

  const rawHeadings: Array<{ level: number; text: string; line: number }> = [];
  let inCodeBlock = false;
  let codeBlockCount = 0;
  let taskTotal = 0;
  let taskCompleted = 0;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockCount++;
      } else {
        inCodeBlock = false;
      }
      continue;
    }
    if (inCodeBlock) continue;

    const lower = trimmed.toLowerCase();
    if (lower.startsWith("- [ ] ") || lower.startsWith("* [ ] ")) {
      taskTotal++;
    } else if (lower.startsWith("- [x] ") || lower.startsWith("* [x] ")) {
      taskTotal++;
      taskCompleted++;
    }

    if (line.startsWith("# ")) {
      rawHeadings.push({ level: 1, text: line.slice(2).trim(), line: idx + 1 });
    } else if (line.startsWith("## ")) {
      rawHeadings.push({ level: 2, text: line.slice(3).trim(), line: idx + 1 });
    } else if (line.startsWith("### ")) {
      rawHeadings.push({ level: 3, text: line.slice(4).trim(), line: idx + 1 });
    }
  }

  const countWordsIn = (str: string): number => {
    const trimmed = str.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  };

  const chapters: ChapterHeading[] = rawHeadings.map((h, i) => {
    const startIdx = h.line - 1;
    const endIdx = i + 1 < rawHeadings.length ? rawHeadings[i + 1].line - 1 : lines.length;
    const sectionText = lines.slice(startIdx, endIdx).join(" ");
    return {
      id: `ch-${i + 1}-${h.line}`,
      level: h.level,
      text: h.text || "(untitled)",
      line: h.line,
      wordCount: countWordsIn(sectionText),
    };
  });

  const words = countWordsIn(normalized);
  const chars = normalized.length;
  const readMinutes = words > 0 ? Math.max(1, Math.ceil(words / 200)) : 0;
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0).length;

  const entropyBits = computeStringEntropyBits(normalized);
  const entropyClass = classifyEntropyBits(entropyBits);

  let secretAlerts = 0;
  const tokens = normalized.split(/\s+/);
  for (const tok of tokens) {
    const clean = tok.replace(/^[`"'(]+|[`"'),.;:]+$/g, "");
    if (clean.length >= 20 && computeStringEntropyBits(clean) >= 4.25 && !clean.startsWith("http")) {
      secretAlerts++;
    }
  }

  const hashNum = joaat(normalized);
  const contentHashHex = hashNum.toString(16).padStart(8, "0");

  return {
    chapters,
    stats: {
      words,
      chars,
      lines: normalized ? lines.length : 0,
      paragraphs,
      readMinutes,
      chapterCount: chapters.length,
      codeBlockCount,
      taskTotal,
      taskCompleted,
      entropyBits,
      entropyClass,
      secretAlerts,
      contentHashHex,
    },
  };
}

export function buildDocumentTree(docs: SearchResult[]): DocumentTreeNode[] {
  const byId = new Map<string, DocumentTreeNode>();
  for (const d of docs) {
    byId.set(d.id, { doc: d, children: [], depth: 0 });
  }
  const createsCycle = (childId: string, targetParentId: string): boolean => {
    const visited = new Set<string>([childId]);
    let cur: string | undefined = targetParentId;
    while (cur) {
      if (visited.has(cur)) return true;
      visited.add(cur);
      const curNode = byId.get(cur);
      cur = curNode?.doc.parent_id || undefined;
    }
    return false;
  };
  const roots: DocumentTreeNode[] = [];
  for (const d of docs) {
    const node = byId.get(d.id)!;
    if (
      d.parent_id &&
      byId.has(d.parent_id) &&
      d.parent_id !== d.id &&
      !createsCycle(d.id, d.parent_id)
    ) {
      const parent = byId.get(d.parent_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (list: DocumentTreeNode[], depth: number) => {
    list.sort((a, b) => {
      const sa = a.doc.sort_order ?? 0;
      const sb = b.doc.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return (b.doc.updated_at || "").localeCompare(a.doc.updated_at || "");
    });
    for (const n of list) {
      n.depth = depth;
      if (n.children.length > 0) {
        sortNodes(n.children, depth + 1);
      }
    }
  };
  sortNodes(roots, 0);
  return roots;
}

export function flattenDocumentTree(roots: DocumentTreeNode[]): DocumentTreeNode[] {
  const out: DocumentTreeNode[] = [];
  const walk = (nodes: DocumentTreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children.length > 0) walk(n.children);
    }
  };
  walk(roots);
  return out;
}

export function sanitizeContextForAI(content: string): {
  sanitized: string;
  redactedCount: number;
} {
  const trimmed = (content || "").trim();
  if (trimmed.startsWith("enc:") || trimmed.startsWith("rk:")) {
    throw new Error("Encrypted ciphertext cannot be sent to AI assistant");
  }
  let redactedCount = 0;
  const sanitized = content.replace(/\S+/g, (tok) => {
    const clean = tok.replace(/^[`"'(]+|[`"'),.;:]+$/g, "");
    if (clean.startsWith("enc:") || clean.startsWith("rk:")) {
      redactedCount++;
      return "[REDACTED_CIPHERTEXT]";
    }
    if (
      clean.length >= 20 &&
      !clean.startsWith("http://") &&
      !clean.startsWith("https://") &&
      !clean.startsWith("/attachments/")
    ) {
      const ent = computeStringEntropyBits(clean);
      const hasDigit = /\d/.test(clean);
      const hasAlpha = /[a-zA-Z]/.test(clean);
      if (ent >= 4.25 && hasDigit && hasAlpha) {
        redactedCount++;
        return "[REDACTED_HIGH_ENTROPY_SECRET]";
      }
    }
    return tok;
  });
  return { sanitized, redactedCount };
}

/**
 * Extracts structured, deduplicated Chatbot context excerpts from selected assistant turn indices
 * so the author can forward 1+ specific replies (or an entire thread) into Editorial AI.
 */
export function buildChatbotContextExcerpts(
  messages: AIChatMessage[],
  turnIndices: number[]
): ChatbotContextExcerpt[] {
  if (!Array.isArray(messages) || messages.length === 0 || !Array.isArray(turnIndices)) {
    return [];
  }
  const uniqueSorted = Array.from(new Set(turnIndices))
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < messages.length)
    .sort((a, b) => a - b);

  const out: ChatbotContextExcerpt[] = [];
  for (const idx of uniqueSorted) {
    const msg = messages[idx];
    if (!msg || msg.role !== "assistant" || !msg.content.trim()) continue;

    let userPrompt = "";
    for (let p = idx - 1; p >= 0; p--) {
      if (messages[p]?.role === "user" && messages[p].content.trim()) {
        userPrompt = messages[p].content.trim();
        break;
      }
    }

    const cleanReply = msg.content.trim();
    const compact = cleanReply.replace(/\s+/g, " ").trim();
    const preview = compact.length > 140 ? `${compact.slice(0, 140)}...` : compact;

    out.push({
      id: `cb-turn-${idx}-${joaat(cleanReply).toString(16)}`,
      turnIndex: idx,
      userPrompt: userPrompt || undefined,
      assistantReply: cleanReply,
      preview,
    });
  }
  return out;
}

/**
 * Formats attached Chatbot excerpts into a structured, Zero-Knowledge-sanitized directive block
 * for Editorial AI (`ChatWithAssistant`) so it interprets the Chatbot analysis and applies it.
 */
export function formatChatbotExcerptsForEditorialAI(excerpts: ChatbotContextExcerpt[]): {
  contextBlock: string;
  redactedCount: number;
} {
  if (!Array.isArray(excerpts) || excerpts.length === 0) {
    return { contextBlock: "", redactedCount: 0 };
  }
  let totalRedacted = 0;
  const blocks = excerpts.map((ex, i) => {
    const safeReply = sanitizeContextForAI(ex.assistantReply);
    totalRedacted += safeReply.redactedCount;
    const header = `[Diretriz/Analise do Chatbot #${i + 1}]`;
    if (ex.userPrompt) {
      const safePrompt = sanitizeContextForAI(ex.userPrompt);
      totalRedacted += safePrompt.redactedCount;
      return `${header}\nPergunta do Autor: ${safePrompt.sanitized}\nAnalise/Proposta Selecionada:\n${safeReply.sanitized}`;
    }
    return `${header}\nAnalise/Proposta Selecionada:\n${safeReply.sanitized}`;
  });

  return {
    contextBlock: blocks.join("\n\n---\n\n"),
    redactedCount: totalRedacted,
  };
}

export function getSlashCommands(): SlashCommandItem[] {
  return [
    {
      id: "h1",
      label: t("Titulo de Capitulo (H1)", "Chapter Heading (H1)", "Titulo de Capitulo (H1)"),
      shortcut: "/h1",
      description: t("Abre um novo capitulo principal no sumario", "Primary chapter heading in outline", "Encabezado principal de capitulo"),
      snippet: "# ",
    },
    {
      id: "h2",
      label: t("Subtitulo de Secao (H2)", "Section Subheading (H2)", "Subtitulo de Seccion (H2)"),
      shortcut: "/h2",
      description: t("Secao secundaria dentro do capitulo", "Secondary section heading", "Subseccion del capitulo"),
      snippet: "## ",
    },
    {
      id: "h3",
      label: t("Topico Interno (H3)", "Sub-topic Heading (H3)", "Subtema (H3)"),
      shortcut: "/h3",
      description: t("Subdivisao nivel 3 listada no sumario", "Level-3 heading listed in outline", "Encabezado nivel 3"),
      snippet: "### ",
    },
    {
      id: "task",
      label: t("Lista de Tarefas", "Task Checklist", "Lista de Tareas"),
      shortcut: "/task",
      description: t("Caixinhas marcaveis para etapas e revisoes", "Interactive checkboxes for tasks & notes", "Lista de verificacion interactiva"),
      snippet: "- [ ] ",
    },
    {
      id: "table",
      label: t("Tabela Editorial 3x3", "3x3 Editorial Table", "Tabla Editorial 3x3"),
      shortcut: "/table",
      description: t("Insere tabela com linhas e colunas ajustaveis", "Inserts table with row/column controls", "Inserta tabla editable"),
      snippet: "| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n| Item | Detalhe | Nota |\n",
    },
    {
      id: "callout",
      label: t("Citacao ou Destaque", "Blockquote / Callout", "Cita o Destacado"),
      shortcut: "/quote",
      description: t("Bloco de citacao ou observacao destacada (/quote ou /callout)", "Highlighted quote or note block", "Bloque de cita destacada"),
      snippet: "> ",
    },
    {
      id: "hr",
      label: t("Divisor de Cena", "Scene Divider", "Separador de Escena"),
      shortcut: "/hr",
      description: t("Linha horizontal para separar cenas ou secoes", "Horizontal rule between scenes or sections", "Linea divisoria horizontal"),
      snippet: "\n---\n",
    },
    {
      id: "code",
      label: t("Bloco de Codigo / Trecho Fixo", "Code / Preformatted Block", "Bloque de Codigo"),
      shortcut: "/code",
      description: t("Texto monoespacado com realce automatico", "Monospace block with syntax highlighting", "Bloque monoespaciado"),
      snippet: "```text\n\n```\n",
    },
    {
      id: "ai",
      label: t("Assistente IA no Palco", "Stage AI Assistant", "Asistente IA en Escena"),
      shortcut: "/ai",
      description: t("Abre a janela flutuante de IA local para gerar ou reescrever", "Opens floating local AI window to write or polish", "Abre la ventana flotante de IA local"),
      snippet: "@@OPEN_INLINE_AI@@",
    },
    {
      id: "drawing",
      label: t("Quadro de Desenho Livre SVG", "Freehand Vector Drawing (SVG)", "Lienzo de Dibujo SVG"),
      shortcut: "/draw",
      description: t("Desenhe esquemas, mapas ou diagramas nitidos no texto", "Sketch crisp diagrams, maps or notes", "Dibuja esquemas o diagramas vectoriales"),
      snippet: "@@OPEN_DRAWING_MODAL@@",
    },
  ];
}
