# Contributing to Writtt

Thank you for contributing to Writtt. This guide explains the architecture rules and local workflow.

---

## Engineering Principles

Writtt is a local-first, privacy-first open-source studio. Every contribution must preserve these invariants:

- **Zero Telemetry & Zero Mandatory Cloud**: No analytics, tracking pixels, or hidden background uploads. The only optional network request is checking the public `version.json` / GitHub Releases manifest when update notifications are enabled.
- **Strict 4-Layer Hexagonal Architecture**: Respect inward-only dependencies (`domain <- application <- adapters <- presentation`) in both Go (`internal/`) and TypeScript (`frontend/src/`). Layer 1 (`domain`) and Layer 2 (`application`) must never import Layer 3 (`adapters`) or Layer 4 (`presentation`).
- **Zero-Knowledge Vault Isolation**: Vault-protected manuscripts (`is_vault: true`) must never write plaintext into SQLite FTS5 (`documents_fts`) or browser `localStorage`.
- **Zero Emojis Policy**: Do not insert Unicode emojis in UI components, logs, comments, or documentation. Use crisp vector SVG icons (`@matz/ui/icons`).

---

## Before Opening a Pull Request

1. **Open an issue first** for architectural changes or new capabilities.
2. **One concern per PR** with clear test coverage.
3. Ensure both backend and frontend test suites pass cleanly.

---

## Development Setup

```bash
git clone https://github.com/marcelomatz/writtt.git
cd writtt/frontend
npm install
npx vitest run
npm run build
cd ..
go test -count=1 -cover ./...
go build -o writtt.exe .
```

---

## Code Style

- **Go**: Standard `gofmt`, explicit error wrapping, deterministic unit tests via `MockCommandRunner` (`domain.CommandRunner`).
- **TypeScript**: Strict TypeScript (`tsc --noEmit`), modular views without inline styles, and Vitest unit tests for domain/application logic.
- **Commits**: Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`).

---

## Reporting Bugs & Feature Requests

- Bug reports: [.github/ISSUE_TEMPLATE/bug_report.md](./.github/ISSUE_TEMPLATE/bug_report.md)
- Feature requests: [.github/ISSUE_TEMPLATE/feature_request.md](./.github/ISSUE_TEMPLATE/feature_request.md)
