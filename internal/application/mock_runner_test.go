package application

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"writtt/internal/domain"
)

// inMemoryTestRunner implements domain.CommandRunner purely inside application tests
// so Layer 2 tests never import Layer 3 (`writtt/internal/adapters`).
type inMemoryTestRunner struct {
	mu            sync.RWMutex
	Files         map[string][]byte
	OpenPorts     map[string]bool
	Executed      []string
	OllamaModels  []string
	OllamaReply   string
	OllamaErr     error
	RemoteRelease domain.ReleaseUpdateDTO
	RemoteErr     error
}

func newInMemoryTestRunner() *inMemoryTestRunner {
	return &inMemoryTestRunner{
		Files:        make(map[string][]byte),
		OpenPorts:    map[string]bool{"127.0.0.1:11434": true},
		OllamaModels: []string{"llama3.2:latest", "mistral:latest"},
	}
}

func normTestPath(p string) string {
	return filepath.ToSlash(filepath.Clean(p))
}

func (m *inMemoryTestRunner) RunCommand(_ string, _ time.Duration, name string, args ...string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Executed = append(m.Executed, strings.TrimSpace(name+" "+strings.Join(args, " ")))
	return "ok", nil
}

func (m *inMemoryTestRunner) ReadFile(path string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if data, ok := m.Files[normTestPath(path)]; ok {
		cp := make([]byte, len(data))
		copy(cp, data)
		return cp, nil
	}
	return nil, os.ErrNotExist
}

func (m *inMemoryTestRunner) WriteFile(path string, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]byte, len(data))
	copy(cp, data)
	m.Files[normTestPath(path)] = cp
	return nil
}

func (m *inMemoryTestRunner) RemoveFile(path string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.Files, normTestPath(path))
	return nil
}

func (m *inMemoryTestRunner) ListFiles(dir string) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	prefix := strings.TrimRight(normTestPath(dir), "/") + "/"
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

func (m *inMemoryTestRunner) CheckTCPPort(address string, _ time.Duration) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.OpenPorts[address]
}

func (m *inMemoryTestRunner) QueryOllamaModels(_ string) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.OllamaErr != nil {
		return nil, m.OllamaErr
	}
	return append([]string(nil), m.OllamaModels...), nil
}

func (m *inMemoryTestRunner) GenerateOllamaText(_, model, prompt, _ string) (string, error) {
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

func (m *inMemoryTestRunner) ChatOllama(_ string, model string, messages []domain.OllamaChatMessage) (string, error) {
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

func (m *inMemoryTestRunner) FetchRemoteRelease(_, _ string, _ time.Duration) (domain.ReleaseUpdateDTO, error) {
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
