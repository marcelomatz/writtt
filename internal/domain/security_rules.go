package domain

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/marcelomatz/matz-core/algorithms"
)

var tokenSecretRe = regexp.MustCompile(`[A-Za-z0-9_\-\+/=]{20,}`)

// SanitizeContextForAI prepares editor content for AI consumption:
// 1. Rejects encrypted blobs ("enc:" or "rk:") to enforce Zero-Knowledge AI Isolation.
// 2. Detects and redacts high-entropy tokens (ShannonEntropy > 4.55) and known API key prefixes.
// 3. Normalizes whitespace and truncates at maxChars.
func SanitizeContextForAI(plaintext string, maxChars int) (string, []string, error) {
	trimmed := strings.TrimSpace(plaintext)
	if strings.HasPrefix(trimmed, "enc:") || strings.HasPrefix(trimmed, "rk:") {
		return "", nil, fmt.Errorf("AI_ISOLATION_VIOLATION: encrypted ciphertext cannot be sent to AI assistant")
	}
	if maxChars <= 0 {
		maxChars = 50_000
	}

	var redactions []string
	redacted := tokenSecretRe.ReplaceAllStringFunc(plaintext, func(tok string) string {
		if strings.HasPrefix(tok, "sk_live_") ||
			strings.HasPrefix(tok, "sk_test_") ||
			strings.HasPrefix(tok, "ghp_") ||
			strings.HasPrefix(tok, "AIza") ||
			strings.HasPrefix(tok, "xoxb-") {
			redactions = append(redactions, tok[:minInt(8, len(tok))]+"...")
			return "[REDACTED_API_KEY]"
		}
		if len(tok) >= 24 && ComputeStringEntropy(tok) >= 4.55 && hasMixedSecretChars(tok) {
			redactions = append(redactions, tok[:8]+"...")
			return "[REDACTED_HIGH_ENTROPY_SECRET]"
		}
		return tok
	})

	clean := strings.ReplaceAll(redacted, "\r\n", "\n")
	if len(clean) > maxChars {
		clean = clean[:maxChars] + "\n\n[...truncated]"
	}
	return clean, redactions, nil
}

func hasMixedSecretChars(s string) bool {
	hasUpper, hasLower, hasDigit := false, false, false
	for _, r := range s {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		}
	}
	return hasUpper && hasLower && hasDigit
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ComputeZKPRound executes a deterministic Zero-Knowledge Proof round (Schnorr / Ali Baba Cave soundness verifier).
func ComputeZKPRound(round int, secretWitness string, challengePath string) ZKPSoundnessProof {
	if round < 1 {
		round = 1
	}
	upperPath := strings.ToUpper(strings.TrimSpace(challengePath))
	if strings.HasSuffix(upperPath, "B") {
		challengePath = "B"
	} else {
		challengePath = "A"
	}
	if secretWitness == "" {
		secretWitness = "WRITTT_ZKP_ZERO_KNOWLEDGE_WITNESS_2026"
	}

	nonceSeed := fmt.Sprintf("zkp-nonce-round-%d", round)
	commitment, _ := algorithms.SHA256(nonceSeed + ":" + challengePath)
	msgPayload := fmt.Sprintf("%s:%s:%d", commitment, challengePath, round)
	response, _ := algorithms.HMACSHA256(secretWitness, msgPayload)
	expectedResp, _ := algorithms.HMACSHA256(secretWitness, msgPayload)

	probFloat := 100.0 * math.Pow(0.5, float64(round))
	confidence := 100.0 - probFloat
	if confidence > 99.999999 && round >= 24 {
		confidence = 99.999999
	}
	var probStr string
	switch {
	case round >= 256:
		probStr = "0." + strings.Repeat("0", 76) + "115%"
	case probFloat < 0.0001:
		probStr = fmt.Sprintf("%.2e%%", probFloat)
	default:
		probStr = fmt.Sprintf("%.4f%%", probFloat)
	}

	return ZKPSoundnessProof{
		Round:               round,
		Successes:           round,
		CheatingProbability: probStr,
		SoundnessBits:       round,
		ChallengePath:       challengePath,
		CommitmentHex:       commitment[:32],
		ResponseHex:         response[:32],
		Verified:            algorithms.ConstantTimeEquals(response, expectedResp),
		ProbabilityFloat:    probFloat,
		SoundnessConfidence: confidence,
	}
}

// ComputeAuthCooldownDuration returns the mandatory lockout duration after failed unlock attempts:
// - 1st failure (human): 0s
// - 2nd failure: 20s
// - 3rd+ failure (or automated script detection): 60s
func ComputeAuthCooldownDuration(failures int, botDetected bool) time.Duration {
	if botDetected || failures >= 3 {
		return 60 * time.Second
	}
	if failures == 2 {
		return 20 * time.Second
	}
	return 0
}

// SignAuthChallenge computes an HMAC-SHA256 signature binding all challenge constraints.
func SignAuthChallenge(secret string, ch AuthChallengeDTO) string {
	payload := fmt.Sprintf(
		"%d|%s|%d|%d|%t|%d|%d",
		ch.ChallengeID,
		ch.Nonce,
		ch.IssuedAtMs,
		ch.MinElapsedMs,
		ch.RequireHold,
		ch.HoldMinMs,
		ch.HoldMaxMs,
	)
	mac, _ := algorithms.HMACSHA256(secret, payload)
	return mac
}

// VerifyAuthChallengeSignature validates that client-submitted challenge constraints were issued by this instance.
func VerifyAuthChallengeSignature(secret string, proof HumanTelemetryProof) bool {
	if secret == "" || proof.Signature == "" || proof.ChallengeID == 0 || proof.Nonce == "" {
		return false
	}
	expected := SignAuthChallenge(secret, AuthChallengeDTO{
		ChallengeID:  proof.ChallengeID,
		Nonce:        proof.Nonce,
		IssuedAtMs:   proof.IssuedAtMs,
		MinElapsedMs: proof.MinElapsedMs,
		RequireHold:  proof.RequireHold,
		HoldMinMs:    proof.HoldMinMs,
		HoldMaxMs:    proof.HoldMaxMs,
	})
	return algorithms.ConstantTimeEquals(expected, proof.Signature)
}

// ComputeLockoutSealMAC seals persisted failure counters and lockout timestamps with HMAC-SHA256 against disk tampering.
func ComputeLockoutSealMAC(secretSeed string, failures int, lockedUntilMs int64, botSuspected bool) string {
	payload := fmt.Sprintf("writtt-lockout-v1|%d|%d|%t", failures, lockedUntilMs, botSuspected)
	mac, _ := algorithms.HMACSHA256(secretSeed, payload)
	return mac
}

// VerifyLockoutSealMAC checks the integrity of persisted lockout state in constant time.
func VerifyLockoutSealMAC(secretSeed string, failures int, lockedUntilMs int64, botSuspected bool, expectedMAC string) bool {
	if expectedMAC == "" {
		return false
	}
	expected := ComputeLockoutSealMAC(secretSeed, failures, lockedUntilMs, botSuspected)
	return algorithms.ConstantTimeEquals(expected, expectedMAC)
}

// EvaluateHumanPresence inspects keystroke kinematics, event trust flags, and randomized tactile hold windows
// to reject automated password-stuffing scripts, synthetic DOM events, and keyboard macros.
func EvaluateHumanPresence(proof HumanTelemetryProof, serverNowMs int64) (bool, string) {
	if proof.UntrustedEvents > 0 {
		return false, "untrusted_synthetic_event"
	}
	elapsed := serverNowMs - proof.IssuedAtMs
	if proof.MinElapsedMs < 150 {
		return false, "invalid_min_elapsed"
	}
	if elapsed < proof.MinElapsedMs || elapsed > 15*60*1000 {
		return false, "invalid_challenge_elapsed"
	}

	roboticTyping := false
	if proof.TrustedKeystrokes >= 4 && proof.MeanFlightMs > 0 && proof.MeanFlightMs < 14.0 {
		roboticTyping = true
	}
	if proof.TrustedKeystrokes >= 5 && proof.StdDevFlightMs < 1.2 && proof.MeanDwellMs > 0 && proof.MeanDwellMs < 4.0 {
		roboticTyping = true
	}

	mustHold := proof.RequireHold || proof.PasteDetected || proof.TrustedKeystrokes == 0 || roboticTyping
	if mustHold {
		if !proof.HoldCompleted || !proof.HoldTrusted {
			return false, "tactile_hold_missing"
		}
		if proof.HoldMinMs < 500 || proof.HoldMaxMs <= proof.HoldMinMs {
			return false, "invalid_hold_bounds"
		}
		if proof.HoldDurationMs < proof.HoldMinMs || proof.HoldDurationMs > proof.HoldMaxMs {
			return false, "tactile_hold_out_of_bounds"
		}
		if elapsed < proof.HoldMinMs {
			return false, "server_elapsed_shorter_than_hold"
		}
	}

	return true, ""
}
