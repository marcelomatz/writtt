package storage

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id parameters (OWASP recommended minimums, 2024)
const (
	argonMemory      = 64 * 1024 // 64 MB
	argonIterations  = 3
	argonParallelism = 2
	argonSaltLen     = 16
	argonKeyLen      = 32 // AES-256
)

// argon2idParams is serialized inside the stored hash string.
type argon2idParams struct {
	Memory      uint32 `json:"m"`
	Iterations  uint32 `json:"t"`
	Parallelism uint8  `json:"p"`
	SaltB64     string `json:"s"`
	HashB64     string `json:"h"`
}

// HashPassword hashes a password using Argon2id and returns a JSON-encoded, self-describing string.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return "", fmt.Errorf("generating salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, argonIterations, argonMemory, argonParallelism, argonKeyLen)

	params := argon2idParams{
		Memory:      argonMemory,
		Iterations:  argonIterations,
		Parallelism: argonParallelism,
		SaltB64:     base64.StdEncoding.EncodeToString(salt),
		HashB64:     base64.StdEncoding.EncodeToString(hash),
	}

	data, err := json.Marshal(params)
	if err != nil {
		return "", fmt.Errorf("marshaling hash: %w", err)
	}
	return string(data), nil
}

// VerifyPassword checks whether password matches the stored hash.
// Returns false on any error (wrong password scenario).
func VerifyPassword(password, storedHash string) bool {
	var params argon2idParams
	if err := json.Unmarshal([]byte(storedHash), &params); err != nil {
		return false
	}

	salt, err := base64.StdEncoding.DecodeString(params.SaltB64)
	if err != nil {
		return false
	}
	expectedHash, err := base64.StdEncoding.DecodeString(params.HashB64)
	if err != nil {
		return false
	}

	computedHash := argon2.IDKey([]byte(password), salt, params.Iterations, params.Memory, params.Parallelism, uint32(len(expectedHash)))

	// Constant-time comparison to prevent timing attacks
	return subtle.ConstantTimeCompare(computedHash, expectedHash) == 1
}

// DeriveKey derives a 32-byte AES key from a password and a per-document salt using Argon2id.
func DeriveKey(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, argonIterations, argonMemory, argonParallelism, argonKeyLen)
}

// Encrypt encrypts plaintext with AES-256-GCM.
// The returned ciphertext is: base64( salt(16) | nonce(12) | gcm_ciphertext )
func Encrypt(password string, plaintext []byte) (string, error) {
	// Generate a random salt for key derivation (per-document / per-call)
	salt := make([]byte, argonSaltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return "", fmt.Errorf("generating salt: %w", err)
	}

	key := DeriveKey(password, salt)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("creating cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("creating GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generating nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil) // prepend nonce

	// Final blob: salt | nonce+ciphertext
	blob := append(salt, ciphertext...)
	return "enc:" + base64.StdEncoding.EncodeToString(blob), nil
}

// Decrypt decrypts a value produced by Encrypt.
func Decrypt(password string, encoded string) ([]byte, error) {
	encoded = strings.TrimPrefix(encoded, "enc:")
	blob, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decoding base64: %w", err)
	}

	if len(blob) < argonSaltLen+12+16 { // salt + min_nonce + min_gcm_overhead
		return nil, fmt.Errorf("ciphertext too short")
	}

	salt := blob[:argonSaltLen]
	rest := blob[argonSaltLen:]

	key := DeriveKey(password, salt)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("creating cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("creating GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(rest) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short for nonce")
	}

	nonce, ciphertext := rest[:nonceSize], rest[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed (wrong password?): %w", err)
	}

	return plaintext, nil
}

// IsEncrypted reports whether a content string is in the encrypted format.
func IsEncrypted(content string) bool {
	return strings.HasPrefix(content, "enc:")
}
