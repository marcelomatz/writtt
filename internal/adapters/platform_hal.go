// Package adapters implementa a Camada de Isolamento de Plataforma (Hardware/OS Abstraction Layer - HAL)
// do Writtt, permitindo I/O real em disco (0600/0700), verificação TCP/HTTP (Ollama) e execução 100% em memória nos testes.
package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"writtt/internal/domain"
)

// OllamaChatMessage aliases domain.OllamaChatMessage for backwards compatibility in adapter tests.
type OllamaChatMessage = domain.OllamaChatMessage

// CommandRunner aliases the pure Layer 1 Hexagonal Port domain.CommandRunner.
type CommandRunner = domain.CommandRunner

var (
	_ domain.CommandRunner = (*OSCommandRunner)(nil)
	_ domain.CommandRunner = (*MockCommandRunner)(nil)
)

// OSCommandRunner executa operações reais no sistema operacional e rede local.
type OSCommandRunner struct{}

func NewOSCommandRunner() *OSCommandRunner {
	return &OSCommandRunner{}
}

func (r *OSCommandRunner) RunCommand(dir string, timeout time.Duration, name string, args ...string) (string, error) {
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	return strings.TrimSpace(out.String()), err
}

func (r *OSCommandRunner) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(path)
}

func (r *OSCommandRunner) WriteFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func (r *OSCommandRunner) RemoveFile(path string) error {
	err := os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (r *OSCommandRunner) ListFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names, nil
}

func (r *OSCommandRunner) CheckTCPPort(address string, timeout time.Duration) bool {
	if timeout <= 0 {
		timeout = time.Second
	}
	conn, err := net.DialTimeout("tcp", address, timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func (r *OSCommandRunner) QueryOllamaModels(baseURL string) ([]string, error) {
	if baseURL == "" {
		baseURL = "http://127.0.0.1:11434"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(strings.TrimRight(baseURL, "/") + "/api/tags")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama status %d", resp.StatusCode)
	}
	var parsed struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(parsed.Models))
	for _, m := range parsed.Models {
		out = append(out, m.Name)
	}
	return out, nil
}

func (r *OSCommandRunner) GenerateOllamaText(baseURL, model, prompt, systemCtx string) (string, error) {
	if baseURL == "" {
		baseURL = "http://127.0.0.1:11434"
	}
	payload := map[string]any{
		"model":  model,
		"prompt": prompt,
		"system": systemCtx,
		"stream": false,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Post(strings.TrimRight(baseURL, "/")+"/api/generate", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ollama error %d: %s", resp.StatusCode, string(b))
	}
	var gen struct {
		Response string `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&gen); err != nil {
		return "", err
	}
	return gen.Response, nil
}

// ChatOllama sends a sandboxed multi-turn conversation to local Ollama (/api/chat) with zero tool-calling
// and automatic fallback to /api/generate for older models. Never touches disk or executes OS commands.
func (r *OSCommandRunner) ChatOllama(baseURL, model string, messages []OllamaChatMessage) (string, error) {
	if baseURL == "" {
		baseURL = "http://127.0.0.1:11434"
	}
	payload := map[string]any{
		"model":    model,
		"messages": messages,
		"stream":   false,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Post(strings.TrimRight(baseURL, "/")+"/api/chat", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusMethodNotAllowed {
		// Graceful fallback to /api/generate for models/versions without /api/chat
		var sysCtx string
		var conv strings.Builder
		for _, m := range messages {
			if m.Role == "system" {
				sysCtx += m.Content + "\n"
			} else {
				conv.WriteString(strings.ToUpper(m.Role) + ": " + m.Content + "\n\n")
			}
		}
		return r.GenerateOllamaText(baseURL, model, conv.String(), sysCtx)
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ollama chat error %d: %s", resp.StatusCode, string(b))
	}
	var parsed struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		Response string `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if strings.TrimSpace(parsed.Message.Content) != "" {
		return parsed.Message.Content, nil
	}
	return parsed.Response, nil
}

// FetchRemoteRelease performs an anonymous, zero-telemetry GET against the official Writtt static manifest
// (https://www.writtt.com/version.json) with graceful fallback to GitHub Releases API.
func (r *OSCommandRunner) FetchRemoteRelease(manifestURL, githubRepo string, timeout time.Duration) (domain.ReleaseUpdateDTO, error) {
	if timeout <= 0 {
		timeout = 4 * time.Second
	}
	client := &http.Client{Timeout: timeout}

	if strings.TrimSpace(manifestURL) != "" {
		req, err := http.NewRequest(http.MethodGet, manifestURL, nil)
		if err == nil {
			req.Header.Set("Accept", "application/json")
			req.Header.Set("User-Agent", "Writtt-Desktop")
			if resp, doErr := client.Do(req); doErr == nil {
				defer resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					var mf struct {
						Version     string `json:"version"`
						Tag         string `json:"tag"`
						DownloadURL string `json:"downloadUrl"`
						ReleaseURL  string `json:"releaseUrl"`
						PublishedAt string `json:"publishedAt"`
						Summary     string `json:"summary"`
					}
					if json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&mf) == nil {
						ver := strings.TrimSpace(mf.Tag)
						if ver == "" {
							ver = strings.TrimSpace(mf.Version)
						}
						if ver != "" {
							if !strings.HasPrefix(ver, "v") {
								ver = "v" + ver
							}
							return domain.ReleaseUpdateDTO{
								LatestVersion: ver,
								DownloadURL:   strings.TrimSpace(mf.DownloadURL),
								ReleaseURL:    strings.TrimSpace(mf.ReleaseURL),
								PublishedAt:   strings.TrimSpace(mf.PublishedAt),
								Summary:       strings.TrimSpace(mf.Summary),
							}, nil
						}
					}
				}
			}
		}
	}

	if strings.TrimSpace(githubRepo) == "" {
		return domain.ReleaseUpdateDTO{}, fmt.Errorf("no release source configured")
	}
	ghURL := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", strings.TrimSpace(githubRepo))
	req, err := http.NewRequest(http.MethodGet, ghURL, nil)
	if err != nil {
		return domain.ReleaseUpdateDTO{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Writtt-Desktop")

	resp, err := client.Do(req)
	if err != nil {
		return domain.ReleaseUpdateDTO{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return domain.ReleaseUpdateDTO{}, fmt.Errorf("github release status %d", resp.StatusCode)
	}
	var gh struct {
		TagName     string `json:"tag_name"`
		HTMLURL     string `json:"html_url"`
		PublishedAt string `json:"published_at"`
		Name        string `json:"name"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 128*1024)).Decode(&gh); err != nil {
		return domain.ReleaseUpdateDTO{}, err
	}
	return domain.ReleaseUpdateDTO{
		LatestVersion: strings.TrimSpace(gh.TagName),
		DownloadURL:   "https://www.writtt.com/#download",
		ReleaseURL:    strings.TrimSpace(gh.HTMLURL),
		PublishedAt:   strings.TrimSpace(gh.PublishedAt),
		Summary:       strings.TrimSpace(gh.Name),
	}, nil
}

// MockCommandRunner fornece um HAL determinístico em memória para testes unitários offline.
type MockCommandRunner struct {
	mu            sync.RWMutex
	Files         map[string][]byte
	CommandOuts   map[string]string
	CommandErrs   map[string]error
	OpenPorts     map[string]bool
	OllamaModels  []string
	OllamaReply   string
	OllamaErr     error
	RemoteRelease domain.ReleaseUpdateDTO
	RemoteErr     error
	Executed      []string
}

func NewMockCommandRunner() *MockCommandRunner {
	return &MockCommandRunner{
		Files:        make(map[string][]byte),
		CommandOuts:  make(map[string]string),
		CommandErrs:  make(map[string]error),
		OpenPorts:    map[string]bool{"127.0.0.1:11434": true},
		OllamaModels: []string{"llama3.2:latest", "qwen2.5:7b"},
		OllamaReply:  "# Revisao Editorial\nTexto revisado com clareza executiva.",
	}
}

func normPath(p string) string {
	return filepath.ToSlash(filepath.Clean(p))
}

func (m *MockCommandRunner) RunCommand(_ string, _ time.Duration, name string, args ...string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sig := strings.TrimSpace(name + " " + strings.Join(args, " "))
	m.Executed = append(m.Executed, sig)
	if err, ok := m.CommandErrs[sig]; ok {
		return m.CommandOuts[sig], err
	}
	if out, ok := m.CommandOuts[sig]; ok {
		return out, nil
	}
	return "ok", nil
}

func (m *MockCommandRunner) ReadFile(path string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if data, ok := m.Files[normPath(path)]; ok {
		cp := make([]byte, len(data))
		copy(cp, data)
		return cp, nil
	}
	return nil, os.ErrNotExist
}

func (m *MockCommandRunner) WriteFile(path string, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]byte, len(data))
	copy(cp, data)
	m.Files[normPath(path)] = cp
	return nil
}

func (m *MockCommandRunner) RemoveFile(path string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.Files, normPath(path))
	return nil
}

func (m *MockCommandRunner) ListFiles(dir string) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	prefix := strings.TrimRight(normPath(dir), "/") + "/"
	var names []string
	for k := range m.Files {
		if strings.HasPrefix(k, prefix) {
			rest := strings.TrimPrefix(k, prefix)
			if !strings.Contains(rest, "/") && rest != "" {
				names = append(names, rest)
			}
		}
	}
	sort.Strings(names)
	return names, nil
}

func (m *MockCommandRunner) CheckTCPPort(address string, _ time.Duration) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.OpenPorts[address]
}

func (m *MockCommandRunner) QueryOllamaModels(_ string) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.OllamaErr != nil {
		return nil, m.OllamaErr
	}
	return append([]string(nil), m.OllamaModels...), nil
}

func (m *MockCommandRunner) GenerateOllamaText(_, model, prompt, _ string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.OllamaErr != nil {
		return "", m.OllamaErr
	}
	if m.OllamaReply != "" {
		return m.OllamaReply, nil
	}
	return fmt.Sprintf("[%s] %s", model, prompt), nil
}

func (m *MockCommandRunner) ChatOllama(_ string, model string, messages []OllamaChatMessage) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.OllamaErr != nil {
		return "", m.OllamaErr
	}
	if m.OllamaReply != "" {
		return m.OllamaReply, nil
	}
	last := ""
	if len(messages) > 0 {
		last = messages[len(messages)-1].Content
	}
	return fmt.Sprintf("<opinion>Analise editorial isolada (%s).</opinion>\n<content>Conteudo pronto para: %s</content>", model, last), nil
}

func (m *MockCommandRunner) FetchRemoteRelease(_, _ string, _ time.Duration) (domain.ReleaseUpdateDTO, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.RemoteErr != nil {
		return domain.ReleaseUpdateDTO{}, m.RemoteErr
	}
	if m.RemoteRelease.LatestVersion != "" {
		return m.RemoteRelease, nil
	}
	return domain.ReleaseUpdateDTO{
		LatestVersion: "v0.2.0",
		DownloadURL:   "https://www.writtt.com/#download",
		ReleaseURL:    "https://github.com/marcelomatz/writtt/releases/latest",
	}, nil
}
