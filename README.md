# Writtt

**A local-first writing tool that stays out of your way.**

Writtt is a desktop editor built for people who think in text. No cloud sync required. No account. Your files are plain `.md` files on your disk — you own them.

→ **Website & downloads:** [writtt.app](https://writtt.app)

---

## What it is

- **Local-first** — everything lives in `~/.writtt/data/` as plain Markdown files
- **Split-screen** — write two documents side by side with a single keybind
- **Command palette** — `Cmd+K` to search, open, and run tools
- **Optional AI** — works with Ollama locally (your hardware, your model, zero cloud calls) or BYOK
- **No telemetry** — no pings, no analytics, nothing leaves your machine

## What it isn't

- A Notion replacement — Writtt doesn't do databases or wikis
- A cloud product (yet) — sync is on the roadmap but will always be optional
- A subscription — the desktop app is free and always will be

---

## Building from Source

### Prerequisites

| Tool | Minimum version |
|---|---|
| [Go](https://go.dev/dl/) | 1.21 |
| [Node.js](https://nodejs.org/) | 18 |
| [Wails CLI](https://wails.io/docs/gettingstarted/installation) | 2.x |

```bash
# Install Wails CLI once
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### Clone & Run

```bash
git clone https://github.com/marcelomatz/writtt.git
cd writtt

# Development mode (hot reload)
wails dev

# Production build
wails build
```

The binary will be in `build/bin/`.

### Why build it yourself?

When you build from source, no company is between you and the code. You can read every line, verify what network calls exist (none at runtime), and distribute your own binary to people you trust.

---

## Project Structure

```
writtt/
├── app.go              # Wails IPC bindings exposed to the frontend
├── main.go             # App entry point, window config
├── backend/
│   ├── models/         # Document, SearchResult, Frontmatter structs
│   ├── storage/        # .md file I/O, YAML frontmatter, SQLite FTS5
│   ├── tools/          # Text-to-Tool modules (email, LLM, parser)
│   └── network/        # Local AI health checks (Ollama ping)
├── frontend/
│   └── src/
│       ├── components/ # Editor, Workspace (split-screen), CommandPalette
│       ├── store/      # Zustand (editorStore, paletteStore)
│       ├── hooks/      # useDebounce, useGlobalKeymap
│       └── utils/      # commandParser
└── website/            # → separate repo: github.com/marcelomatz/writtt-website
```

---

## Stack

- **Go 1.21+** — backend, file I/O, SQLite FTS5 indexing
- **Wails v2** — native window, IPC bridge between Go and React
- **React + TypeScript + Vite** — frontend
- **TipTap** — editor core with Markdown extension
- **Zustand** — frontend state
- **SQLite FTS5** — local full-text search

---

## Roadmap

See [`plan.md`](./plan.md) for the detailed phase-by-phase plan.

High-level:
- [x] Project structure
- [ ] File I/O + SQLite indexing (Fase 2)
- [ ] Editor + Split-screen (Fase 3)
- [ ] Command palette (Fase 4)
- [ ] Local AI / BYOK (Fase 5)
- [ ] Image attachments (Fase 6)
- [ ] Cloud sync (optional, future)

---

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.

Short version: open an issue first, keep PRs focused, respect the privacy constraints.

---

## License

[MIT](./LICENSE) — Marcelo Matz, 2026.
