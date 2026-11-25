package adapters_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"writtt/internal/adapters"
	"writtt/internal/domain"
)

type sampleRPCService struct {
	title string
}

func (s *sampleRPCService) Echo(msg string, repeat int) (string, error) {
	if repeat < 0 {
		return "", errors.New("negative repeat")
	}
	return strings.Repeat(msg, repeat), nil
}

func (s *sampleRPCService) SetTitle(t string) {
	s.title = t
}

func (s *sampleRPCService) CheckError(fail bool) error {
	if fail {
		return errors.New("forced failure")
	}
	return nil
}

func (s *sampleRPCService) Startup() {
	s.title = "blocked"
}

func TestHTTPRPCGatewayAndSafeAttachments(t *testing.T) {
	attachDir := t.TempDir()
	svgFile := filepath.Join(attachDir, "drawing-1.svg")
	if err := os.WriteFile(svgFile, []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), 0600); err != nil {
		t.Fatalf("write svg failed: %v", err)
	}

	svc := &sampleRPCService{}
	gw := adapters.NewHTTPRPCGateway(svc, attachDir)
	mux := http.NewServeMux()
	gw.AttachRoutes(mux)

	// 1. Valid RPC method with prefix stripping
	body, _ := json.Marshal(map[string]any{
		"method": "main.App.Echo",
		"args":   []any{"ab", 3},
	})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/writtt/invoke", bytes.NewReader(body)))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"ababab"`) {
		t.Fatalf("unexpected Echo response: %d %s", rec.Code, rec.Body.String())
	}

	// 2. Void method returns result: true
	bodyVoid, _ := json.Marshal(map[string]any{"method": "SetTitle", "args": []any{"Writtt"}})
	recVoid := httptest.NewRecorder()
	mux.ServeHTTP(recVoid, httptest.NewRequest(http.MethodPost, "/api/writtt/invoke", bytes.NewReader(bodyVoid)))
	if recVoid.Code != http.StatusOK || svc.title != "Writtt" {
		t.Fatalf("unexpected void RPC result: %d %s", recVoid.Code, recVoid.Body.String())
	}

	// 3. Error-only method
	bodyErr, _ := json.Marshal(map[string]any{"method": "CheckError", "args": []any{true}})
	recErr := httptest.NewRecorder()
	mux.ServeHTTP(recErr, httptest.NewRequest(http.MethodPost, "/api/writtt/invoke", bytes.NewReader(bodyErr)))
	if recErr.Code != http.StatusBadRequest || !strings.Contains(recErr.Body.String(), "forced failure") {
		t.Fatalf("expected HTTP 400 forced failure, got %d %s", recErr.Code, recErr.Body.String())
	}

	// 4. Excluded lifecycle method must be blocked
	bodyBlocked, _ := json.Marshal(map[string]any{"method": "Startup"})
	recBlocked := httptest.NewRecorder()
	mux.ServeHTTP(recBlocked, httptest.NewRequest(http.MethodPost, "/api/writtt/invoke", bytes.NewReader(bodyBlocked)))
	if recBlocked.Code != http.StatusBadRequest {
		t.Fatalf("expected Startup to be blocked over HTTP RPC")
	}

	// 5. Safe attachment serving + SVG MIME + path traversal defense
	recSvg := httptest.NewRecorder()
	mux.ServeHTTP(recSvg, httptest.NewRequest(http.MethodGet, "/attachments/drawing-1.svg", nil))
	if recSvg.Code != http.StatusOK || !strings.HasPrefix(recSvg.Header().Get("Content-Type"), "image/svg+xml") {
		t.Fatalf("expected SVG 200 with image/svg+xml, got %d (%s)", recSvg.Code, recSvg.Header().Get("Content-Type"))
	}

	recTraversal := httptest.NewRecorder()
	reqTraversal := httptest.NewRequest(http.MethodGet, "/attachments/nested/secret.txt", nil)
	mux.ServeHTTP(recTraversal, reqTraversal)
	if recTraversal.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on nested attachment path, got %d", recTraversal.Code)
	}

	recEncodedTraversal := httptest.NewRecorder()
	reqEnc := httptest.NewRequest(http.MethodGet, "/attachments/%2e%2e%2fsecret.txt", nil)
	mux.ServeHTTP(recEncodedTraversal, reqEnc)
	if recEncodedTraversal.Code != http.StatusNotFound && recEncodedTraversal.Code != http.StatusTemporaryRedirect {
		t.Fatalf("expected 404/307 on encoded traversal, got %d", recEncodedTraversal.Code)
	}

	// 6. Method validation & malformed JSON handling on /api/writtt/invoke and /attachments/
	recGetInvoke := httptest.NewRecorder()
	mux.ServeHTTP(recGetInvoke, httptest.NewRequest(http.MethodGet, "/api/writtt/invoke", nil))
	if recGetInvoke.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 on GET /api/writtt/invoke, got %d", recGetInvoke.Code)
	}

	recPostAttach := httptest.NewRecorder()
	mux.ServeHTTP(recPostAttach, httptest.NewRequest(http.MethodPost, "/attachments/drawing-1.svg", nil))
	if recPostAttach.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 on POST /attachments/, got %d", recPostAttach.Code)
	}

	recBadJSON := httptest.NewRecorder()
	mux.ServeHTTP(recBadJSON, httptest.NewRequest(http.MethodPost, "/api/writtt/invoke", bytes.NewReader([]byte("{bad"))))
	if recBadJSON.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on malformed JSON, got %d", recBadJSON.Code)
	}

	recBadArg := httptest.NewRecorder()
	badArgBody, _ := json.Marshal(map[string]any{"method": "Echo", "args": []any{"hi", "not-an-int"}})
	mux.ServeHTTP(recBadArg, httptest.NewRequest(http.MethodPost, "/api/writtt/invoke", bytes.NewReader(badArgBody)))
	if recBadArg.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on invalid arg type, got %d", recBadArg.Code)
	}

	recMissingArgs := httptest.NewRecorder()
	missingArgBody, _ := json.Marshal(map[string]any{"method": "CheckError"})
	mux.ServeHTTP(recMissingArgs, httptest.NewRequest(http.MethodPost, "/api/writtt/invoke", bytes.NewReader(missingArgBody)))
	if recMissingArgs.Code != http.StatusOK {
		t.Fatalf("expected 200 with zero-value default arg, got %d", recMissingArgs.Code)
	}
}

func TestOSCommandRunnerChatOllamaAndFallback(t *testing.T) {
	runner := adapters.NewOSCommandRunner()
	chatSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/chat" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"message": map[string]string{"content": "<opinion>Ok</opinion><content>Pronto</content>"},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer chatSrv.Close()

	out, err := runner.ChatOllama(chatSrv.URL, "llama3.2:latest", []adapters.OllamaChatMessage{
		{Role: "system", Content: "sandbox"},
		{Role: "user", Content: "hello"},
	})
	if err != nil || !strings.Contains(out, "<content>Pronto</content>") {
		t.Fatalf("ChatOllama /api/chat failed: %v (%s)", err, out)
	}

	fallbackSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/chat" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.URL.Path == "/api/generate" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"response": "Fallback generate ok"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer fallbackSrv.Close()

	fbOut, err := runner.ChatOllama(fallbackSrv.URL, "llama3.2:latest", []adapters.OllamaChatMessage{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "hi"},
	})
	if err != nil || fbOut != "Fallback generate ok" {
		t.Fatalf("ChatOllama fallback to /api/generate failed: %v (%s)", err, fbOut)
	}

	mock := adapters.NewMockCommandRunner()
	mock.OllamaReply = ""
	mockOut, err := mock.ChatOllama("", "qwen2.5:7b", []adapters.OllamaChatMessage{{Role: "user", Content: "teste"}})
	if err != nil || !strings.Contains(mockOut, "<opinion>") {
		t.Fatalf("MockCommandRunner ChatOllama failed: %v (%s)", err, mockOut)
	}
}

func TestSQLiteSearchIndexZeroKnowledgeAndWatcher(t *testing.T) {
	dataDir := t.TempDir()
	idx, err := adapters.NewSQLiteSearchIndex(dataDir)
	if err != nil {
		t.Fatalf("NewSQLiteSearchIndex failed: %v", err)
	}
	defer idx.Close()

	pubDoc := domain.Document{
		Frontmatter: domain.Frontmatter{
			ID:        "doc-pub-1",
			Title:     "Public Architecture",
			Tags:      []string{"architecture", "open"},
			IsVault:   false,
			UpdatedAt: time.Now(),
		},
		Content: "Hexagonal clean architecture with deterministic adapters.",
	}
	vaultDoc := domain.Document{
		Frontmatter: domain.Frontmatter{
			ID:        "doc-vault-1",
			Title:     "Classified Manuscript",
			Tags:      []string{"vault"},
			IsVault:   true,
			UpdatedAt: time.Now(),
		},
		Content: "ULTRA_SECRET_PLAIN_NEVER_INDEXED",
	}

	if err := idx.SyncAll([]domain.Document{pubDoc, vaultDoc}); err != nil {
		t.Fatalf("SyncAll failed: %v", err)
	}
	if err := idx.SyncDocument(pubDoc); err != nil {
		t.Fatalf("SyncDocument failed: %v", err)
	}

	total, err := idx.Count(false)
	if err != nil || total != 2 {
		t.Fatalf("expected 2 total indexed docs, got %d (%v)", total, err)
	}
	vaultCount, err := idx.Count(true)
	if err != nil || vaultCount != 1 {
		t.Fatalf("expected 1 vault doc, got %d (%v)", vaultCount, err)
	}

	hits, err := idx.Search("Hexagonal", 10)
	if err != nil || len(hits) != 1 || hits[0].ID != "doc-pub-1" {
		t.Fatalf("expected FTS hit for pubDoc, got %+v (%v)", hits, err)
	}

	// Vault plaintext must NEVER appear in FTS5!
	leaks, err := idx.Search("ULTRA_SECRET_PLAIN_NEVER_INDEXED", 10)
	if err != nil || len(leaks) != 0 {
		t.Fatalf("Zero-Knowledge violation: vault plaintext leaked into FTS5: %+v", leaks)
	}

	if err := idx.DeleteDocument("doc-pub-1"); err != nil {
		t.Fatalf("DeleteDocument failed: %v", err)
	}
	afterDel, _ := idx.Count(false)
	if afterDel != 1 {
		t.Fatalf("expected 1 doc after delete, got %d", afterDel)
	}

	// Directory watcher test
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	notified := make(chan string, 4)
	if err := adapters.StartDirectoryWatcher(ctx, dataDir, func(id string) {
		notified <- id
	}); err != nil {
		t.Fatalf("StartDirectoryWatcher failed: %v", err)
	}
	time.Sleep(40 * time.Millisecond)
	_ = os.WriteFile(filepath.Join(dataDir, "doc-watched.md"), []byte("# Watched"), 0600)
	select {
	case gotID := <-notified:
		if gotID != "doc-watched" {
			t.Fatalf("expected watcher ID doc-watched, got %s", gotID)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for fsnotify watcher event")
	}
}
