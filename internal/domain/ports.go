package domain

import "time"

// CommandRunner defines the pure Hexagonal Port (Dependency Inversion) for platform filesystem,
// local TCP/Ollama sandboxed communication, and anonymous release update checks.
// Concrete implementations (OSCommandRunner and MockCommandRunner) live in internal/adapters.
type CommandRunner interface {
	RunCommand(dir string, timeout time.Duration, name string, args ...string) (string, error)
	ReadFile(path string) ([]byte, error)
	WriteFile(path string, data []byte) error
	RemoveFile(path string) error
	ListFiles(dir string) ([]string, error)
	CheckTCPPort(address string, timeout time.Duration) bool
	QueryOllamaModels(baseURL string) ([]string, error)
	GenerateOllamaText(baseURL, model, prompt, systemCtx string) (string, error)
	ChatOllama(baseURL, model string, messages []OllamaChatMessage) (string, error)
	FetchRemoteRelease(manifestURL, githubRepo string, timeout time.Duration) (ReleaseUpdateDTO, error)
}
