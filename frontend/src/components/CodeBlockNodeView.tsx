import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

const LANGUAGES = [
  { value: '', label: 'Plain text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'toml', label: 'TOML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'dart', label: 'Dart' },
  { value: 'lua', label: 'Lua' },
  { value: 'r', label: 'R' },
  { value: 'scala', label: 'Scala' },
  { value: 'elixir', label: 'Elixir' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'xml', label: 'XML' },
  { value: 'ini', label: 'INI' },
];

export function CodeBlockNodeView({ node, updateAttributes, extension }: any) {
  const [showDropdown, setShowDropdown] = useState(false);
  const currentLang = node.attrs.language || '';
  const currentLabel =
    LANGUAGES.find((l) => l.value === currentLang)?.label || currentLang || 'Plain text';

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <div className="code-block-header">
        <div className="code-block-lang-selector" style={{ position: 'relative' }}>
          <button
            type="button"
            className="code-block-lang-btn"
            onClick={() => setShowDropdown(!showDropdown)}
            contentEditable={false}
          >
            <span>{currentLabel}</span>
            <ChevronDown className="w-3 h-3 ml-1 opacity-60" strokeWidth={2} />
          </button>

          {showDropdown && (
            <div className="code-block-lang-dropdown" contentEditable={false}>
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  className={`code-block-lang-option ${currentLang === lang.value ? 'active' : ''}`}
                  onClick={() => {
                    updateAttributes({ language: lang.value });
                    setShowDropdown(false);
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <pre>
        <NodeViewContent as={'code' as any} />
      </pre>
    </NodeViewWrapper>
  );
}
