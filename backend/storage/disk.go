package storage

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"writtt/backend/models"

	"github.com/oklog/ulid/v2"
	"gopkg.in/yaml.v3"
)

// safeAttachDir returns the canonical path to the attachments sub-directory.
func safeAttachDir() string {
	return filepath.Clean(filepath.Join(GetAppDir(), "attachments"))
}

// GetAppDir returns the absolute path for ~/.writtt/data
func GetAppDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	dir := filepath.Join(home, ".writtt", "data")
	// M-1: directories must be owner-only (0700) — world-readable dirs
	// would allow any local user to browse encrypted-at-rest vault files.
	os.MkdirAll(dir, 0700)
	os.MkdirAll(filepath.Join(dir, "attachments"), 0700)

	backupDir := filepath.Join(home, ".writtt", "backups")
	os.MkdirAll(backupDir, 0700)

	return dir
}

// GenerateID returns a new ULID
func GenerateID() string {
	t := time.Now()
	entropy := ulid.Monotonic(rand.Reader, 0)
	id := ulid.MustNew(ulid.Timestamp(t), entropy)
	return id.String()
}

// parseDocument parses a raw markdown file into a Document struct.
func parseDocument(id string, data []byte) *models.Document {
	doc := &models.Document{
		Raw: string(data),
	}

	parts := bytes.SplitN(data, []byte("---"), 3)
	if len(parts) == 3 {
		err := yaml.Unmarshal(parts[1], &doc.Frontmatter)
		if err == nil {
			doc.Content = strings.TrimPrefix(string(parts[2]), "\n")
		} else {
			doc.Content = string(data)
		}
	} else {
		doc.Content = string(data)
	}

	if doc.Frontmatter.ID == "" {
		doc.Frontmatter.ID = id
	}

	if doc.Frontmatter.CreatedAt.IsZero() {
		doc.Frontmatter.CreatedAt = time.Now()
	}
	if doc.Frontmatter.UpdatedAt.IsZero() {
		doc.Frontmatter.UpdatedAt = time.Now()
	}

	return doc
}

// ReadDiskRaw reads a document without applying decryption.
// Used internally for re-encryption operations.
func ReadDiskRaw(id string) (*models.Document, error) {
	// H-3/H-2: validate id before constructing path.
	if err := ValidateID(id); err != nil {
		return nil, err
	}
	path := filepath.Join(GetAppDir(), id+".md")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	doc := parseDocument(id, data)
	// H-2: derive Encrypted from actual content — do not trust frontmatter value.
	doc.Frontmatter.Encrypted = IsEncrypted(doc.Content)
	return doc, nil
}

// ReadDisk reads a markdown file, parses its frontmatter and content.
// If the document is a vault document and the vault is unlocked, it decrypts the content.
func ReadDisk(id string) (*models.Document, error) {
	doc, err := ReadDiskRaw(id)
	if err != nil {
		return nil, err
	}

	// Decrypt vault documents when unlocked
	if doc.Frontmatter.IsVault && IsEncrypted(doc.Content) {
		password := GetActivePassword()
		if password == "" {
			// Vault is locked — return placeholder content
			doc.Content = ""
			doc.Frontmatter.Encrypted = true
			return doc, nil
		}

		plain, err := Decrypt(password, doc.Content)
		if err != nil {
			log.Printf("ReadDisk: failed to decrypt %s: %v", id, err)
			doc.Content = ""
			doc.Frontmatter.Encrypted = true
			return doc, nil
		}
		doc.Content = string(plain)
		doc.Frontmatter.Encrypted = false
	}

	return doc, nil
}

// encodeDocument serializes a Document into its on-disk format (frontmatter + content).
func encodeDocument(doc models.Document) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString("---\n")

	enc := yaml.NewEncoder(&buf)
	err := enc.Encode(doc.Frontmatter)
	if err != nil {
		return nil, err
	}
	// L-2: check Close — it flushes the YAML stream finalizer.
	if err := enc.Close(); err != nil {
		return nil, fmt.Errorf("flushing yaml encoder: %w", err)
	}

	buf.WriteString("---\n")
	buf.WriteString(doc.Content)
	return buf.Bytes(), nil
}

// WriteDiskRaw writes a document to disk without applying encryption.
// Used internally by ReEncryptAllVaultDocs.
func WriteDiskRaw(doc models.Document) error {
	data, err := encodeDocument(doc)
	if err != nil {
		return err
	}
	path := filepath.Join(GetAppDir(), doc.Frontmatter.ID+".md")
	// L-4: 0600 — owner-only read/write; prevents local users reading docs.
	return os.WriteFile(path, data, 0600)
}

// WriteDisk writes a document back to the file system.
// If the document has no ID, a new one is generated.
// If the document is a vault document and the vault is unlocked, the content is encrypted.
func WriteDisk(doc models.Document) (string, error) {
	if doc.Frontmatter.ID == "" {
		doc.Frontmatter.ID = GenerateID()
		doc.Frontmatter.CreatedAt = time.Now()
	} else if err := ValidateID(doc.Frontmatter.ID); err != nil {
		// H-3: reject any crafted ID before it reaches the filesystem.
		return "", err
	}
	doc.Frontmatter.UpdatedAt = time.Now()

	if doc.Frontmatter.Title == "" {
		lines := strings.SplitN(strings.TrimSpace(doc.Content), "\n", 2)
		if len(lines) > 0 && lines[0] != "" {
			doc.Frontmatter.Title = strings.TrimLeft(lines[0], "# ")
			if len(doc.Frontmatter.Title) > 50 {
				doc.Frontmatter.Title = doc.Frontmatter.Title[:50] + "..."
			}
		} else {
			doc.Frontmatter.Title = "Untitled"
		}
	}

	// Encrypt vault documents when the vault is unlocked
	if doc.Frontmatter.IsVault {
		password := GetActivePassword()
		if password != "" && !IsEncrypted(doc.Content) {
			encrypted, err := Encrypt(password, []byte(doc.Content))
			if err != nil {
				log.Printf("WriteDisk: failed to encrypt %s: %v", doc.Frontmatter.ID, err)
				// Write plaintext rather than silently losing data
			} else {
				doc.Content = encrypted
				doc.Frontmatter.Encrypted = true
			}
		}
	} else {
		doc.Frontmatter.Encrypted = false
	}

	data, err := encodeDocument(doc)
	if err != nil {
		return "", err
	}

	path := filepath.Join(GetAppDir(), doc.Frontmatter.ID+".md")
	log.Printf("Writing file to disk: %s\n", path)
	if err = os.WriteFile(path, data, 0600); err != nil {
		log.Printf("Error writing file: %v\n", err)
		return "", err
	}

	return doc.Frontmatter.ID, nil
}

// DeleteDocument removes a file from disk and the search index.
func DeleteDocument(id string) error {
	path := filepath.Join(GetAppDir(), id+".md")
	log.Printf("Deleting file from disk: %s\n", path)
	err := os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		log.Printf("Error deleting file: %v\n", err)
		return err
	}

	// Also remove from index
	err = RemoveFromIndex(id)
	if err != nil {
		log.Printf("Error removing from index: %v\n", err)
		// Don't return this error, as the file is already gone
	}

	return nil
}

// SaveAttachment decodes a base64 string and writes it to the attachments directory.
func SaveAttachment(filename string, base64Data string) (string, error) {
	// Remove standard data URL prefix if present (e.g., "data:image/png;base64,")
	if idx := strings.Index(base64Data, ","); idx != -1 {
		base64Data = base64Data[idx+1:]
	}

	data, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("invalid base64: %v", err)
	}

	// H-1: strip any directory components from the caller-supplied filename
	// (e.g. "../../security.json" → "security.json") and then verify the
	// fully-resolved path stays inside the attachments directory.
	base := filepath.Base(filename)
	uniqueFilename := fmt.Sprintf("%d-%s", time.Now().UnixMilli(), base)
	attachDir := safeAttachDir()
	path := filepath.Join(attachDir, uniqueFilename)

	// Double-check: resolved path must be inside attachDir.
	if !strings.HasPrefix(filepath.Clean(path), attachDir) {
		return "", fmt.Errorf("invalid attachment filename")
	}

	if err = os.WriteFile(path, data, 0600); err != nil {
		return "", err
	}

	// URL-encode the filename so that paths with spaces (or other special
	// characters) produce valid markdown image URLs that markdown-it can parse.
	// url.PathEscape encodes spaces as %20 while keeping / intact.
	return "/attachments/" + url.PathEscape(uniqueFilename), nil
}
