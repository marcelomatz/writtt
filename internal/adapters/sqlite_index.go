package adapters

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	matzsqlite "github.com/marcelomatz/matz-core/sqlite"

	"writtt/internal/domain"
)

const (
	sqlCreateDocumentsTable = `CREATE TABLE IF NOT EXISTS documents (
		id TEXT PRIMARY KEY,
		type TEXT NOT NULL DEFAULT 'markdown',
		title TEXT NOT NULL DEFAULT '',
		tags TEXT NOT NULL DEFAULT '',
		is_vault BOOLEAN NOT NULL DEFAULT 0,
		version INTEGER NOT NULL DEFAULT 1,
		updated_at DATETIME,
		parent_id TEXT NOT NULL DEFAULT '',
		doc_type TEXT NOT NULL DEFAULT 'document'
	);`

	sqlCreateDocumentsFTS = `CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
		id UNINDEXED,
		title,
		content
	);`

	sqlUpsertDocument = `INSERT INTO documents (
		id, type, title, tags, is_vault, version, updated_at, parent_id, doc_type
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		type = excluded.type,
		title = excluded.title,
		tags = excluded.tags,
		is_vault = excluded.is_vault,
		version = excluded.version,
		updated_at = excluded.updated_at,
		parent_id = excluded.parent_id,
		doc_type = excluded.doc_type;`

	sqlDeleteDocumentFTS = `DELETE FROM documents_fts WHERE id = ?;`

	sqlInsertDocumentFTS = `INSERT INTO documents_fts (id, title, content) VALUES (?, ?, ?);`

	sqlDeleteDocument = `DELETE FROM documents WHERE id = ?;`

	sqlSearchFTS = `SELECT
		d.id,
		d.type,
		d.title,
		d.tags,
		d.is_vault,
		snippet(documents_fts, -1, '<b>', '</b>', '...', 15) AS snippet,
		d.updated_at,
		d.parent_id,
		d.doc_type,
		d.version
	FROM documents_fts f
	JOIN documents d ON f.id = d.id
	WHERE documents_fts MATCH ?
	ORDER BY rank
	LIMIT ?;`

	sqlCountAllDocuments   = `SELECT COUNT(*) FROM documents;`
	sqlCountVaultDocuments = `SELECT COUNT(*) FROM documents WHERE is_vault = 1;`
)

var sqlIdempotentMigrations = []string{
	`ALTER TABLE documents ADD COLUMN tags TEXT DEFAULT '';`,
	`ALTER TABLE documents ADD COLUMN is_vault BOOLEAN DEFAULT 0;`,
	`ALTER TABLE documents ADD COLUMN version INTEGER DEFAULT 1;`,
	`ALTER TABLE documents ADD COLUMN parent_id TEXT DEFAULT '';`,
	`ALTER TABLE documents ADD COLUMN doc_type TEXT DEFAULT 'document';`,
}

// SQLiteSearchIndex encapsulates the local WAL-enabled SQLite + FTS5 metadata index.
// Zero package-level globals; Vault plaintext is never persisted to FTS5.
type SQLiteSearchIndex struct {
	mu      sync.Mutex
	db      *sql.DB
	dataDir string
}

// NewSQLiteSearchIndex opens or initializes writtt.db inside dataDir with WAL mode and FTS5 virtual tables.
func NewSQLiteSearchIndex(dataDir string) (*SQLiteSearchIndex, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("create index directory: %w", err)
	}
	dbPath := filepath.Join(dataDir, "writtt.db")
	db, err := matzsqlite.OpenWAL(dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite wal index: %w", err)
	}
	if _, err := db.Exec(sqlCreateDocumentsTable); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("create documents table: %w", err)
	}
	// FTS5 creation is best-effort if running under a custom SQLite build without FTS5.
	_, _ = db.Exec(sqlCreateDocumentsFTS)
	for _, mig := range sqlIdempotentMigrations {
		_, _ = db.Exec(mig)
	}
	return &SQLiteSearchIndex{
		db:      db,
		dataDir: dataDir,
	}, nil
}

// SyncDocument upserts a single document's metadata and non-vault FTS5 body.
// Security invariant: Vault or encrypted documents store empty content in FTS5.
func (idx *SQLiteSearchIndex) SyncDocument(doc domain.Document) error {
	if idx == nil || idx.db == nil || doc.Frontmatter.ID == "" {
		return nil
	}
	idx.mu.Lock()
	defer idx.mu.Unlock()

	tx, err := idx.db.Begin()
	if err != nil {
		return err
	}
	if err := upsertDocumentTx(tx, doc); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// SyncAll batch-indexes a slice of documents inside a single atomic SQLite transaction.
func (idx *SQLiteSearchIndex) SyncAll(docs []domain.Document) error {
	if idx == nil || idx.db == nil {
		return nil
	}
	idx.mu.Lock()
	defer idx.mu.Unlock()

	tx, err := idx.db.Begin()
	if err != nil {
		return err
	}
	for _, doc := range docs {
		if doc.Frontmatter.ID == "" {
			continue
		}
		if err := upsertDocumentTx(tx, doc); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func upsertDocumentTx(tx *sql.Tx, doc domain.Document) error {
	tagsStr := strings.Join(doc.Frontmatter.Tags, ",")
	docType := doc.Frontmatter.DocType
	if docType == "" {
		docType = "document"
	}
	typ := doc.Frontmatter.Type
	if typ == "" {
		typ = "markdown"
	}
	ver := doc.Frontmatter.Version
	if ver <= 0 {
		ver = 1
	}
	updatedAt := doc.Frontmatter.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = time.Now()
	}

	if _, err := tx.Exec(
		sqlUpsertDocument,
		doc.Frontmatter.ID,
		typ,
		doc.Frontmatter.Title,
		tagsStr,
		doc.Frontmatter.IsVault,
		ver,
		updatedAt,
		doc.Frontmatter.ParentID,
		docType,
	); err != nil {
		return err
	}

	ftsContent := doc.Content
	if doc.Frontmatter.IsVault || doc.Frontmatter.Encrypted || strings.HasPrefix(strings.TrimSpace(ftsContent), "enc:") {
		ftsContent = ""
	}
	_, _ = tx.Exec(sqlDeleteDocumentFTS, doc.Frontmatter.ID)
	_, _ = tx.Exec(sqlInsertDocumentFTS, doc.Frontmatter.ID, doc.Frontmatter.Title, ftsContent)
	return nil
}

// DeleteDocument removes a document from both metadata and FTS5 tables.
func (idx *SQLiteSearchIndex) DeleteDocument(id string) error {
	if idx == nil || idx.db == nil || strings.TrimSpace(id) == "" {
		return nil
	}
	idx.mu.Lock()
	defer idx.mu.Unlock()

	tx, err := idx.db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(sqlDeleteDocument, id); err != nil {
		_ = tx.Rollback()
		return err
	}
	_, _ = tx.Exec(sqlDeleteDocumentFTS, id)
	return tx.Commit()
}

// Search executes a sanitized FTS5 query against indexed non-vault content and document titles.
func (idx *SQLiteSearchIndex) Search(query string, limit int) ([]domain.SearchResult, error) {
	if idx == nil || idx.db == nil {
		return nil, nil
	}
	clean := domain.SanitizeFTSQuery(query)
	if clean == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = 20
	}
	tokens := strings.Fields(clean)
	for i, tok := range tokens {
		tokens[i] = fmt.Sprintf(`"%s"*`, tok)
	}
	ftsExpr := strings.Join(tokens, " ")

	rows, err := idx.db.Query(sqlSearchFTS, ftsExpr, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []domain.SearchResult
	for rows.Next() {
		var item domain.SearchResult
		var tagsStr string
		if err := rows.Scan(
			&item.ID,
			&item.Type,
			&item.Title,
			&tagsStr,
			&item.IsVault,
			&item.Snippet,
			&item.UpdatedAt,
			&item.ParentID,
			&item.DocType,
			&item.Version,
		); err != nil {
			continue
		}
		if tagsStr != "" {
			item.Tags = strings.Split(tagsStr, ",")
		} else {
			item.Tags = []string{}
		}
		results = append(results, item)
	}
	return results, nil
}

// Count returns the number of indexed documents (all or vault-only).
func (idx *SQLiteSearchIndex) Count(vaultOnly bool) (int, error) {
	if idx == nil || idx.db == nil {
		return 0, nil
	}
	q := sqlCountAllDocuments
	if vaultOnly {
		q = sqlCountVaultDocuments
	}
	var count int
	err := idx.db.QueryRow(q).Scan(&count)
	return count, err
}

// Close cleanly closes the underlying SQLite connection pool.
func (idx *SQLiteSearchIndex) Close() error {
	if idx == nil {
		return nil
	}
	idx.mu.Lock()
	defer idx.mu.Unlock()
	if idx.db == nil {
		return nil
	}
	err := idx.db.Close()
	idx.db = nil
	return err
}

// StartDirectoryWatcher monitors dir for .md write/create events and invokes onDocumentWrite
// with debounce protection until ctx is cancelled.
func StartDirectoryWatcher(ctx context.Context, dir string, onDocumentWrite func(id string)) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	if err := watcher.Add(dir); err != nil {
		_ = watcher.Close()
		return err
	}

	go func() {
		defer watcher.Close()
		lastSeen := make(map[string]time.Time)
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Op&(fsnotify.Write|fsnotify.Create) != 0 && filepath.Ext(event.Name) == ".md" {
					id := strings.TrimSuffix(filepath.Base(event.Name), ".md")
					now := time.Now()
					if prev, exists := lastSeen[id]; exists && now.Sub(prev) < 80*time.Millisecond {
						continue
					}
					lastSeen[id] = now
					if onDocumentWrite != nil {
						onDocumentWrite(id)
					}
				}
			case _, ok := <-watcher.Errors:
				if !ok {
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	return nil
}
