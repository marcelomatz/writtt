# 📝 Writtt - Project Plan & Architecture

**Visão Geral:** Um editor "Text to Think / Text to Tool" focado em *flow* contínuo.
**Stack:** Go 1.21+ (Backend), Wails v2 (IPC/Window), React + TypeScript + Vite (Frontend), TipTap (Editor core), SQLite FTS5 (Busca Local).
**Filosofia:** Local-first, arquivos `.md` físicos como Fonte da Verdade, zero latência, *keyboard-centric*.

---

## 🛠 Fase 1: Setup e Fundação

### 1.1. Inicialização do Projeto
- [ ] Instalar a CLI do Wails: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- [ ] Gerar o template base: `wails init -n writtt -t react-ts`
- [ ] Limpar o boilerplate do Vite (remover logos, css padrão).
- [ ] Instalar dependências do Frontend:
  ```bash
  cd frontend
  npm install @tiptap/react @tiptap/starter-kit tiptap-markdown
  npm install zustand cmdk lucide-react
  npm install -D tailwindcss postcss autoprefixer
  npx tailwindcss init -p
  npm install @tailwindcss/typography # Essencial para o TipTap
  ```

  ```text
  writtt/
├── backend/
│   ├── models/        # Structs Document, SearchResult, Frontmatter
│   ├── storage/       # Manipulação de .md, YAML parse, SQLite FTS5
│   ├── tools/         # Módulos de "Text to Tool" (Email, LLM, Parser)
│   └── network/       # Health checks (Ping Ollama local)
├── frontend/
│   ├── src/
│   │   ├── components/ # Editor, Workspace (Split-screen), CommandPalette
│   │   ├── store/      # Zustand (editorStore, paletteStore)
│   │   ├── hooks/      # useDebounce, useGlobalKeymap
│   │   └── utils/      # commandParser
├── main.go            # Wails setup + Custom Asset Server
└── app.go             # Bindings da ponte IPC expostos pro Wails
```

## ⚙️ Fase 2: O Motor em Go (Local-First)

### 2.1. Modelagem e I/O de Disco (backend/storage)
- [ ] Criar models.Document e models.SearchResult.

- [ ] Implementar leitura de disco (ReadDisk): Usar bytes.SplitN para separar o YAML Frontmatter (---) do corpo em Markdown.

- [ ] Implementar escrita de disco (WriteDisk): Usar bytes.Buffer para concatenar YAML e Markdown de forma limpa e salvar em ~/.writtt/data/[ulid].md.

Dica: Usar pacotes como gopkg.in/yaml.v3 para os metadados e github.com/oklog/ulid/v2 para IDs.

### 2.2. Indexação e Busca (SQLite FTS5)
- [ ] Configurar o banco de dados embutido (ex: github.com/mattn/go-sqlite3).

- [ ] Criar tabelas na inicialização:

```sql
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, type TEXT, title TEXT, updated_at DATETIME);
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(id UNINDEXED, title, content);
```

- [ ] Implementar SyncIndex: Usar um Worker Pool (goroutines) para varrer ~/.writtt/data/, parsear os arquivos na inicialização e fazer um Batch Insert / UPSERT no SQLite usando transações (db.Begin()).

- [ ] Expor o método Search no app.go disparando queries MATCH no SQLite FTS5.

## 🎨 Fase 3: A Interface e o Editor (React)

### 3.1. Gerenciamento de Estado (Zustand)
- [ ] Criar useEditorStore:
  - primaryDoc, secondaryDoc (para o split-screen).
  - activePane ('primary' | 'secondary').
  - saveDocument (recebe a string, atualiza o store e chama o Go via Wails).

### 3.2. O Componente Editor (TipTap)
- [ ] Criar <Editor /> envelopando o @tiptap/react.

- [ ] Adicionar a extensão Markdown para que a entrada e saída sejam puro .md.

- [ ] Implementar o hook useDebounce (ex: 800ms) no evento onUpdate do TipTap.

Fluxo: Digita -> Espera 800ms -> Dispara app.SaveDocument para o Go atualizar disco e SQLite de forma invisível.

### 3.3. O Split-Screen (Workspace)
- [ ] Criar <Workspace /> que renderiza um ou dois <Editor /> lado a lado.

- [ ] Aplicar classes Tailwind (opacity, grayscale) baseadas no activePane para guiar o foco visual.

## ⚡ Fase 4: A Central de Comando e Atalhos

### 4.1. Command Palette (cmdk)
- [ ] Criar <CommandPalette /> estilizado com Tailwind.

- [ ] Integrar useGlobalKeymap (fase de captura useCapture: true) para abrir com Cmd+K.

- [ ] Implementar o parser no input (> tool: campaign vs busca livre).

- [ ] Ligar o input de texto livre ao app.Search (SQLite via Wails).

### 4.2. Gestão de Teclas Global
- [ ] Mapear Cmd+\ para alternar painéis (Split-screen focus).

- [ ] Lidar com a tecla Esc em cascata: Fechar Palette -> Fechar Split-screen -> Tirar foco do TipTap.

## 🤖 Fase 5: "Text To Tool" (Processamento e IA)

### 5.1. O Router no Go
- [ ] Criar app.ExecuteTool(req ToolRequest) no Go.

- [ ] Extrair texto do documento ativo.

### 5.2. IA Local e BYOK (Bring Your Own Key)
- [ ] Criar arquivo de configuração em ~/.writtt/config.json.

- [ ] Implementar network.ScanLocalAI() para pingar porta TCP 11434 (Ollama) e evitar timeouts na UI.

Aproveitando que rodar modelos localmente numa placa robusta (como a RTX 3080) traz velocidade absurda para a geração de campanhas sem comprometer a privacidade.

- [ ] Implementar o gerador de prompt e chamada HTTP para a IA.

- [ ] Crucial: Criar o parser seguro (extractAndUnmarshal) para limpar markdown residual (`json ... `) e extrair o objeto puro das respostas do LLM.

### 5.3. Geração de Arquivos Filhos
- [ ] Após o parse do JSON da IA, rodar o formatter em Go para criar novos arquivos físicos (ex: Thread do X, LinkedIn).

- [ ] Injetar no SQLite em tempo real.

- [ ] Retornar os novos IDs pro React abrir no Split-screen direito.

## 🖼 Fase 6: Polish e Mídia

### 6.1. Custom Asset Server (Imagens Locais)
- [ ] Modificar a config do wails.Run em main.go para usar um http.Handler customizado.

- [ ] Servir imagens da rota virtual /attachments/ apontando para ~/.writtt/data/attachments/.

### 6.2. Drag & Drop no TipTap
- [ ] Interceptar handleDrop e handlePaste nas editorProps do TipTap.

- [ ] Converter o File do navegador para Base64 no React.

- [ ] Enviar para o Go (app.SaveAttachment), salvar em disco, retornar o path virtual e injetar o nó de imagem no editor.

### Skills
- Todas skills necessárias estão disponíveis no caminho "C:\Users\Marcelo\.gemini\antigravity\skills"