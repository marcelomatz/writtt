package models

import "time"

// Frontmatter represents the YAML header of a Markdown document.
type Frontmatter struct {
	ID        string    `yaml:"id" json:"id"`
	Type      string    `yaml:"type" json:"type"`
	Title     string    `yaml:"title" json:"title"`
	CreatedAt time.Time `yaml:"created_at" json:"created_at,omitempty"`
	UpdatedAt time.Time `yaml:"updated_at" json:"updated_at,omitempty"`
	Tags      []string  `yaml:"tags" json:"tags"`
	IsVault   bool      `yaml:"is_vault" json:"is_vault"`
	Encrypted bool      `yaml:"encrypted,omitempty" json:"encrypted,omitempty"`
	Version   int       `yaml:"version" json:"version"`
	// Split / sub-document support
	ParentID string `yaml:"parent_id,omitempty" json:"parent_id,omitempty"`
	DocType  string `yaml:"doc_type,omitempty" json:"doc_type,omitempty"`
}

// Document represents a fully loaded document.
type Document struct {
	Frontmatter Frontmatter `json:"frontmatter"`
	Content     string      `json:"content"`
	Raw         string      `json:"raw"`
}

// SearchResult represents a single item found via FTS5.
type SearchResult struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Snippet   string    `json:"snippet"`
	Tags      []string  `json:"tags"`
	IsVault   bool      `json:"is_vault"`
	UpdatedAt time.Time `json:"updated_at"`
	ParentID  string    `json:"parent_id,omitempty"`
	DocType   string    `json:"doc_type,omitempty"`
}

// ToolRequest represents a payload for the "Text to Tool" execution
type ToolRequest struct {
	DocID string `json:"doc_id"`
	Tool  string `json:"tool"`
	Text  string `json:"text"` // the extracted text to process
}
