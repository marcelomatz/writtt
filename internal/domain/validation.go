package domain

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/marcelomatz/matz-core/algorithms"
)

var (
	canonicalIDRe = regexp.MustCompile(`^([0-9A-HJKMNP-TV-Z]{26}|doc-[a-zA-Z0-9_-]{3,48})$`)
	aliasRe       = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{2,23}$`)
)

// ValidateDocumentID validates that id is a safe ULID or canonical doc-* identifier.
func ValidateDocumentID(id string) error {
	trimmed := strings.TrimSpace(id)
	if trimmed == "" {
		return fmt.Errorf("document id cannot be empty")
	}
	if strings.Contains(trimmed, "..") || strings.ContainsAny(trimmed, `/\:`) {
		return fmt.Errorf("invalid document id (path traversal attempt): %q", id)
	}
	if !canonicalIDRe.MatchString(trimmed) {
		return fmt.Errorf("invalid document id: %q", id)
	}
	return nil
}

// SanitizeFTSQuery strips FTS5 operator characters to prevent FTS5 injection.
func SanitizeFTSQuery(q string) string {
	var b strings.Builder
	for _, r := range q {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

// ComputeStringEntropy computes Shannon entropy (bits/byte) over a string using algorithms.ShannonEntropy.
func ComputeStringEntropy(s string) float64 {
	if len(s) == 0 {
		return 0.0
	}
	counts := make(map[byte]int, 64)
	for i := 0; i < len(s); i++ {
		counts[s[i]]++
	}
	ent, _ := algorithms.ShannonEntropy(counts)
	return ent
}

// ClassifyEntropy categorizes Shannon entropy (0..8 bits/byte).
func ClassifyEntropy(bits float64) string {
	switch {
	case bits >= 6.8:
		return "CIPHERTEXT_SEALED"
	case bits >= 4.6:
		return "HIGH_ENTROPY_DENSE"
	case bits >= 3.2:
		return "NATURAL_PROSE"
	default:
		return "LOW_ENTROPY_SPARSE"
	}
}

// ClassifyDriveFileCategory maps filename extension and MIME type to a canonical E2EE Drive category.
func ClassifyDriveFileCategory(filename, mimeType string) string {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(filename), "."))
	mimeLow := strings.ToLower(mimeType)

	switch ext {
	case "md", "markdown":
		return "markdown"
	case "go", "ts", "tsx", "js", "py", "rs", "sql", "json", "yaml", "yml", "sh", "ps1":
		return "code"
	case "txt", "csv", "log":
		return "text"
	case "png", "jpg", "jpeg", "gif", "webp", "svg":
		return "image"
	case "pdf":
		return "pdf"
	case "mp3", "wav", "ogg", "flac", "m4a":
		return "audio"
	case "mp4", "webm", "mov", "mkv":
		return "video"
	case "doc", "docx", "odt":
		return "document"
	case "xls", "xlsx", "ods":
		return "spreadsheet"
	case "ppt", "pptx", "odp":
		return "presentation"
	case "zip", "writttpack", "epub", "tar", "gz":
		return "archive"
	}

	switch {
	case strings.HasPrefix(mimeLow, "image/"):
		return "image"
	case strings.HasPrefix(mimeLow, "audio/"):
		return "audio"
	case strings.HasPrefix(mimeLow, "video/"):
		return "video"
	case strings.HasPrefix(mimeLow, "text/"):
		return "text"
	default:
		return "document"
	}
}

// ValidateOperatorAlias normalizes and validates a public Writtt Express @alias handle.
func ValidateOperatorAlias(alias string) (string, error) {
	clean := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(alias), "@")))
	if !aliasRe.MatchString(clean) {
		return "", fmt.Errorf("invalid operator alias %q: must be 3-24 lowercase alphanumeric, '_' or '-' characters", alias)
	}
	return "@" + clean, nil
}

// ComputeNextAliasPenaltyDays implements the iterative Writtt Pro alias cooldown schedule (0 -> 15 -> 30 -> 60 -> 90 days).
func ComputeNextAliasPenaltyDays(changeCount int) int {
	switch {
	case changeCount <= 0:
		return 0
	case changeCount == 1:
		return 15
	case changeCount == 2:
		return 30
	case changeCount == 3:
		return 60
	default:
		return 90
	}
}

// CompareSemVer compares two semantic version strings (e.g. "v0.2.0" vs "0.1.3").
// Returns 1 if vA > vB, -1 if vA < vB, and 0 if equal or non-comparable.
func CompareSemVer(vA, vB string) int {
	aMaj, aMin, aPat, aPre, okA := parseSemVerParts(vA)
	bMaj, bMin, bPat, bPre, okB := parseSemVerParts(vB)
	if !okA || !okB {
		return 0
	}
	if aMaj != bMaj {
		if aMaj > bMaj {
			return 1
		}
		return -1
	}
	if aMin != bMin {
		if aMin > bMin {
			return 1
		}
		return -1
	}
	if aPat != bPat {
		if aPat > bPat {
			return 1
		}
		return -1
	}
	// Stable release > pre-release for identical major.minor.patch
	if aPre == "" && bPre != "" {
		return 1
	}
	if aPre != "" && bPre == "" {
		return -1
	}
	return strings.Compare(aPre, bPre)
}

func parseSemVerParts(raw string) (major, minor, patch int, prerelease string, ok bool) {
	clean := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(raw), "v"))
	if clean == "" || clean == "dev" {
		return 0, 0, 0, "", false
	}
	if plusIdx := strings.IndexByte(clean, '+'); plusIdx >= 0 {
		clean = clean[:plusIdx]
	}
	if dashIdx := strings.IndexByte(clean, '-'); dashIdx >= 0 {
		prerelease = clean[dashIdx+1:]
		clean = clean[:dashIdx]
	}
	parts := strings.Split(clean, ".")
	if len(parts) < 2 || len(parts) > 3 {
		return 0, 0, 0, "", false
	}
	var err error
	major, err = strconv.Atoi(parts[0])
	if err != nil || major < 0 {
		return 0, 0, 0, "", false
	}
	minor, err = strconv.Atoi(parts[1])
	if err != nil || minor < 0 {
		return 0, 0, 0, "", false
	}
	if len(parts) == 3 {
		patch, err = strconv.Atoi(parts[2])
		if err != nil || patch < 0 {
			return 0, 0, 0, "", false
		}
	}
	return major, minor, patch, prerelease, true
}
