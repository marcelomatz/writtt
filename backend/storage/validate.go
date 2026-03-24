package storage

import (
	"fmt"
	"regexp"
)

// ulidRe matches a canonical 26-character ULID (Crockford base32, uppercase).
var ulidRe = regexp.MustCompile(`^[0-9A-HJKMNP-TV-Z]{26}$`)

// ValidateID returns an error if id is not a valid ULID.
// Use this on any untrusted doc ID before constructing file paths.
func ValidateID(id string) error {
	if !ulidRe.MatchString(id) {
		return fmt.Errorf("invalid document id: %q", id)
	}
	return nil
}
