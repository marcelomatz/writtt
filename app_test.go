package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"writtt/internal/adapters"
	"writtt/internal/application"
	"writtt/internal/domain"
)

func TestAppFacadeAndHTTPFallbackRPC(t *testing.T) {
	mock := adapters.NewMockCommandRunner()
	mock.RemoteRelease = domain.ReleaseUpdateDTO{
		LatestVersion: "v0.3.0",
		DownloadURL:   "https://www.writtt.com/#download",
		ReleaseURL:    "https://github.com/marcelomatz/writtt/releases/tag/v0.3.0",
	}
	app := &App{
		svc: application.NewWritttService(mock, "/mock/app"),
	}

	if app.GetVersion() != CurrentVersion {
		t.Fatalf("expected version %s, got %s", CurrentVersion, app.GetVersion())
	}

	id, err := app.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{
			Title: "Facade Doc",
			Tags:  []string{"facade"},
		},
		Content: "# Capitulo 1\n\nConteudo de teste.",
	})
	if err != nil || id == "" {
		t.Fatalf("SaveDocument failed: %v", err)
	}

	analysis := app.AnalyzeDocumentContent("# Capitulo 1\n\nConteudo de teste.")
	if analysis["stats"] == nil || analysis["chapters"] == nil {
		t.Fatalf("expected stats and chapters in AnalyzeDocumentContent")
	}

	mux := http.NewServeMux()
	app.AttachHTTPRoutes(mux)

	invokeRPC := func(method string, args ...any) map[string]any {
		rawArgs := make([]json.RawMessage, 0, len(args))
		for _, a := range args {
			b, _ := json.Marshal(a)
			rawArgs = append(rawArgs, b)
		}
		body, _ := json.Marshal(adapters.RPCInvokeRequest{
			Method: method,
			Args:   rawArgs,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/writtt/invoke", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		var out map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out
	}

	resVer := invokeRPC("main.App.GetVersion")
	if resVer["result"] != CurrentVersion {
		t.Fatalf("expected HTTP RPC GetVersion=%s, got %v", CurrentVersion, resVer)
	}

	resList := invokeRPC("ListDocuments", "all", 50)
	if resList["error"] != nil {
		t.Fatalf("unexpected error on ListDocuments RPC: %v", resList["error"])
	}

	resRead := invokeRPC("ReadDocument", id)
	if resRead["error"] != nil {
		t.Fatalf("unexpected error on ReadDocument RPC: %v", resRead["error"])
	}

	resZKP := invokeRPC("SimulateZKPRound", 8, "path-A")
	if resZKP["error"] != nil {
		t.Fatalf("unexpected error on SimulateZKPRound RPC: %v", resZKP["error"])
	}

	resAlgo := invokeRPC("GetAlgorithmsLabReport")
	if resAlgo["error"] != nil {
		t.Fatalf("unexpected error on GetAlgorithmsLabReport RPC: %v", resAlgo["error"])
	}

	if resCrumbs := invokeRPC("GetDocumentBreadcrumbs", id); resCrumbs["error"] != nil {
		t.Fatalf("unexpected error on GetDocumentBreadcrumbs RPC: %v", resCrumbs["error"])
	}
	if resReorder := invokeRPC("ReorderDocuments", "", []string{id}); resReorder["error"] != nil {
		t.Fatalf("unexpected error on ReorderDocuments RPC: %v", resReorder["error"])
	}
	if resRAG := invokeRPC("SearchWorkspaceRAG", "Capitulo Conteudo", 5); resRAG["error"] != nil {
		t.Fatalf("unexpected error on SearchWorkspaceRAG RPC: %v", resRAG["error"])
	}
	if resDevs := invokeRPC("ListTrustedDevices"); resDevs["error"] != nil {
		t.Fatalf("unexpected error on ListTrustedDevices RPC: %v", resDevs["error"])
	}
	if resRegDev := invokeRPC("RegisterTrustedDevice", "Workstation B"); resRegDev["error"] != nil {
		t.Fatalf("unexpected error on RegisterTrustedDevice RPC: %v", resRegDev["error"])
	}
	if resAlias := invokeRPC("GetOperatorAlias"); resAlias["error"] != nil {
		t.Fatalf("unexpected error on GetOperatorAlias RPC: %v", resAlias["error"])
	}
	if resSetAlias := invokeRPC("SetOperatorAlias", "@rpc-operator"); resSetAlias["error"] != nil {
		t.Fatalf("unexpected error on SetOperatorAlias RPC: %v", resSetAlias["error"])
	}
	if resAuto := invokeRPC("AutoSaveDocument", domain.Document{
		Frontmatter: domain.Frontmatter{ID: id, Title: "Facade Doc Auto", Tags: []string{"facade"}},
		Content:     "# Capitulo 1\n\nConteudo auto-salvo.",
	}); resAuto["error"] != nil {
		t.Fatalf("unexpected error on AutoSaveDocument RPC: %v", resAuto["error"])
	}
	if resImport := invokeRPC("ImportDocumentContent", "manuscrito.md", "# Obra Inedita\n\nRascunho protegido.", false); resImport["error"] != nil {
		t.Fatalf("unexpected error on ImportDocumentContent RPC: %v", resImport["error"])
	}
	if resProof := invokeRPC("GenerateAuthorshipProof", id); resProof["error"] != nil {
		t.Fatalf("unexpected error on GenerateAuthorshipProof RPC: %v", resProof["error"])
	}
	if resChat := invokeRPC("ChatWithAssistant", "llama3.2:latest", []domain.AIChatMessage{{Role: "user", Content: "Melhore este resumo"}}, "# Obra", "Trecho", false); resChat["error"] != nil {
		t.Fatalf("unexpected error on ChatWithAssistant RPC: %v", resChat["error"])
	}
	if resFreeChat := invokeRPC("FreeChatWithAssistant", "llama3.2:latest", []domain.AIChatMessage{{Role: "user", Content: "Sugira estrutura"}}, true, "# Obra", false); resFreeChat["error"] != nil {
		t.Fatalf("unexpected error on FreeChatWithAssistant RPC: %v", resFreeChat["error"])
	}
	if resBridgeSet := invokeRPC("SetActiveEditorBridgeDoc", id); resBridgeSet["error"] != nil {
		t.Fatalf("unexpected error on SetActiveEditorBridgeDoc RPC: %v", resBridgeSet["error"])
	}
	resBridgeGet := invokeRPC("GetActiveEditorBridgeDoc")
	if resBridgeGet["error"] != nil || resBridgeGet["result"] != id {
		t.Fatalf("expected GetActiveEditorBridgeDoc=%s, got %+v", id, resBridgeGet)
	}
	if resRemoteIns := invokeRPC("InsertFromDetachedAIWindow", "Paragrafo encaminhado do segundo monitor."); resRemoteIns["error"] != nil {
		t.Fatalf("unexpected error on InsertFromDetachedAIWindow RPC: %v", resRemoteIns["error"])
	}
	if resCloseWin := invokeRPC("CloseDetachedAIWindow", false); resCloseWin["error"] != nil {
		t.Fatalf("unexpected error on CloseDetachedAIWindow RPC: %v", resCloseWin["error"])
	}
	resUpd := invokeRPC("CheckForUpdates")
	if resUpd["error"] != nil {
		t.Fatalf("unexpected error on CheckForUpdates RPC: %v", resUpd["error"])
	}
	updMap, _ := resUpd["result"].(map[string]any)
	if updMap["hasUpdate"] != true || updMap["latestVersion"] != "v0.3.0" {
		t.Fatalf("expected CheckForUpdates hasUpdate=true (v0.3.0), got %+v", resUpd)
	}
	if resLock := invokeRPC("LockVault"); resLock["error"] != nil {
		t.Fatalf("unexpected error on void LockVault RPC: %v", resLock["error"])
	}
	// Raw string-only unlock endpoints must be blocked on HTTP RPC to prevent automated curl/Python brute-force scripts
	for _, blockedAuthMethod := range []string{"UnlockApp", "UnlockVault", "UnlockVaultWithPIN"} {
		if resBlocked := invokeRPC(blockedAuthMethod, "guess"); resBlocked["error"] == nil {
			t.Fatalf("expected raw %s to be blocked over HTTP RPC against brute-force scripts", blockedAuthMethod)
		}
	}
	if resCh := invokeRPC("BeginAuthChallenge"); resCh["error"] != nil {
		t.Fatalf("expected BeginAuthChallenge to be available over HTTP RPC: %v", resCh["error"])
	}
	app.Shutdown()

	resUnknown := invokeRPC("NonExistentMethod")
	if resUnknown["error"] == nil {
		t.Fatalf("expected error on unknown RPC method")
	}
}

func TestAppSQLiteFTS5SearchAndVaultScrubbing(t *testing.T) {
	tmpDir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	app := &App{
		svc: application.NewWritttService(adapters.NewOSCommandRunner(), tmpDir),
	}
	app.Startup(ctx)
	defer app.Shutdown()

	if err := app.SetPassword("", "MasterVault#2026"); err != nil {
		t.Fatalf("SetPassword failed: %v", err)
	}

	openID, err := app.SaveDocument(domain.Document{
		Frontmatter: domain.Frontmatter{
			Title:   "Capitulo Aberto",
			Tags:    []string{"romance"},
			IsVault: false,
		},
		Content: "A carruagem atravessou a neblina silenciosa do porto.",
	})
	if err != nil {
		t.Fatalf("SaveDocument open failed: %v", err)
	}

	// Open manuscript phrase must match via SQLite FTS5 without raw HTML highlight tags
	hits, err := app.Search("carruagem")
	if err != nil || len(hits) != 1 || hits[0].ID != openID {
		t.Fatalf("expected FTS5 search hit for 'carruagem', got %+v (%v)", hits, err)
	}
	if strings.Contains(hits[0].Snippet, "<b>") {
		t.Fatalf("expected clean snippet without HTML tags, got %q", hits[0].Snippet)
	}

	// Seal the manuscript in the Vault and lock the Vault -> FTS5 must be scrubbed!
	if err := app.UpdateMetadata(openID, []string{"romance"}, true); err != nil {
		t.Fatalf("UpdateMetadata to Vault failed: %v", err)
	}
	app.LockVault()

	leakedHits, err := app.Search("carruagem")
	if err != nil || len(leakedHits) != 0 {
		t.Fatalf("expected zero FTS5 search hits after sealing & locking Vault, got %+v (%v)", leakedHits, err)
	}
}
