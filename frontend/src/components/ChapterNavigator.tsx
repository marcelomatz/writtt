import type { Editor } from '@tiptap/core';
import { BookOpen, ChevronRight, Hash, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';

const dict = {
  pt: {
    title: 'Capítulos',
    no_chapters: 'Adicione títulos (H1, H2) para criar capítulos.',
    words: 'palavras',
  },
  en: {
    title: 'Chapters',
    no_chapters: 'Add headings (H1, H2) to create chapters.',
    words: 'words',
  },
};

interface Chapter {
  id: string;
  title: string;
  level: number;
  pos: number;
  wordCount: number;
}

interface ChapterNavigatorProps {
  editor: Editor | null;
  visible: boolean;
}

function countWordsInRange(editor: Editor, from: number, to: number): number {
  const text = editor.state.doc.textBetween(from, to, ' ');
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

export function ChapterNavigator({ editor, visible }: ChapterNavigatorProps) {
  const t = useTranslation(dict);
  const leftSidebarCollapsed = useEditorStore((s) => s.leftSidebarCollapsed);
  const toggleChapters = useEditorStore((s) => s.toggleChapters);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  const extractChapters = useCallback(() => {
    if (!editor) return;

    const doc = editor.state.doc;
    const headings: { title: string; level: number; pos: number }[] = [];

    doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && (node.attrs.level === 1 || node.attrs.level === 2)) {
        headings.push({
          title: node.textContent,
          level: node.attrs.level,
          pos,
        });
      }
    });

    const docSize = doc.content.size;
    const result: Chapter[] = headings.map((h, i) => {
      const nextPos = i < headings.length - 1 ? headings[i + 1].pos : docSize;
      const wordCount = countWordsInRange(editor, h.pos, nextPos);
      return {
        id: `ch-${i}-${h.pos}`,
        title: h.title || `(sem título)`,
        level: h.level,
        pos: h.pos,
        wordCount,
      };
    });

    setChapters(result);
  }, [editor]);

  // Re-extract on document updates
  useEffect(() => {
    if (!editor) return;

    extractChapters();

    const handler = () => extractChapters();
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, extractChapters]);

  const scrollToChapter = useCallback(
    (chapter: Chapter) => {
      if (!editor) return;
      setActiveChapterId(chapter.id);

      // Set cursor to the heading position
      editor.chain().focus().setTextSelection(chapter.pos + 1).run();

      // Scroll the heading into view
      const domNode = editor.view.domAtPos(chapter.pos + 1);
      if (domNode?.node) {
        const el = domNode.node instanceof HTMLElement
          ? domNode.node
          : domNode.node.parentElement;
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [editor],
  );

  if (!visible) return null;

  return (
    <div
      className="chapter-navigator"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="chapter-navigator-header">
        <BookOpen className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--text-primary)' }}>{t.title}</span>
        <span
          className="chapter-count-badge"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            color: 'var(--accent)',
          }}
        >
          {chapters.length}
        </span>

        {leftSidebarCollapsed && (
          <button
            onClick={toggleChapters}
            className="ml-auto p-1 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="chapter-navigator-list">
        {chapters.length === 0 ? (
          <p className="chapter-empty" style={{ color: 'var(--text-muted)' }}>
            {t.no_chapters}
          </p>
        ) : (
          chapters.map((chapter) => (
            <button
              key={chapter.id}
              className={`chapter-item ${activeChapterId === chapter.id ? 'active' : ''}`}
              onClick={() => scrollToChapter(chapter)}
              style={{
                paddingLeft: chapter.level === 2 ? '2rem' : '0.75rem',
              }}
            >
              <div className="chapter-item-indicator">
                {chapter.level === 1 ? (
                  <ChevronRight
                    className="w-3 h-3"
                    strokeWidth={2}
                    style={{ color: activeChapterId === chapter.id ? 'var(--accent)' : 'var(--text-muted)' }}
                  />
                ) : (
                  <Hash
                    className="w-3 h-3"
                    strokeWidth={1.5}
                    style={{ color: 'var(--text-muted)' }}
                  />
                )}
              </div>
              <div className="chapter-item-content">
                <span
                  className="chapter-item-title"
                  style={{
                    color: activeChapterId === chapter.id ? 'var(--accent)' : 'var(--text-primary)',
                    fontWeight: chapter.level === 1 ? 500 : 400,
                  }}
                >
                  {chapter.title}
                </span>
                <span className="chapter-item-words" style={{ color: 'var(--text-muted)' }}>
                  {chapter.wordCount} {t.words}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
