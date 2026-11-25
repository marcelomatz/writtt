package domain

import (
	"regexp"
	"strings"
)

var (
	boldRe = regexp.MustCompile(`\*\*(.+?)\*\*`)
	italRe = regexp.MustCompile(`\*(.+?)\*`)
	codeRe = regexp.MustCompile("`([^`]+)`")
)

func isMarkdownTableSeparator(line string) bool {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "|") || !strings.HasSuffix(trimmed, "|") {
		return false
	}
	cells := splitMarkdownTableRow(trimmed)
	if len(cells) == 0 {
		return false
	}
	for _, c := range cells {
		clean := strings.Trim(strings.TrimSpace(c), ":")
		if len(clean) < 2 || strings.Trim(clean, "-") != "" {
			return false
		}
	}
	return true
}

func splitMarkdownTableRow(line string) []string {
	trimmed := strings.TrimSpace(line)
	trimmed = strings.TrimPrefix(trimmed, "|")
	trimmed = strings.TrimSuffix(trimmed, "|")
	parts := strings.Split(trimmed, "|")
	out := make([]string, len(parts))
	for i, p := range parts {
		out[i] = strings.TrimSpace(p)
	}
	return out
}

// RenderMarkdownToXHTML converts Markdown text into valid, clean XHTML for EPUB3 and HTML export.
func RenderMarkdownToXHTML(md string) string {
	lines := strings.Split(strings.ReplaceAll(md, "\r\n", "\n"), "\n")
	var out strings.Builder
	inCode := false
	inList := false

	closeList := func() {
		if inList {
			out.WriteString("</ul>\n")
			inList = false
		}
	}

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			closeList()
			if !inCode {
				inCode = true
				out.WriteString("<pre><code>")
			} else {
				inCode = false
				out.WriteString("</code></pre>\n")
			}
			continue
		}
		if inCode {
			out.WriteString(escapeXHTML(line) + "\n")
			continue
		}
		if trimmed == "" {
			closeList()
			continue
		}
		if trimmed == "---" || trimmed == "***" {
			closeList()
			out.WriteString("<hr />\n")
			continue
		}
		// GFM Table block detection
		if strings.HasPrefix(trimmed, "|") && strings.HasSuffix(trimmed, "|") && i+1 < len(lines) && isMarkdownTableSeparator(lines[i+1]) {
			closeList()
			headers := splitMarkdownTableRow(trimmed)
			out.WriteString("<table>\n<thead><tr>")
			for _, h := range headers {
				out.WriteString("<th>" + formatInlineXHTML(h) + "</th>")
			}
			out.WriteString("</tr></thead>\n<tbody>\n")
			i += 2
			for i < len(lines) {
				rowTrim := strings.TrimSpace(lines[i])
				if !strings.HasPrefix(rowTrim, "|") || !strings.HasSuffix(rowTrim, "|") {
					i--
					break
				}
				cells := splitMarkdownTableRow(rowTrim)
				out.WriteString("<tr>")
				for _, c := range cells {
					out.WriteString("<td>" + formatInlineXHTML(c) + "</td>")
				}
				out.WriteString("</tr>\n")
				i++
			}
			out.WriteString("</tbody>\n</table>\n")
			continue
		}
		if strings.HasPrefix(line, "### ") {
			closeList()
			out.WriteString("<h3>" + formatInlineXHTML(line[4:]) + "</h3>\n")
			continue
		}
		if strings.HasPrefix(line, "## ") {
			closeList()
			out.WriteString("<h2>" + formatInlineXHTML(line[3:]) + "</h2>\n")
			continue
		}
		if strings.HasPrefix(line, "# ") {
			closeList()
			out.WriteString("<h1>" + formatInlineXHTML(line[2:]) + "</h1>\n")
			continue
		}
		if strings.HasPrefix(line, "> ") {
			closeList()
			out.WriteString("<blockquote><p>" + formatInlineXHTML(line[2:]) + "</p></blockquote>\n")
			continue
		}
		if strings.HasPrefix(line, "- ") || strings.HasPrefix(line, "* ") {
			if !inList {
				out.WriteString("<ul>\n")
				inList = true
			}
			item := line[2:]
			if strings.HasPrefix(item, "[x] ") || strings.HasPrefix(item, "[X] ") {
				out.WriteString("<li>[x] " + formatInlineXHTML(item[4:]) + "</li>\n")
			} else if strings.HasPrefix(item, "[ ] ") {
				out.WriteString("<li>[ ] " + formatInlineXHTML(item[4:]) + "</li>\n")
			} else {
				out.WriteString("<li>" + formatInlineXHTML(item) + "</li>\n")
			}
			continue
		}
		closeList()
		out.WriteString("<p>" + formatInlineXHTML(line) + "</p>\n")
	}
	closeList()
	if inCode {
		out.WriteString("</code></pre>\n")
	}
	return out.String()
}

func formatInlineXHTML(s string) string {
	esc := escapeXHTML(s)
	esc = boldRe.ReplaceAllString(esc, "<strong>$1</strong>")
	esc = italRe.ReplaceAllString(esc, "<em>$1</em>")
	esc = codeRe.ReplaceAllString(esc, "<code>$1</code>")
	return esc
}

func escapeXHTML(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		"\"", "&quot;",
	)
	return r.Replace(s)
}
