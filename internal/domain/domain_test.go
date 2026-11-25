package domain_test

import (
	"strings"
	"testing"
	"time"

	"writtt/internal/domain"
)

func TestValidateDocumentIDAndFTSQuery(t *testing.T) {
	if err := domain.ValidateDocumentID("01ARZ3NDEKTSV4RRFFQ69G5FAV"); err != nil {
		t.Fatalf("expected valid ULID to pass: %v", err)
	}
	if err := domain.ValidateDocumentID("doc-welcome-2026"); err != nil {
		t.Fatalf("expected valid doc-* ID to pass: %v", err)
	}
	if err := domain.ValidateDocumentID(""); err == nil {
		t.Fatalf("expected empty ID to fail")
	}
	if err := domain.ValidateDocumentID("../../security.json"); err == nil {
		t.Fatalf("expected path traversal ID to fail")
	}
	if err := domain.ValidateDocumentID("invalid!@#"); err == nil {
		t.Fatalf("expected malformed ID to fail")
	}

	clean := domain.SanitizeFTSQuery(`vault* "OR" 1=1; DROP_TABLE-x`)
	if strings.ContainsAny(clean, `*"=;`) {
		t.Fatalf("FTS query not sanitized: %s", clean)
	}
}

func TestExtractChaptersAndStats(t *testing.T) {
	md := "# Chapter 1\nIntro words here.\n- [x] Task done\n- [ ] Task open\n\n## Section 1.1\n```go\nfunc main() {}\n```\nMore text.\n### Subsection\nFinal paragraph."
	chapters, stats := domain.ExtractChaptersAndStats(md)
	if len(chapters) != 3 {
		t.Fatalf("expected 3 chapters, got %d", len(chapters))
	}
	if chapters[0].Level != 1 || chapters[1].Level != 2 || chapters[2].Level != 3 {
		t.Fatalf("unexpected heading levels: %+v", chapters)
	}
	if stats.CodeBlockCount != 1 || stats.TaskTotal != 2 || stats.TaskCompleted != 1 {
		t.Fatalf("unexpected task/code stats: %+v", stats)
	}
	if stats.Words == 0 || stats.ReadMinutes < 1 || stats.ContentSHA256Hex == "" {
		t.Fatalf("unexpected word/read stats: %+v", stats)
	}

	if domain.ClassifyEntropy(7.2) != "CIPHERTEXT_SEALED" {
		t.Fatalf("expected CIPHERTEXT_SEALED")
	}
	if domain.ClassifyEntropy(5.0) != "HIGH_ENTROPY_DENSE" {
		t.Fatalf("expected HIGH_ENTROPY_DENSE")
	}
	if domain.ClassifyEntropy(3.8) != "NATURAL_PROSE" {
		t.Fatalf("expected NATURAL_PROSE")
	}
	if domain.ClassifyEntropy(1.0) != "LOW_ENTROPY_SPARSE" {
		t.Fatalf("expected LOW_ENTROPY_SPARSE")
	}
}

func TestSanitizeContextForAIAndParseStructuredAIReply(t *testing.T) {
	if _, _, err := domain.SanitizeContextForAI("enc:YWJjZGVm", 1000); err == nil {
		t.Fatalf("expected encrypted content to be blocked by AI isolation")
	}
	if _, _, err := domain.SanitizeContextForAI("rk:YWJjZGVm", 1000); err == nil {
		t.Fatalf("expected recovery key blob to be blocked by AI isolation")
	}

	input := "Hello world with key tok_entropy_9K7xP2qW8mZ4rV6nJ1bL5tY3cH0dF and token aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW2xY4z"
	clean, redactions, err := domain.SanitizeContextForAI(input, 50)
	if err != nil {
		t.Fatalf("SanitizeContextForAI failed: %v", err)
	}
	if len(redactions) < 2 {
		t.Fatalf("expected at least 2 redactions, got %d (%v)", len(redactions), redactions)
	}
	if !strings.HasSuffix(clean, "[...truncated]") {
		t.Fatalf("expected truncation at maxChars, got: %s", clean)
	}

	op, cnt := domain.ParseStructuredAIReply("<opinion>Ajustei a coesao verbal.</opinion>\n<content>Texto revisado final.</content>")
	if op != "Ajustei a coesao verbal." || cnt != "Texto revisado final." {
		t.Fatalf("unexpected structured AI parse: op=%q cnt=%q", op, cnt)
	}

	op2, cnt2 := domain.ParseStructuredAIReply("Aqui esta a sugestao:\n```markdown\n# Capitulo Novo\nConteudo limpo.\n```\nEspero que ajude.")
	if !strings.Contains(op2, "Aqui esta a sugestao:") || !strings.Contains(cnt2, "# Capitulo Novo") {
		t.Fatalf("unexpected fenced fallback parse: op=%q cnt=%q", op2, cnt2)
	}

	op3, cnt3 := domain.ParseStructuredAIReply("Nota editorial fora.\n<content>Somente conteudo.</content>")
	if op3 != "Nota editorial fora." || cnt3 != "Somente conteudo." {
		t.Fatalf("unexpected content-only tag parse: op=%q cnt=%q", op3, cnt3)
	}

	opEmpty, cntEmpty := domain.ParseStructuredAIReply("   ")
	if opEmpty != "" || cntEmpty != "" {
		t.Fatalf("expected empty parse on blank string")
	}
}

func TestBuildDocumentHierarchyDAGAndZKPAndXHTML(t *testing.T) {
	docs := []domain.SearchResult{
		{ID: "doc-parent", Title: "Parent"},
		{ID: "doc-child-1", Title: "Child 1", ParentID: "doc-parent"},
		{ID: "doc-child-2", Title: "Child 2", ParentID: "doc-parent"},
	}
	topo, cascade := domain.BuildDocumentHierarchyDAG(docs)
	if topo.HasCycle || len(topo.Order) != 4 {
		t.Fatalf("unexpected DAG topo result: %+v", topo)
	}
	if len(cascade.AffectedOrder) != 4 {
		t.Fatalf("unexpected cascade plan: %+v", cascade)
	}

	zkp1 := domain.ComputeZKPRound(1, "", "A")
	if !zkp1.Verified || zkp1.ProbabilityFloat != 50.0 {
		t.Fatalf("unexpected round 1 ZKP proof: %+v", zkp1)
	}
	zkp256 := domain.ComputeZKPRound(256, "witness", "B")
	if !zkp256.Verified || !strings.HasSuffix(zkp256.CheatingProbability, "115%") {
		t.Fatalf("unexpected round 256 ZKP proof: %+v", zkp256)
	}

	diffRep := domain.ComputeDocumentDiff("doc-parent", 1, "# Old\nLine 1", 2, "# New\nLine 1\nLine 2")
	if diffRep.Additions != 2 || diffRep.Deletions != 1 || !strings.Contains(diffRep.UnifiedPatch, "@@") {
		t.Fatalf("unexpected diff report: %+v", diffRep)
	}

	xhtml := domain.RenderMarkdownToXHTML("# Title\n## Sub\n### H3\n> Quote\n- [x] Done\n- [ ] Todo\n- Item\n---\n**Bold** *Italic* `code`\n```go\nx := 1 < 2\n```")
	if !strings.Contains(xhtml, "<h1>Title</h1>") || !strings.Contains(xhtml, "<strong>Bold</strong>") || !strings.Contains(xhtml, "&lt;") {
		t.Fatalf("unexpected XHTML output: %s", xhtml)
	}

	categories := map[string]string{
		"note.md":     "markdown",
		"main.go":     "code",
		"readme.txt":  "text",
		"photo.png":   "image",
		"manual.pdf":  "pdf",
		"voice.mp3":   "audio",
		"clip.mp4":    "video",
		"report.docx": "document",
		"sheet.xlsx":  "spreadsheet",
		"slides.pptx": "presentation",
		"bundle.epub": "archive",
		"blob.bin":    "document",
	}
	for name, expected := range categories {
		if got := domain.ClassifyDriveFileCategory(name, ""); got != expected {
			t.Fatalf("for %s expected %s, got %s", name, expected, got)
		}
	}
	if domain.ClassifyDriveFileCategory("unknown", "image/webp") != "image" {
		t.Fatalf("expected MIME fallback to image")
	}
	if domain.ClassifyDriveFileCategory("unknown", "audio/wav") != "audio" {
		t.Fatalf("expected MIME fallback to audio")
	}
	if domain.ClassifyDriveFileCategory("unknown", "video/mp4") != "video" {
		t.Fatalf("expected MIME fallback to video")
	}
	if domain.ClassifyDriveFileCategory("unknown", "text/plain") != "text" {
		t.Fatalf("expected MIME fallback to text")
	}

	if domain.DetectHierarchyCycle("doc-child-1", "doc-parent", docs) {
		t.Fatalf("moving child under existing parent should not be a cycle")
	}
	if !domain.DetectHierarchyCycle("doc-parent", "doc-child-1", docs) {
		t.Fatalf("moving parent under its own child must be detected as a cycle")
	}
	if !domain.DetectHierarchyCycle("doc-parent", "doc-parent", docs) {
		t.Fatalf("moving document under itself must be detected as a cycle")
	}
	crumbs := domain.ComputeDocumentBreadcrumbs("doc-child-1", docs)
	if len(crumbs) != 2 || crumbs[0].ID != "doc-parent" || crumbs[1].ID != "doc-child-1" {
		t.Fatalf("unexpected breadcrumbs: %+v", crumbs)
	}

	zkpPathB := domain.ComputeZKPRound(4, "witness", "path-B")
	if zkpPathB.ChallengePath != "B" || zkpPathB.SoundnessConfidence <= 90.0 {
		t.Fatalf("expected ChallengePath=B and SoundnessConfidence>90, got %+v", zkpPathB)
	}

	tableXHTML := domain.RenderMarkdownToXHTML("| Param | Algo |\n| --- | --- |\n| Key | **Argon2id** |\n")
	if !strings.Contains(tableXHTML, "<table>") || !strings.Contains(tableXHTML, "<th>Param</th>") || !strings.Contains(tableXHTML, "<td><strong>Argon2id</strong></td>") {
		t.Fatalf("expected GFM table XHTML, got: %s", tableXHTML)
	}
}

func TestRAGEngineAndOperatorAliasRules(t *testing.T) {
	docMd := "# Cryptographic Architecture\nArgon2id derives a 256-bit key with 64MB RAM cost.\n\n## Zero Knowledge Proof\nSchnorr protocol proves possession of the witness without revealing secret material."
	chunks := domain.ChunkDocumentForRAG("doc-crypto", "Crypto Spec", docMd, 20)
	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 RAG chunks, got %d", len(chunks))
	}
	if empty := domain.ChunkDocumentForRAG("doc-enc", "Locked", "enc:ciphertext", 50); len(empty) != 0 {
		t.Fatalf("encrypted documents must never be indexed in RAG")
	}
	matches := domain.SearchSimilarChunks("Argon2id 256-bit key derivation", chunks, 3)
	if len(matches) == 0 || matches[0].DocID != "doc-crypto" || matches[0].Similarity <= 0 {
		t.Fatalf("expected RAG semantic match for Argon2id query, got %+v", matches)
	}

	alias, err := domain.ValidateOperatorAlias("  @Matz_Operator-01 ")
	if err != nil || alias != "@matz_operator-01" {
		t.Fatalf("expected normalized alias @matz_operator-01, got %q (err=%v)", alias, err)
	}
	if _, err := domain.ValidateOperatorAlias("ab"); err == nil {
		t.Fatalf("expected short alias to fail validation")
	}
	if domain.ComputeNextAliasPenaltyDays(0) != 0 ||
		domain.ComputeNextAliasPenaltyDays(1) != 15 ||
		domain.ComputeNextAliasPenaltyDays(2) != 30 ||
		domain.ComputeNextAliasPenaltyDays(3) != 60 ||
		domain.ComputeNextAliasPenaltyDays(4) != 90 {
		t.Fatalf("unexpected alias penalty schedule")
	}
}

func TestAuthCooldownLockoutSealAndHumanPresenceRules(t *testing.T) {
	// 1. Progressive cooldown schedule: 1st -> 0s, 2nd -> 20s, 3rd+ -> 60s, bot -> 60s
	if got := domain.ComputeAuthCooldownDuration(1, false); got != 0 {
		t.Fatalf("expected 0s after 1st failure, got %v", got)
	}
	if got := domain.ComputeAuthCooldownDuration(2, false); got != 20*time.Second {
		t.Fatalf("expected 20s after 2nd failure, got %v", got)
	}
	if got := domain.ComputeAuthCooldownDuration(3, false); got != 60*time.Second {
		t.Fatalf("expected 60s after 3rd failure, got %v", got)
	}
	if got := domain.ComputeAuthCooldownDuration(5, false); got != 60*time.Second {
		t.Fatalf("expected 60s after 5th failure, got %v", got)
	}
	if got := domain.ComputeAuthCooldownDuration(1, true); got != 60*time.Second {
		t.Fatalf("expected immediate 60s on bot detection, got %v", got)
	}

	// 2. Lockout HMAC-SHA256 seal verification & tamper detection
	seal := domain.ComputeLockoutSealMAC("seed-key", 2, 1700000020000, false)
	if !domain.VerifyLockoutSealMAC("seed-key", 2, 1700000020000, false, seal) {
		t.Fatalf("expected valid lockout seal MAC to pass")
	}
	if domain.VerifyLockoutSealMAC("seed-key", 0, 0, false, seal) {
		t.Fatalf("expected tampered failure count/timestamp to fail MAC check")
	}

	// 3. Challenge signature & Human Presence evaluation
	ch := domain.AuthChallengeDTO{
		ChallengeID:  1,
		Nonce:        "deadbeef01020304",
		IssuedAtMs:   10000,
		MinElapsedMs: 300,
		RequireHold:  false,
		HoldMinMs:    1000,
		HoldMaxMs:    2000,
	}
	ch.Signature = domain.SignAuthChallenge("challenge-secret", ch)

	humanProof := domain.HumanTelemetryProof{
		ChallengeID:       ch.ChallengeID,
		Nonce:             ch.Nonce,
		IssuedAtMs:        ch.IssuedAtMs,
		MinElapsedMs:      ch.MinElapsedMs,
		RequireHold:       ch.RequireHold,
		HoldMinMs:         ch.HoldMinMs,
		HoldMaxMs:         ch.HoldMaxMs,
		Signature:         ch.Signature,
		TrustedKeystrokes: 8,
		UntrustedEvents:   0,
		PasteDetected:     false,
		MeanFlightMs:      115.0,
		StdDevFlightMs:    28.5,
		MeanDwellMs:       72.0,
	}
	if !domain.VerifyAuthChallengeSignature("challenge-secret", humanProof) {
		t.Fatalf("expected challenge HMAC signature to verify")
	}
	if ok, reason := domain.EvaluateHumanPresence(humanProof, 11200); !ok {
		t.Fatalf("expected genuine human typing to pass, got reason=%s", reason)
	}

	// Synthetic DOM event must fail
	synProof := humanProof
	synProof.UntrustedEvents = 1
	if ok, _ := domain.EvaluateHumanPresence(synProof, 11200); ok {
		t.Fatalf("expected untrusted synthetic DOM event to be rejected")
	}

	// Superhuman robotic macro typing without tactile hold must fail
	macroProof := humanProof
	macroProof.MeanFlightMs = 5.0
	if ok, _ := domain.EvaluateHumanPresence(macroProof, 11200); ok {
		t.Fatalf("expected <14ms robotic keystroke injection to be rejected")
	}

	// Paste without tactile hold must fail, paste WITH valid hold inside bounds must pass
	pasteNoHold := humanProof
	pasteNoHold.TrustedKeystrokes = 0
	pasteNoHold.PasteDetected = true
	if ok, _ := domain.EvaluateHumanPresence(pasteNoHold, 11500); ok {
		t.Fatalf("expected paste without tactile hold to be rejected")
	}

	pasteWithHold := pasteNoHold
	pasteWithHold.HoldCompleted = true
	pasteWithHold.HoldTrusted = true
	pasteWithHold.HoldDurationMs = 1420
	// Server clock slower than claimed hold must be caught!
	if ok, _ := domain.EvaluateHumanPresence(pasteWithHold, 10500); ok {
		t.Fatalf("expected forged hold duration exceeding server elapsed time to fail")
	}
	if ok, reason := domain.EvaluateHumanPresence(pasteWithHold, 12000); !ok {
		t.Fatalf("expected paste with valid human tactile hold to pass, got %s", reason)
	}

	// 4. Ollama chat model capability classifier
	if cap := domain.ClassifyOllamaModelCapability("gemma4:latest"); !cap.SupportsChat || cap.Family != "gemma4" {
		t.Fatalf("expected gemma4:latest to support chat, got %+v", cap)
	}
	if capEmb := domain.ClassifyOllamaModelCapability("nomic-embed-text:latest"); capEmb.SupportsChat {
		t.Fatalf("expected nomic-embed-text:latest to be marked non-chat embedding model")
	}
}
