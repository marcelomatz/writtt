# 📝 Writtt - Project Plan & Architecture

**Visão Geral:** Um editor "Text to Think / Text to Tool" focado em *flow* contínuo.
**Stack:** Go 1.21+ (Backend), Wails v2 (IPC/Window), React + TypeScript + Vite (Frontend), TipTap (Editor core), SQLite FTS5 (Busca Local).
**Filosofia:** Local-first, arquivos `.md` físicos como Fonte da Verdade, zero latência, *keyboard-centric*.

---

## 🛠 Fase 1: Setup e Fundação

### 1.1. Inicialização do Projeto
- [x] Instalar a CLI do Wails: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- [x] Gerar o template base: `wails init -n writtt -t react-ts`
- [x] Limpar o boilerplate do Vite (remover logos, css padrão).
- [x] Instalar dependências do Frontend:
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
- [x] Criar models.Document e models.SearchResult.

- [x] Implementar leitura de disco (ReadDisk): Usar bytes.SplitN para separar o YAML Frontmatter (---) do corpo em Markdown.

- [x] Implementar escrita de disco (WriteDisk): Usar bytes.Buffer para concatenar YAML e Markdown de forma limpa e salvar em ~/.writtt/data/[ulid].md.

Dica: Usar pacotes como gopkg.in/yaml.v3 para os metadados e github.com/oklog/ulid/v2 para IDs.

### 2.2. Indexação e Busca (SQLite FTS5)
- [x] Configurar o banco de dados embutido (ex: github.com/mattn/go-sqlite3).

- [x] Criar tabelas na inicialização:

```sql
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, type TEXT, title TEXT, updated_at DATETIME);
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(id UNINDEXED, title, content);
```

- [x] Implementar SyncIndex: Usar um Worker Pool (goroutines) para varrer ~/.writtt/data/, parsear os arquivos na inicialização e fazer um Batch Insert / UPSERT no SQLite usando transações (db.Begin()).

- [x] Expor o método Search no app.go disparando queries MATCH no SQLite FTS5.

## 🎨 Fase 3: A Interface e o Editor (React)

### 3.1. Gerenciamento de Estado (Zustand)
- [x] Criar useEditorStore:
  - primaryDoc, secondaryDoc (para o split-screen).
  - activePane ('primary' | 'secondary').
  - saveDocument (recebe a string, atualiza o store e chama o Go via Wails).

### 3.2. O Componente Editor (TipTap)
- [x] Criar <Editor /> envelopando o @tiptap/react.

- [x] Adicionar a extensão Markdown para que a entrada e saída sejam puro .md.

- [x] Implementar o hook useDebounce (ex: 800ms) no evento onUpdate do TipTap.

Fluxo: Digita -> Espera 800ms -> Dispara app.SaveDocument para o Go atualizar disco e SQLite de forma invisível.

### 3.3. O Split-Screen (Workspace)
- [x] Criar <Workspace /> que renderiza um ou dois <Editor /> lado a lado.

- [x] Aplicar classes Tailwind (opacity, grayscale) baseadas no activePane para guiar o foco visual.

## ⚡ Fase 4: A Central de Comando e Atalhos

### 4.1. Command Palette (cmdk)
- [x] Criar <CommandPalette /> estilizado com Tailwind.

- [x] Integrar useGlobalKeymap (fase de captura useCapture: true) para abrir com Cmd+K.

- [x] Implementar o parser no input (> tool: campaign vs busca livre).

- [x] Ligar o input de texto livre ao app.Search (SQLite via Wails).

### 4.2. Gestão de Teclas Global
- [x] Mapear Cmd+\ para alternar painéis (Split-screen focus).

- [x] Lidar com a tecla Esc em cascata: Fechar Palette -> Fechar Split-screen -> Tirar foco do TipTap.

## 🤖 Fase 5: "Text To Tool" (Processamento e IA)

### 5.1. O Router no Go
- [x] Criar app.ExecuteTool(req ToolRequest) no Go.

- [x] Extrair texto do documento ativo.

### 5.2. IA Local e BYOK (Bring Your Own Key)
- [x] Criar arquivo de configuração em ~/.writtt/config.json.

- [x] Implementar network.ScanLocalAI() para pingar porta TCP 11434 (Ollama) e evitar timeouts na UI.

Aproveitando que rodar modelos localmente numa placa robusta (como a RTX 3080) traz velocidade absurda para a geração de campanhas sem comprometer a privacidade.

- [x] Implementar o gerador de prompt e chamada HTTP para a IA.

- [x] Crucial: Criar o parser seguro (extractAndUnmarshal) para limpar markdown residual (`json ... `) e extrair o objeto puro das respostas do LLM.

### 5.3. Geração de Arquivos Filhos
- [x] Após o parse do JSON da IA, rodar o formatter em Go para criar novos arquivos físicos (ex: Thread do X, LinkedIn).

- [x] Injetar no SQLite em tempo real.

- [x] Retornar os novos IDs pro React abrir no Split-screen direito.

## 🖼 Fase 6: Polish e Mídia

### 6.1. Custom Asset Server (Imagens Locais)
- [x] Modificar a config do wails.Run em main.go para usar um http.Handler customizado.

- [x] Servir imagens da rota virtual /attachments/ apontando para ~/.writtt/data/attachments/.

### 6.2. Drag & Drop no TipTap
- [x] Interceptar handleDrop e handlePaste nas editorProps do TipTap.

- [x] Converter o File do navegador para Base64 no React.

- [x] Enviar para o Go (app.SaveAttachment), salvar em disco, retornar o path virtual e injetar o nó de imagem no editor.

## 🔒 Fase 7: Segurança e Vault (Adicionado)

### 7.1. Criptografia e Proteção de Privacidade
- [x] Senha App Mestra para encriptar notas sensíveis em repouso (AES-GCM e senhas baseadas em Argon2id).
- [x] PIN rápido (com lockout progressivo e anti-brute force) para desbloqueio em sessão.
- [x] Bloqueio Automático/Inatividade no frontend e tela de LockScreen dedicada.
- [x] Ocultação de pré-visualização no OS e no Command Palette quando a Vault estiver trancada.

### Skills
- Todas skills necessárias estão disponíveis no caminho "C:\Users\Marcelo\.gemini\antigravity\skills"