# Contributing to Writtt

Thanks for taking the time to contribute. This document explains how.

---

## Philosophy

Writtt is local-first, privacy-first. Every contribution should respect these constraints:

- No telemetry, no tracking, no analytics
- No mandatory network requests at runtime
- All user data stays in `~/.writtt/` on the user's machine

---

## Before Opening a PR

1. **Open an issue first** for anything beyond small bug fixes. This avoids wasted effort.
2. **One concern per PR.** Don't bundle unrelated changes.
3. Make sure `wails build` completes without errors.

---

## Development Setup

See [README.md](./README.md#building-from-source) for the full setup guide.

**Quick summary:**
```bash
# Prerequisites: Go 1.21+, Node 18+, Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

git clone https://github.com/marcelomatz/writtt.git
cd writtt
wails dev
```

---

## Code Style

- **Go**: standard `gofmt`. No external linters required, but keep functions small.
- **TypeScript/React**: Prettier defaults. `npm run lint` should pass.
- **Commits**: use conventional commits — `fix:`, `feat:`, `docs:`, `refactor:`.

---

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).  
Include: OS, Writtt version, steps to reproduce, expected vs actual behaviour.

---

## Feature Requests

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md).  
Explain the use case before the solution.

---

## Code of Conduct

Be direct and respectful. Disagreement about technical decisions is fine; hostility is not.
