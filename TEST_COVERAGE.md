# Writtt v0.2.0 — Relatório de Cobertura de Testes Automatizados

Este documento registra a cobertura de testes unitários e de integração do **Writtt**, executados de forma determinística e isolada via `MockCommandRunner` (`domain.CommandRunner`) e ambientes temporários controlados, sem efeitos colaterais no sistema operacional.

---

## 1. Cobertura Backend Go (`go test -count=1 -cover ./...`)

| Pacote | Camada Arquitetural | Cobertura de Statements | Status | Escopo Verificado |
| :--- | :--- | :--- | :--- | :--- |
| `writtt/internal/domain` | Camada 1 — Domínio Puro | **93%+** | PASS | `entities.go`, `ports.go`, `validation.go`, `editorial.go`, `security_rules.go`, `rag.go`, `xhtml.go`: validação ULID/path-traversal, comparação estrita SemVer (`CompareSemVer`), sanitização FTS5, capítulos H1/H2/H3, entropia de Shannon, sanitizador de contexto IA, parser estruturado `<opinion>`/`<content>`, bloqueio progressivo (`20s` / `60s`) selado por `HMAC-SHA256`, avaliador cinemático de presença humana (`EvaluateHumanPresence`), DAG de documentos, motor RAG offline, ZKP Schnorr 256 rodadas e renderização XHTML/GFM. |
| `writtt/internal/application` | Camada 2 — Casos de Uso | **85%+** | PASS | `service.go`, `document_usecases.go`, `version_usecases.go`, `vault_usecases.go`, `exchange_usecases.go`, `ai_usecases.go`: CRUD, `AutoSaveDocument` vs `SaveDocument`, `CreateSubChapter`, `DuplicateDocument`, `CheckForUpdates`, `GenerateAuthorshipProof`, rotação de Senha Mestra via `ExecuteSaga`, bloqueio progressivo persistido entre reinícios, `BeginAuthChallenge` + `UnlockWithHumanProof`, PIN rápido (`vault_pin_ready`), Recovery Key 256-bit, TOTP RFC 6238, `ChatWithAssistant` e `FreeChatWithAssistant`, busca RAG, Drive E2EE, Express RSA-2048 OAEP, `.writttpack`, EPUB 3.0 e `Shutdown` com zeragem de chaves. |
| `writtt/internal/adapters` | Camada 3 — Infraestrutura & HAL | **82%+** | PASS | `platform_hal.go`, `sqlite_index.go`, `http_rpc.go`: `MockCommandRunner`, `OSCommandRunner` (incluindo `FetchRemoteRelease` e `/api/chat` + fallback `/api/generate`), `SQLiteSearchIndex` (WAL + FTS5 garantindo zero vazamento de texto plano de obras do Cofre + `fsnotify` watcher) e `HTTPRPCGateway` (despacho dinâmico via reflexão, bloqueio de métodos de ciclo de vida e bloqueio de endpoints brutos de senha contra scripts HTTP). |
| `writtt` (`app_test.go`) | Camada 4 — Fachada Wails v3 | **PASS** | PASS | Fachada `App`, `CheckForUpdates` e invocação ponta a ponta de todos os fluxos críticos via gateway HTTP RPC (`/api/writtt/invoke`). |

---

## 2. Cobertura Frontend TypeScript (`npx vitest run` + `tsc --noEmit`)

| Suíte de Teste | Camada Arquitetural | Testes | Status | Escopo Verificado |
| :--- | :--- | :--- | :--- | :--- |
| `@matz/ui/src/primitives/FloatingWindow.test.ts` | Fundação UI (`@matz/ui`) | **6 testes** | PASS | Posicionamento inteligente no palco (`computeMatzSmartStagePlacement`), clamping em bordas da área útil (`clampMatzFloatingRect`), presets de cantos/centro e persistência de posição/tamanho do usuário (`storageKey`). |
| `frontend/src/domain/domain.test.ts` | Camada 1 — Domínio Puro TS | **5 testes** | PASS | Extração de capítulos e estatísticas editoriais, entropia de Shannon, árvore hierárquica Pai/Filho resiliente a ciclos, sanitizador Zero-Knowledge de contexto IA, extração/encaminhamento seletivo do Chatbot para o Editor IA (`buildChatbotContextExcerpts` + `formatChatbotExcerptsForEditorialAI`) e renderizador Markdown/GFM + desenhos vetoriais SVG com zero emojis. |
| `frontend/src/application/storageStore.test.ts` | Camada 2 — Estado & Persistência | **4 testes** | PASS | Persistência de preferências editoriais (`showHomeHeader`, `showHomeCapabilities`, `checkUpdatesAutomatically`), estado de onboarding, isolamento entre histórico do Editor IA e do Chatbot Livre (`listChatbotSessions`) e garantia criptográfica de que sessões de documentos do Cofre permanecem apenas em RAM volátil. |

---

## 3. Comandos de Verificação Reprodutíveis

```bash
# 1. Executar toda a suíte de testes Go com cobertura por camada
go test -count=1 -cover ./...

# 2. Executar typecheck estrito TypeScript, suíte Vitest e bundle Vite
cd frontend
npx vitest run
npm run build
cd ..

# 3. Compilar o binário desktop nativo Wails v3
go build -ldflags "-s -w -X main.CurrentVersion=v0.2.0" -o writtt.exe .
```
