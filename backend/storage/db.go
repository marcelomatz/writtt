package storage

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"

	"writtt/backend/models"

	"github.com/fsnotify/fsnotify"
	_ "github.com/glebarez/go-sqlite"
)

var (
	db    *sql.DB
	mutex sync.Mutex
)

// InitDB initializes the SQLite FTS5 database in ~/.writtt/data/writtt.db
func InitDB() error {
	dir := GetAppDir()
	dbPath := filepath.Join(dir, "writtt.db")

	log.Printf("Initializing database at: %s\n", dbPath)
	var err error
	// Use 'sqlite' driver name for glebarez CGO-free version
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Ping to force connection and file creation
	if err = db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	// Create tables
	queries := []string{
		`CREATE TABLE IF NOT EXISTS documents (
			id TEXT PRIMARY KEY,
			type TEXT,
			title TEXT,
			tags TEXT,
			is_vault BOOLEAN DEFAULT 0,
			version INTEGER DEFAULT 1,
			updated_at DATETIME
		);`,
		`CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
			id UNINDEXED,
			title,
			content
		);`,
	}

	for _, q := range queries {
		_, err = db.Exec(q)
		if err != nil {
			log.Printf("Error creating table: %v\n", err)
			// Don't return error for FTS5 if it already exists or has issues,
			// but we need the main table.
			if !strings.Contains(q, "fts") {
				return fmt.Errorf("error creating table: %w", err)
			}
		}
	}

	// Simple migration: Add columns if they don't exist
	migrationQueries := []string{
		`ALTER TABLE documents ADD COLUMN tags TEXT;`,
		`ALTER TABLE documents ADD COLUMN is_vault BOOLEAN DEFAULT 0;`,
		`ALTER TABLE documents ADD COLUMN version INTEGER DEFAULT 1;`,
		`ALTER TABLE documents ADD COLUMN parent_id TEXT DEFAULT '';`,
		`ALTER TABLE documents ADD COLUMN doc_type TEXT DEFAULT 'document';`,
	}

	for _, q := range migrationQueries {
		_, err = db.Exec(q)
		if err != nil {
			// Ignore error if column already exists (SQL logic error: duplicate column name)
			// log.Printf("Migration notice (expected if already migrated): %v\n", err)
		}
	}

	return nil
}

// SyncIndex reads all markdown files in data/ and inserts/updates them in DB
func SyncIndex() error {
	mutex.Lock()
	defer mutex.Unlock()

	dir := GetAppDir()
	files, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	for _, f := range files {
		if !f.IsDir() && filepath.Ext(f.Name()) == ".md" {
			id := strings.TrimSuffix(f.Name(), ".md")
			doc, err := ReadDisk(id)
			if err != nil {
				log.Printf("Error reading %s: %v\n", f.Name(), err)
				continue
			}

			log.Printf("Indexing document: %s (%s)\n", doc.Frontmatter.Title, id)

			tagsStr := strings.Join(doc.Frontmatter.Tags, ",")

			// Upsert into normal table
			_, err = tx.Exec(`
				INSERT INTO documents (id, type, title, tags, is_vault, version, updated_at, parent_id, doc_type) 
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET 
				type=excluded.type, title=excluded.title, tags=excluded.tags, 
				is_vault=excluded.is_vault, version=excluded.version, updated_at=excluded.updated_at,
				parent_id=excluded.parent_id, doc_type=excluded.doc_type
			`, doc.Frontmatter.ID, doc.Frontmatter.Type, doc.Frontmatter.Title, tagsStr, doc.Frontmatter.IsVault, doc.Frontmatter.Version, doc.Frontmatter.UpdatedAt, doc.Frontmatter.ParentID, doc.Frontmatter.DocType)
			if err != nil {
				log.Printf("Error indexing document %s: %v\n", id, err)
				continue
			}

			// Delete from FTS, then Insert.
			// M-3: never store vault doc content in the FTS index — it would
			// hold plaintext even when the file is encrypted on disk.
			ftsContent := doc.Content
			if doc.Frontmatter.IsVault {
				ftsContent = ""
			}
			_, _ = tx.Exec(`DELETE FROM documents_fts WHERE id = ?`, doc.Frontmatter.ID)
			_, _ = tx.Exec(`
				INSERT INTO documents_fts (id, title, content) 
				VALUES (?, ?, ?)
			`, doc.Frontmatter.ID, doc.Frontmatter.Title, ftsContent)
		}
	}

	return tx.Commit()
}

// sanitizeFTSQuery strips FTS5 operator characters to prevent injection.
// Allows only letters, digits, spaces, underscores, and hyphens.
func sanitizeFTSQuery(q string) string {
	var b strings.Builder
	for _, r := range q {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

// Search searches for text in FTS5
func Search(query string) ([]models.SearchResult, error) {
	// M-5: sanitize to prevent FTS5 operator injection.
	query = sanitizeFTSQuery(query)
	if query == "" {
		return nil, nil
	}

	// FTS5 MATCH syntax uses MATCH '*query*'
	ftsQuery := fmt.Sprintf("*%s*", query)

	rows, err := db.Query(`
		SELECT d.id, d.type, d.title, d.tags, d.is_vault, snippet(documents_fts, -1, '<b>', '</b>', '...', 15) as snippet, d.updated_at
		FROM documents_fts f
		JOIN documents d ON f.id = d.id
		WHERE documents_fts MATCH ?
		ORDER BY rank LIMIT 20
	`, ftsQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.SearchResult
	for rows.Next() {
		var res models.SearchResult
		var updated_at time.Time
		var tagsStr string
		err = rows.Scan(&res.ID, &res.Type, &res.Title, &tagsStr, &res.IsVault, &res.Snippet, &updated_at)
		if err != nil {
			continue
		}
		if tagsStr != "" {
			res.Tags = strings.Split(tagsStr, ",")
		} else {
			res.Tags = []string{}
		}
		res.UpdatedAt = updated_at
		results = append(results, res)
	}

	return results, nil
}

// ListDocuments returns documents based on filter
func ListDocuments(filter string, limit int) ([]models.SearchResult, error) {
	var query string
	switch filter {
	case "recent":
		query = `SELECT d.id, d.type, d.title, d.tags, d.is_vault, COALESCE(SUBSTR(f.content, 1, 100), '') as snippet, d.updated_at 
				 FROM documents d LEFT JOIN documents_fts f ON d.id = f.id 
				 ORDER BY d.updated_at DESC LIMIT ?`
	case "all":
		query = `SELECT d.id, d.type, d.title, d.tags, d.is_vault, COALESCE(SUBSTR(f.content, 1, 100), '') as snippet, d.updated_at 
				 FROM documents d LEFT JOIN documents_fts f ON d.id = f.id 
				 ORDER BY d.updated_at DESC LIMIT ?`
	case "protected":
		query = `SELECT d.id, d.type, d.title, d.tags, d.is_vault, COALESCE(SUBSTR(f.content, 1, 100), '') as snippet, d.updated_at 
				 FROM documents d LEFT JOIN documents_fts f ON d.id = f.id 
				 WHERE d.is_vault = 1 ORDER BY d.updated_at DESC LIMIT ?`
	default:
		query = `SELECT d.id, d.type, d.title, d.tags, d.is_vault, COALESCE(SUBSTR(f.content, 1, 100), '') as snippet, d.updated_at 
				 FROM documents d LEFT JOIN documents_fts f ON d.id = f.id 
				 ORDER BY d.updated_at DESC LIMIT ?`
	}

	rows, err := db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.SearchResult
	for rows.Next() {
		var res models.SearchResult
		var updated_at time.Time
		var tagsStr string
		err = rows.Scan(&res.ID, &res.Type, &res.Title, &tagsStr, &res.IsVault, &res.Snippet, &updated_at)
		if err != nil {
			log.Printf("Scan error: %v\n", err)
			continue
		}
		res.UpdatedAt = updated_at
		if tagsStr != "" {
			res.Tags = strings.Split(tagsStr, ",")
		} else {
			res.Tags = []string{}
		}
		results = append(results, res)
	}

	return results, nil
}

// RemoveFromIndex deletes a document from the DB index
func RemoveFromIndex(id string) error {
	mutex.Lock()
	defer mutex.Unlock()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	_, err = tx.Exec(`DELETE FROM documents WHERE id = ?`, id)
	if err != nil {
		tx.Rollback()
		return err
	}

	_, err = tx.Exec(`DELETE FROM documents_fts WHERE id = ?`, id)
	if err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

// GetDocumentCount returns total number of documents.
// L-6: fully parameterized to follow consistent query patterns.
func GetDocumentCount(vaultOnly bool) (int, error) {
	var count int
	var err error
	if vaultOnly {
		err = db.QueryRow("SELECT COUNT(*) FROM documents WHERE is_vault = ?", 1).Scan(&count)
	} else {
		err = db.QueryRow("SELECT COUNT(*) FROM documents").Scan(&count)
	}
	return count, err
}

// StartWatcher starts listening to fsnotify on the data dir.
// The callback func is called with the document ID when a file changes.
func StartWatcher(ctx context.Context, onChange func(id string)) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	dir := GetAppDir()
	err = watcher.Add(dir)
	if err != nil {
		return err
	}

	go func() {
		defer watcher.Close()
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Op&fsnotify.Write == fsnotify.Write {
					if filepath.Ext(event.Name) == ".md" {
						id := strings.TrimSuffix(filepath.Base(event.Name), ".md")

						// Sync this file immediately in DB
						// Wait a little to avoid partial writes
						time.Sleep(100 * time.Millisecond)
						SyncSingleFile(id)

						onChange(id)
					}
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("error:", err)
			case <-ctx.Done():
				return
			}
		}
	}()

	return nil
}

// SyncSingleFile syncs one file to db
func SyncSingleFile(id string) {
	mutex.Lock()
	defer mutex.Unlock()

	log.Printf("Syncing file to DB: %s\n", id)
	doc, err := ReadDisk(id)
	if err != nil {
		log.Printf("Error reading disk for sync: %v\n", err)
		return
	}

	tagsStr := strings.Join(doc.Frontmatter.Tags, ",")

	// Upsert into normal table
	_, err = db.Exec(`
		INSERT INTO documents (id, type, title, tags, is_vault, version, updated_at, parent_id, doc_type) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET 
		type=excluded.type, title=excluded.title, tags=excluded.tags, 
		is_vault=excluded.is_vault, version=excluded.version, updated_at=excluded.updated_at,
		parent_id=excluded.parent_id, doc_type=excluded.doc_type
	`, doc.Frontmatter.ID, doc.Frontmatter.Type, doc.Frontmatter.Title, tagsStr, doc.Frontmatter.IsVault, doc.Frontmatter.Version, doc.Frontmatter.UpdatedAt, doc.Frontmatter.ParentID, doc.Frontmatter.DocType)
	if err != nil {
		log.Printf("Error upserting document: %v\n", err)
	}

	// Delete from FTS, then Insert.
	// M-3: never store vault doc content in the FTS index.
	ftsContent := doc.Content
	if doc.Frontmatter.IsVault {
		ftsContent = ""
	}
	_, _ = db.Exec(`DELETE FROM documents_fts WHERE id = ?`, doc.Frontmatter.ID)
	_, err = db.Exec(`
		INSERT INTO documents_fts (id, title, content) 
		VALUES (?, ?, ?)
	`, doc.Frontmatter.ID, doc.Frontmatter.Title, ftsContent)
	if err != nil {
		log.Printf("Error updating FTS: %v\n", err)
	}
}

// ListChildren returns all child documents of a given parent ID.
func ListChildren(parentID string) ([]models.SearchResult, error) {
	rows, err := db.Query(`
		SELECT d.id, d.type, d.title, d.tags, d.is_vault, COALESCE(SUBSTR(f.content, 1, 100), '') as snippet, d.updated_at, d.doc_type
		FROM documents d LEFT JOIN documents_fts f ON d.id = f.id
		WHERE d.parent_id = ?
		ORDER BY d.updated_at DESC
	`, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.SearchResult
	for rows.Next() {
		var res models.SearchResult
		var updatedAt time.Time
		var tagsStr string
		err = rows.Scan(&res.ID, &res.Type, &res.Title, &tagsStr, &res.IsVault, &res.Snippet, &updatedAt, &res.DocType)
		if err != nil {
			log.Printf("ListChildren scan error: %v\n", err)
			continue
		}
		res.UpdatedAt = updatedAt
		if tagsStr != "" {
			res.Tags = strings.Split(tagsStr, ",")
		} else {
			res.Tags = []string{}
		}
		results = append(results, res)
	}
	return results, nil
}

