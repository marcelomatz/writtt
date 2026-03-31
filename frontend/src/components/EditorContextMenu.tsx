import { BookPlus, Copy, Scissors, Clipboard } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useDictionaryStore } from '../store/dictionaryStore';
import { useTranslation } from '../hooks/useTranslation';

const dict = {
  pt: {
    cut: 'Recortar',
    copy: 'Copiar',
    paste: 'Colar',
    add_to_dict: 'Adicionar ao dicionário',
  },
  en: {
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    add_to_dict: 'Add to dictionary',
  },
};

interface ContextMenuProps {
  editor: Editor | null;
}

interface MenuState {
  visible: boolean;
  x: number;
  y: number;
  word: string;
}

export function EditorContextMenu({ editor }: ContextMenuProps) {
  const t = useTranslation(dict);
  const addWord = useDictionaryStore((s) => s.addWord);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState>({ visible: false, x: 0, y: 0, word: '' });

  const getWordAtPosition = useCallback((): string => {
    if (!editor) return '';

    const { from, to } = editor.state.selection;
    // If text is selected, use that
    if (from !== to) {
      return editor.state.doc.textBetween(from, to, ' ').trim();
    }

    // Otherwise, get the word under the cursor
    const $pos = editor.state.doc.resolve(from);
    const node = $pos.parent;
    if (!node.isTextblock) return '';

    const text = node.textContent;
    const offset = $pos.parentOffset;

    // Find word boundaries around cursor
    let start = offset;
    let end = offset;
    while (start > 0 && /[\p{L}\p{M}'-]/u.test(text[start - 1])) start--;
    while (end < text.length && /[\p{L}\p{M}'-]/u.test(text[end])) end++;

    return text.slice(start, end);
  }, [editor]);

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      // Only handle right-click inside the ProseMirror editor
      const target = e.target as HTMLElement;
      if (!target.closest('.ProseMirror')) return;

      e.preventDefault();
      const word = getWordAtPosition();
      setMenu({ visible: true, x: e.clientX, y: e.clientY, word });
    },
    [getWordAtPosition],
  );

  const close = useCallback(() => {
    setMenu((m) => ({ ...m, visible: false }));
  }, []);

  // Listen for contextmenu events
  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, [handleContextMenu]);

  // Close on click outside
  useEffect(() => {
    if (!menu.visible) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menu.visible, close]);

  // Close on Escape
  useEffect(() => {
    if (!menu.visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu.visible, close]);

  if (!menu.visible) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        className="context-menu-item"
        onClick={() => {
          document.execCommand('cut');
          close();
        }}
      >
        <Scissors className="w-4 h-4" strokeWidth={1.5} />
        <span>{t.cut}</span>
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          document.execCommand('copy');
          close();
        }}
      >
        <Copy className="w-4 h-4" strokeWidth={1.5} />
        <span>{t.copy}</span>
      </button>
      <button
        className="context-menu-item"
        onClick={async () => {
          try {
            const text = await navigator.clipboard.readText();
            editor?.chain().focus().insertContent(text).run();
          } catch { /* clipboard not available */ }
          close();
        }}
      >
        <Clipboard className="w-4 h-4" strokeWidth={1.5} />
        <span>{t.paste}</span>
      </button>

      {menu.word && (
        <>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={() => {
              menu.word.split(/\s+/).forEach((w) => addWord(w));
              close();
            }}
          >
            <BookPlus className="w-4 h-4" strokeWidth={1.5} />
            <span>
              {t.add_to_dict}
              <span className="context-menu-word">"{menu.word}"</span>
            </span>
          </button>
        </>
      )}
    </div>
  );
}
