# Writtt

**Local-First Distraction-Free Editorial Studio & Zero-Knowledge Cryptographic Vault.**

Writtt is a standalone open-source desktop writing studio engineered for authors, researchers, journalists, and creators who demand serene rich-text + Markdown authoring alongside mathematical Zero-Knowledge protection for unpublished manuscripts — 100% offline, with zero accounts, zero cloud telemetry, and zero subscriptions.

- **Official Website & User Documentation:** https://www.writtt.com
- **Architecture Reference:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Automated Test Coverage:** [TEST_COVERAGE.md](./TEST_COVERAGE.md)

---

## Core Capabilities

- **Rich Editorial Studio + Portable Markdown** — Powered by Tiptap ProseMirror + `tiptap-markdown`, featuring floating selection formatting, hover action tooltips, live-filtered Slash Commands (`/h1`, `/task`, `/ai`, `/draw`), contextual GFM tables, `lowlight` syntax code blocks, vector SVG drawing canvas, drag-and-drop image attachments, Zen mode (`Alt+Z`), paragraph focus mode, and stateful snapshot saving (`Ctrl+S`).
- **Hierarchical Manuscripts & Side-by-Side Comparison** — Organize long-form books into blank linked sub-chapters (with dual-pane parent comparison and one-click append to parent) or create standalone copies to explore alternative directions without touching the original draft.
- **Zero-Knowledge Local Vault** — Authenticated **Argon2id** (`m=64MB, t=3, p=2`) + **AES-256-GCM** encryption at rest, session-aware Quick PIN, 256-bit Recovery Key (`rk:`), RFC 6238 TOTP 2FA guarded by a 64-bit anti-replay window, progressive HMAC-sealed brute-force lockouts (`20s` / `60s`), human-presence challenge verification (`HumanAuthGuard`), automatic inactivity lock, and RAM key zeroization on shutdown.
- **Pre-Publication Authorship Proof** — Issue UTC-timestamped SHA-256 authorship certificates anchored in an immutable SHA-256 `ForensicChain` before sharing drafts with editors or publishers.
- **Dedicated AI & RAG Studio (Docked, Floating, or 2nd-Monitor OS Window)** — Optional integration with local **Ollama** (`127.0.0.1:11434`) running in a strict text-only sandbox (zero filesystem or shell access), automatic high-entropy secret redaction, separated conversational Chatbot (`Chatbot IA`) and Editorial AI (`Editor IA`) with selective reply forwarding, inline selection `/ai` actions with visual diff highlight, and offline L2 cosine-similarity RAG across unlocked works.
- **Publication & Portable Archives** — Export manuscripts via native OS dialogs to **EPUB 3.0 (`.epub`)**, **HTML5 (`.html`)**, **Markdown (`.md`)**, or passphrase-sealed **`.writttpack`** archives, plus RSA-2048 OAEP hybrid envelopes (**Writtt Express**) and an **E2EE File Locker**.
- **Clean 4-Layer Hexagonal Architecture** — Symmetrical `domain -> application -> adapters -> presentation` separation across both Go and TypeScript with strict Dependency Inversion, Zero Emojis UI, multi-language support (`pt-BR`, `en-US`, `es-ES`), and 11 color themes in Dark & Light modes.

---

## Project Layout

```text
writtt/
├── main.go                     # Wails v3 application bootstrap & frameless window configuration
├── app.go                      # Thin Layer 4 Wails v3 facade, multi-monitor AI window & OS dialogs
├── internal/
│   ├── domain/                 # Layer 1: Pure entities, ports, SemVer, DAG, RAG, ZKP & XHTML
│   ├── application/            # Layer 2: Capability use-cases & algorithmic orchestration
│   └── adapters/               # Layer 3: Platform HAL, SQLite WAL/FTS5 index & reflection HTTP RPC
└── frontend/src/
    ├── domain/                 # Layer 1: Pure TypeScript models, editorial stats, i18n & Markdown/SVG
    ├── application/            # Layer 2: StudioGatewayPort, workspace state & Vault-safe AI store
    ├── adapters/               # Layer 3: Wails v3 IPC client with HTTP fallback & O(1) LRUCache
    ├── presentation/           # Layer 4: Standalone shell, Tiptap studio, AI Studio & settings views
    ├── styles/writtt.css       # Semantic stylesheet built on Specular Obsidian & Alabaster tokens
    └── main.ts                 # Composition root, event coordinator & keyboard controller
```

---

## Building & Testing from Source

### Prerequisites

| Tool | Version |
| :--- | :--- |
| [Go](https://go.dev/dl/) | 1.25+ |
| [Node.js](https://nodejs.org/) | 22+ |
| WebView2 Runtime | Pre-installed on Windows 10/11 |

### Verify & Build

```bash
# 1. Install frontend dependencies, run Vitest unit tests, and bundle assets
cd frontend
npm install
npx vitest run
npm run build
cd ..

# 2. Run Go unit & integration test suites across all 4 layers
go test -count=1 -cover ./...

# 3. Compile native desktop executable
go build -ldflags "-s -w -X main.CurrentVersion=v0.2.0" -o writtt.exe .
```

---

## License

[MIT](./LICENSE) — Marcelo Matz, 2026.
