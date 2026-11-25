package application

import (
	"fmt"
	"strings"
	"time"

	"writtt/internal/domain"
)

const writttSandboxSystemPrompt = `Voce e o Assistente Editorial do Writtt, executando em um ambiente 100% ISOLADO (sandbox somente-texto).
REGRAS ABSOLUTAS DE SEGURANCA:
1. Voce NAO tem acesso a terminal, sistema de arquivos, rede externa ou diretorios do usuario. Voce NUNCA cria arquivos nem executa comandos na maquina. Se o usuario pedir para criar um software ou codigo, entregue apenas o texto/codigo dentro da resposta para o usuario revisar dentro do Writtt.
2. Responda SEMPRE separando sua explicacao/opiniao do conteudo pronto para inserir no documento usando exatamente estas duas tags:
<opinion>
Sua analise, explicacao, sugestoes ou comentarios editoriais breves para o autor.
</opinion>
<content>
Apenas o texto, trecho reescrito ou codigo limpo pronto para ser inserido diretamente no documento, sem saudacoes nem comentarios extras.
</content>`

const writttFreeChatbotSystemPrompt = `Voce e um Chatbot Conversacional Local integrado ao Writtt, executando em um ambiente 100% ISOLADO (sandbox somente-texto).
REGRAS DE FUNCIONAMENTO:
1. Voce NAO tem acesso a terminal, sistema de arquivos, rede externa ou diretorios da maquina do usuario. Nunca execute comandos nem modifique arquivos.
2. Converse naturalmente com o usuario (brainstorming, pesquisa, debate de ideias, revisao conceitual, duvidas gerais ou conversa livre), SEM alterar o documento do usuario e SEM usar tags <opinion> ou <content>. Responda apenas em conversa clara e direta.`

// ScanLocalAI checks whether a local Ollama instance is reachable on 127.0.0.1:11434.
func (s *WritttService) ScanLocalAI() bool {
	return s.hal.CheckTCPPort("127.0.0.1:11434", time.Second)
}

// GetLocalModels lists installed Ollama models with deterministic defaults when offline.
func (s *WritttService) GetLocalModels() ([]string, error) {
	models, err := s.hal.QueryOllamaModels("")
	if err != nil || len(models) == 0 {
		return []string{"llama3.2:latest", "qwen2.5:7b", "deepseek-r1:8b"}, err
	}
	return models, nil
}

// GetLocalModelCapabilities returns installed Ollama models annotated with conversational chat capability.
func (s *WritttService) GetLocalModelCapabilities() ([]domain.AIModelCapabilityDTO, error) {
	models, err := s.GetLocalModels()
	caps := make([]domain.AIModelCapabilityDTO, 0, len(models))
	for _, m := range models {
		caps = append(caps, domain.ClassifyOllamaModelCapability(m))
	}
	return caps, err
}

// AskAssistant executes a single-shot prompt against local Ollama with Zero-Knowledge secret redaction.
func (s *WritttService) AskAssistant(model, prompt, contextStr string) (string, error) {
	if err := s.CheckRateLimit("ai.ask", 1); err != nil {
		return "", err
	}
	sanitizedCtx, redactions, err := domain.SanitizeContextForAI(contextStr, 50_000)
	if err != nil {
		return "", err
	}
	if len(redactions) > 0 {
		s.AppendConsoleAndAudit("ai.sanitizer", "ai.secret_redacted", fmt.Sprintf("%d segredos de alta entropia mascarados antes do envio ao modelo %s", len(redactions), model))
	}
	reply, err := s.hal.GenerateOllamaText("", model, prompt, sanitizedCtx)
	if err != nil {
		return "", err
	}
	s.AppendConsoleAndAudit("ai:"+model, "ai.generate", fmt.Sprintf("Assistente Ollama respondeu (%d chars)", len(reply)))
	return reply, nil
}

// ChatWithAssistant runs a strictly sandboxed multi-turn conversation against local Ollama (/api/chat)
// with Zero-Knowledge secret sanitization, optional local RAG context, and structured Opinion vs. Content separation.
func (s *WritttService) ChatWithAssistant(
	model string,
	history []domain.AIChatMessage,
	docContext string,
	selectedExcerpt string,
	useRAG bool,
) (*domain.AIChatReplyDTO, error) {
	if err := s.CheckRateLimit("ai.chat", 1); err != nil {
		return nil, err
	}
	if strings.TrimSpace(model) == "" {
		model = "llama3.2:latest"
	}

	sanitizedDoc, redDoc, err := domain.SanitizeContextForAI(docContext, 40_000)
	if err != nil {
		return nil, err
	}
	sanitizedSel, redSel, err := domain.SanitizeContextForAI(selectedExcerpt, 12_000)
	if err != nil {
		return nil, err
	}
	totalRedactions := len(redDoc) + len(redSel)

	var sysBuilder strings.Builder
	sysBuilder.WriteString(writttSandboxSystemPrompt)
	if strings.TrimSpace(sanitizedDoc) != "" {
		sysBuilder.WriteString("\n\n[MANUSCRITO ATUAL DO AUTOR (SOMENTE LEITURA)]\n")
		sysBuilder.WriteString(sanitizedDoc)
	}
	if strings.TrimSpace(sanitizedSel) != "" {
		sysBuilder.WriteString("\n\n[TRECHO SELECIONADO PELO AUTOR PARA ATUACAO DIRETA]\n")
		sysBuilder.WriteString(sanitizedSel)
	}

	ragUsed := 0
	if useRAG && len(history) > 0 {
		lastUserMsg := ""
		for i := len(history) - 1; i >= 0; i-- {
			if history[i].Role == "user" {
				lastUserMsg = history[i].Content
				break
			}
		}
		if strings.TrimSpace(lastUserMsg) != "" {
			if ragHits, ragErr := s.SearchWorkspaceRAG(lastUserMsg, 3); ragErr == nil && len(ragHits) > 0 {
				sysBuilder.WriteString("\n\n[TRECHOS RELACIONADOS DE OUTRAS OBRAS DESBLOQUEADAS (RAG LOCAL)]\n")
				for _, hit := range ragHits {
					sysBuilder.WriteString(fmt.Sprintf("- %s (%s): %s\n", hit.DocTitle, hit.Heading, hit.Snippet))
				}
				ragUsed = len(ragHits)
			}
		}
	}

	ollamaMsgs := make([]domain.OllamaChatMessage, 0, len(history)+1)
	ollamaMsgs = append(ollamaMsgs, domain.OllamaChatMessage{
		Role:    "system",
		Content: sysBuilder.String(),
	})
	for _, msg := range history {
		role := strings.ToLower(strings.TrimSpace(msg.Role))
		if role != "user" && role != "assistant" {
			continue
		}
		cleanMsg, redTurn, sanErr := domain.SanitizeContextForAI(msg.Content, 16_000)
		if sanErr != nil {
			return nil, sanErr
		}
		totalRedactions += len(redTurn)
		ollamaMsgs = append(ollamaMsgs, domain.OllamaChatMessage{
			Role:    role,
			Content: cleanMsg,
		})
	}

	if totalRedactions > 0 {
		s.AppendConsoleAndAudit("ai.sanitizer", "ai.secret_redacted", fmt.Sprintf("%d segredos mascarados antes do chat com %s", totalRedactions, model))
	}

	rawReply, err := s.hal.ChatOllama("", model, ollamaMsgs)
	if err != nil {
		return nil, err
	}
	opinion, insertable := domain.ParseStructuredAIReply(rawReply)
	s.AppendConsoleAndAudit("ai:"+model, "ai.chat", fmt.Sprintf("Chat isolado Ollama respondeu (%d chars, rag=%d, redacted=%d)", len(rawReply), ragUsed, totalRedactions))

	return &domain.AIChatReplyDTO{
		Raw:               rawReply,
		Opinion:           opinion,
		InsertableContent: insertable,
		HasInsertable:     strings.TrimSpace(insertable) != "",
		RedactedCount:     totalRedactions,
		RAGChunksUsed:     ragUsed,
		SandboxIsolated:   true,
	}, nil
}

// FreeChatWithAssistant runs a pure conversational chat session with a chat-capable local Ollama model
// without generating manuscript insertion blocks or modifying the user's content.
func (s *WritttService) FreeChatWithAssistant(
	model string,
	history []domain.AIChatMessage,
	includeDocContext bool,
	docContext string,
	useRAG bool,
) (*domain.AIChatReplyDTO, error) {
	if err := s.CheckRateLimit("ai.freechat", 1); err != nil {
		return nil, err
	}
	if strings.TrimSpace(model) == "" {
		model = "llama3.2:latest"
	}
	capInfo := domain.ClassifyOllamaModelCapability(model)
	if !capInfo.SupportsChat {
		return nil, fmt.Errorf("o modelo '%s' e dedicado a embeddings e nao suporta conversa por chat", model)
	}

	totalRedactions := 0
	var sysBuilder strings.Builder
	sysBuilder.WriteString(writttFreeChatbotSystemPrompt)

	if includeDocContext && strings.TrimSpace(docContext) != "" {
		sanitizedDoc, redDoc, err := domain.SanitizeContextForAI(docContext, 32_000)
		if err != nil {
			return nil, err
		}
		totalRedactions += len(redDoc)
		if strings.TrimSpace(sanitizedDoc) != "" {
			sysBuilder.WriteString("\n\n[CONTEXTO DE REFERENCIA DO MANUSCRITO ATUAL (APENAS PARA CONSULTA SE PERGUNTADO)]\n")
			sysBuilder.WriteString(sanitizedDoc)
		}
	}

	ragUsed := 0
	if useRAG && len(history) > 0 {
		lastUserMsg := ""
		for i := len(history) - 1; i >= 0; i-- {
			if history[i].Role == "user" {
				lastUserMsg = history[i].Content
				break
			}
		}
		if strings.TrimSpace(lastUserMsg) != "" {
			if ragHits, ragErr := s.SearchWorkspaceRAG(lastUserMsg, 3); ragErr == nil && len(ragHits) > 0 {
				sysBuilder.WriteString("\n\n[TRECHOS DE REFERENCIA DA BIBLIOTECA LOCAL (RAG)]\n")
				for _, hit := range ragHits {
					sysBuilder.WriteString(fmt.Sprintf("- %s (%s): %s\n", hit.DocTitle, hit.Heading, hit.Snippet))
				}
				ragUsed = len(ragHits)
			}
		}
	}

	ollamaMsgs := make([]domain.OllamaChatMessage, 0, len(history)+1)
	ollamaMsgs = append(ollamaMsgs, domain.OllamaChatMessage{
		Role:    "system",
		Content: sysBuilder.String(),
	})
	for _, msg := range history {
		role := strings.ToLower(strings.TrimSpace(msg.Role))
		if role != "user" && role != "assistant" {
			continue
		}
		cleanMsg, redTurn, sanErr := domain.SanitizeContextForAI(msg.Content, 16_000)
		if sanErr != nil {
			return nil, sanErr
		}
		totalRedactions += len(redTurn)
		ollamaMsgs = append(ollamaMsgs, domain.OllamaChatMessage{
			Role:    role,
			Content: cleanMsg,
		})
	}

	rawReply, err := s.hal.ChatOllama("", model, ollamaMsgs)
	if err != nil {
		return nil, err
	}

	// Clean any stray XML wrapper tags if a mock or model emits them
	cleanConv := strings.TrimSpace(rawReply)
	if op, ins := domain.ParseStructuredAIReply(cleanConv); strings.Contains(strings.ToLower(cleanConv), "<opinion>") || strings.Contains(strings.ToLower(cleanConv), "<content>") {
		if op != "" && ins != "" {
			cleanConv = op + "\n\n" + ins
		} else if op != "" {
			cleanConv = op
		} else if ins != "" {
			cleanConv = ins
		}
	}

	s.AppendConsoleAndAudit("ai:"+model, "ai.freechat", fmt.Sprintf("Chatbot livre Ollama respondeu (%d chars, rag=%d)", len(cleanConv), ragUsed))

	return &domain.AIChatReplyDTO{
		Raw:               cleanConv,
		Opinion:           cleanConv,
		InsertableContent: "",
		HasInsertable:     false,
		RedactedCount:     totalRedactions,
		RAGChunksUsed:     ragUsed,
		SandboxIsolated:   true,
	}, nil
}

// SearchWorkspaceRAG performs local L2-normalized cosine similarity retrieval across unlocked documents.
func (s *WritttService) SearchWorkspaceRAG(query string, topK int) ([]domain.RAGSearchResult, error) {
	if strings.TrimSpace(query) == "" {
		return []domain.RAGSearchResult{}, nil
	}
	docs, err := s.ListDocuments("all", 250)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	activePwd := string(s.activePassword)
	s.mu.Unlock()

	var allChunks []domain.RAGChunk
	for _, d := range docs {
		if d.IsVault && activePwd == "" {
			continue
		}
		fullDoc, readErr := s.ReadDocument(d.ID)
		if readErr != nil || fullDoc.Frontmatter.Encrypted {
			continue
		}
		cleanContent, _, sanErr := domain.SanitizeContextForAI(fullDoc.Content, 30_000)
		if sanErr != nil {
			continue
		}
		chunks := domain.ChunkDocumentForRAG(fullDoc.Frontmatter.ID, fullDoc.Frontmatter.Title, cleanContent, 120)
		allChunks = append(allChunks, chunks...)
	}
	results := domain.SearchSimilarChunks(query, allChunks, topK)
	s.AppendConsoleAndAudit("ai.rag", "rag.search", fmt.Sprintf("Busca semantica RAG executada sobre %d chunks (%d resultados)", len(allChunks), len(results)))
	return results, nil
}

// CheckForUpdates anonymously checks whether a newer SemVer release of Writtt is available
// without transmitting any personal, machine, or document data.
func (s *WritttService) CheckForUpdates(currentVersion string) domain.ReleaseUpdateDTO {
	cleanCur := strings.TrimSpace(currentVersion)
	baseOut := domain.ReleaseUpdateDTO{
		HasUpdate:      false,
		CurrentVersion: cleanCur,
		LatestVersion:  cleanCur,
		DownloadURL:    "https://www.writtt.com/#download",
		ReleaseURL:     "https://github.com/marcelomatz/writtt/releases/latest",
	}
	if cleanCur == "" || cleanCur == "dev" || s.hal == nil {
		return baseOut
	}
	if err := s.CheckRateLimit("app.update_check", 1); err != nil {
		return baseOut
	}

	remote, err := s.hal.FetchRemoteRelease(
		"https://www.writtt.com/version.json",
		"marcelomatz/writtt",
		4*time.Second,
	)
	if err != nil || strings.TrimSpace(remote.LatestVersion) == "" {
		return baseOut
	}

	hasNewer := domain.CompareSemVer(remote.LatestVersion, cleanCur) > 0
	dlURL := strings.TrimSpace(remote.DownloadURL)
	if dlURL == "" {
		dlURL = baseOut.DownloadURL
	}
	relURL := strings.TrimSpace(remote.ReleaseURL)
	if relURL == "" {
		relURL = baseOut.ReleaseURL
	}

	return domain.ReleaseUpdateDTO{
		HasUpdate:      hasNewer,
		CurrentVersion: cleanCur,
		LatestVersion:  remote.LatestVersion,
		DownloadURL:    dlURL,
		ReleaseURL:     relURL,
		PublishedAt:    remote.PublishedAt,
		Summary:        remote.Summary,
	}
}
