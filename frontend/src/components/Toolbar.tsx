import type { Editor } from '@tiptap/react';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  Grid3X3,
  Heading1,
  Heading2,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Paintbrush,
  Pencil,
  Quote,
  Redo,
  Smile,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SaveAttachment } from '../../wailsjs/go/main/App';
import { useTranslation } from '../hooks/useTranslation';
import { useModalStore } from '../store/modalStore';

interface ToolbarProps {
  editor: Editor | null;
}

const ICON_SIZE = 'w-[18px] h-[18px]';
const ICON_STROKE = 1.75;

const dict = {
  pt: {
    prompt_link_title: 'Adicionar Link',
    prompt_link_msg: 'Insira a URL do link:',
    prompt_media_title: 'Adicionar Mídia',
    prompt_media_msg: 'Insira a URL ou faça upload de um arquivo:',
    tool_undo: 'Desfazer (Ctrl+Z)',
    tool_redo: 'Refazer (Ctrl+Y)',
    tool_h1: 'Título 1',
    tool_h2: 'Título 2',
    tool_bold: 'Negrito (Ctrl+B)',
    tool_italic: 'Itálico (Ctrl+I)',
    tool_code: 'Bloco de Código',
    tool_quote: 'Citação',
    tool_align_left: 'Alinhar à esquerda',
    tool_align_center: 'Centralizar',
    tool_align_right: 'Alinhar à direita',
    tool_align_justify: 'Justificar',
    tool_bullet: 'Lista com marcadores',
    tool_ordered: 'Lista numerada',
    tool_link: 'Inserir Link',
    tool_image: 'Inserir Imagem / Mídia',
    tool_emoji: 'Emoji',
    tool_underline: 'Sublinhado (Ctrl+U)',
    tool_strike: 'Tachado',
    tool_highlight: 'Realçar',
    tool_task: 'Lista de tarefas',
    tool_hr: 'Linha horizontal',
    tool_table: 'Inserir tabela',
    tool_drawing: 'Desenho livre',
    tool_format_more: 'Mais formatação',
  },
  en: {
    prompt_link_title: 'Add Link',
    prompt_link_msg: 'Enter the link URL:',
    prompt_media_title: 'Add Media',
    prompt_media_msg: 'Enter the URL or upload a file:',
    tool_undo: 'Undo (Ctrl+Z)',
    tool_redo: 'Redo (Ctrl+Y)',
    tool_h1: 'Heading 1',
    tool_h2: 'Heading 2',
    tool_bold: 'Bold (Ctrl+B)',
    tool_italic: 'Italic (Ctrl+I)',
    tool_code: 'Code Block',
    tool_quote: 'Blockquote',
    tool_align_left: 'Align Left',
    tool_align_center: 'Center',
    tool_align_right: 'Align Right',
    tool_align_justify: 'Justify',
    tool_bullet: 'Bullet List',
    tool_ordered: 'Ordered List',
    tool_link: 'Insert Link',
    tool_image: 'Insert Image / Media',
    tool_emoji: 'Emoji',
    tool_underline: 'Underline (Ctrl+U)',
    tool_strike: 'Strikethrough',
    tool_highlight: 'Highlight',
    tool_task: 'Task List',
    tool_hr: 'Horizontal Rule',
    tool_table: 'Insert Table',
    tool_drawing: 'Freehand Drawing',
    tool_format_more: 'More formatting',
  },
};

function Divider() {
  return (
    <span
      className="w-px h-5 mx-1 flex-shrink-0 rounded-full"
      style={{ backgroundColor: 'var(--border)' }}
    />
  );
}

function ToolBtn({
  icon: Icon,
  onClick,
  isActive = false,
  disabled = false,
  title,
}: {
  icon: React.ElementType;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        relative flex items-center justify-center w-8 h-8 rounded-lg
        transition-all duration-200 ease-out flex-shrink-0
        disabled:opacity-25 disabled:cursor-not-allowed
        ${isActive ? 'text-white shadow-sm' : 'hover:scale-105 active:scale-95'}
      `}
      style={
        isActive
          ? { backgroundColor: 'var(--accent, #3b82f6)', color: '#fff' }
          : { color: 'var(--text-secondary)' }
      }
      onMouseEnter={(e) => {
        if (!isActive && !disabled) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
        }
      }}
    >
      <Icon className={ICON_SIZE} strokeWidth={ICON_STROKE} />
    </button>
  );
}

/* ── Table Grid Picker ──────────────────────────────────────────────── */
function TableGridPicker({
  onSelect,
  onClose,
}: {
  onSelect: (rows: number, cols: number) => void;
  onClose: () => void;
}) {
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const maxRows = 8;
  const maxCols = 8;

  return (
    <div
      ref={gridRef}
      className="absolute z-50 top-full mt-2 left-0 p-3 rounded-xl shadow-2xl border"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      <div className="mb-2 text-center text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {hoverRow > 0 ? `${hoverRow} × ${hoverCol}` : 'Selecione'}
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${maxCols}, 1fr)` }}>
        {Array.from({ length: maxRows * maxCols }, (_, i) => {
          const row = Math.floor(i / maxCols) + 1;
          const col = (i % maxCols) + 1;
          const isHighlighted = row <= hoverRow && col <= hoverCol;
          return (
            <div
              key={i}
              className="w-5 h-5 rounded-sm cursor-pointer transition-all duration-100"
              style={{
                backgroundColor: isHighlighted ? 'var(--accent)' : 'var(--bg-surface)',
                border: `1px solid ${isHighlighted ? 'var(--accent)' : 'var(--border)'}`,
                opacity: isHighlighted ? 1 : 0.5,
              }}
              onMouseEnter={() => {
                setHoverRow(row);
                setHoverCol(col);
              }}
              onClick={() => {
                onSelect(row, col);
                onClose();
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── Format Dropdown ────────────────────────────────────────────────── */
function FormatDropdown({
  editor,
  t,
  onClose,
}: {
  editor: Editor;
  t: any;
  onClose: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const items = [
    {
      icon: UnderlineIcon,
      label: t.tool_underline,
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive('underline'),
    },
    {
      icon: Strikethrough,
      label: t.tool_strike,
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike'),
    },
    {
      icon: Highlighter,
      label: t.tool_highlight,
      action: () => editor.chain().focus().toggleHighlight().run(),
      isActive: editor.isActive('highlight'),
    },
    {
      icon: Minus,
      label: t.tool_hr,
      action: () => editor.chain().focus().setHorizontalRule().run(),
      isActive: false,
    },
  ];

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 top-full mt-2 right-0 py-1 rounded-xl shadow-2xl border min-w-[180px]"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.action();
            onClose();
          }}
          className="flex items-center gap-3 w-full px-3 py-2 text-sm transition-all duration-150 rounded-lg mx-1"
          style={{
            color: item.isActive ? 'var(--accent)' : 'var(--text-secondary)',
            width: 'calc(100% - 8px)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-surface)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          }}
        >
          <item.icon className="w-4 h-4" strokeWidth={1.5} />
          <span className="font-light">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;

  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isFormatDropdownOpen, setIsFormatDropdownOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const formatRef = useRef<HTMLDivElement>(null);
  const t = useTranslation(dict);

  // Detect current theme from CSS variable set on :root
  const [emojiTheme, setEmojiTheme] = useState<Theme>(Theme.LIGHT);
  useEffect(() => {
    const readAndInject = () => {
      const s = getComputedStyle(document.documentElement);
      const get = (v: string) => s.getPropertyValue(v).trim();

      const bg = get('--bg-surface');
      const elevated = get('--bg-elevated');
      const text = get('--text-primary');
      const border = get('--border');
      const accent = get('--accent');

      // Detect dark/light for the Theme prop
      const isDark =
        document.documentElement.classList.contains('dark') ||
        get('color-scheme').includes('dark') ||
        bg.startsWith('#1') ||
        bg.startsWith('#0') ||
        bg.startsWith('rgb(1') ||
        bg.startsWith('rgb(0');
      setEmojiTheme(isDark ? Theme.DARK : Theme.LIGHT);

      // Inject / update a style tag that overrides EmojiPickerReact CSS vars
      // with the ACTUAL computed values (not var() refs, so they beat the library's own vars)
      let el = document.getElementById('epr-theme-override') as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement('style');
        el.id = 'epr-theme-override';
        document.head.appendChild(el);
      }
      el.textContent = `
        .EmojiPickerReact {
          --epr-bg-color: ${bg || 'inherit'} !important;
          --epr-category-label-bg-color: ${bg || 'inherit'} !important;
          --epr-header-overlay-bg-color: ${bg || 'inherit'} !important;
          --epr-search-input-bg-color: ${elevated || 'inherit'} !important;
          --epr-search-input-bg-color-active: ${elevated || 'inherit'} !important;
          --epr-emoji-hover-color: ${elevated || 'inherit'} !important;
          --epr-focus-bg-color: ${elevated || 'inherit'} !important;
          --epr-text-color: ${text || 'inherit'} !important;
          --epr-search-border-color: ${border || 'inherit'} !important;
          --epr-category-icon-active-color: ${accent || 'inherit'} !important;
          --epr-highlight-color: ${accent || 'inherit'} !important;
        }
      `;
    };

    readAndInject();

    // Re-run whenever theme class, data-theme, or inline style (lighting) changes
    const observer = new MutationObserver(readAndInject);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    return () => {
      observer.disconnect();
      document.getElementById('epr-theme-override')?.remove();
    };
  }, []);

  // Close picker when clicking outside
  useEffect(() => {
    if (!isEmojiPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isEmojiPickerOpen]);

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    useModalStore.getState().show({
      type: 'prompt',
      title: t.prompt_link_title,
      message: t.prompt_link_msg,
      initialValue: previousUrl,
      onConfirm: (url) => {
        if (url) {
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        } else {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
        }
      },
    });
  }, [editor, t]);

  const addImage = useCallback(() => {
    const handleFileUpload = (file: File) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result) {
          const base64 = e.target.result as string;
          try {
            const url = await SaveAttachment(file.name, base64);
            if (file.type.startsWith('image/')) {
              editor.chain().focus().setImage({ src: url, alt: file.name }).run();
            } else {
              editor
                .chain()
                .focus()
                .insertContent(`<a href="${url}" download>${file.name}</a>`)
                .run();
            }
          } catch (err) {
            console.error('Failed to save attachment:', err);
          }
        }
      };
      reader.readAsDataURL(file);
    };

    useModalStore.getState().show({
      type: 'prompt-upload',
      title: t.prompt_media_title,
      message: t.prompt_media_msg,
      onConfirm: (url) => {
        if (url) editor.chain().focus().setImage({ src: url }).run();
      },
      onFileUpload: handleFileUpload,
    });
  }, [editor, t]);

  const onEmojiClick = (emojiObject: EmojiClickData) => {
    editor.chain().focus().insertContent(emojiObject.emoji).run();
    setIsEmojiPickerOpen(false);
  };

  const insertTable = useCallback(
    (rows: number, cols: number) => {
      editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    },
    [editor],
  );

  const hasFormatActive =
    editor.isActive('underline') || editor.isActive('strike') || editor.isActive('highlight');

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-1 px-3 py-2 z-10 transition-colors duration-300 rounded-2xl"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        minHeight: '48px',
      }}
    >
      {/* History */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <ToolBtn
          icon={Undo}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title={t.tool_undo}
        />
        <ToolBtn
          icon={Redo}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title={t.tool_redo}
        />
      </div>

      <Divider />

      {/* Headings */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <ToolBtn
          icon={Heading1}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title={t.tool_h1}
        />
        <ToolBtn
          icon={Heading2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title={t.tool_h2}
        />
      </div>

      <Divider />

      {/* Core Formatting */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <ToolBtn
          icon={Bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title={t.tool_bold}
        />
        <ToolBtn
          icon={Italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title={t.tool_italic}
        />
        <ToolBtn
          icon={Code}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive('codeBlock')}
          title={t.tool_code}
        />
        <ToolBtn
          icon={Quote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title={t.tool_quote}
        />

        {/* Format dropdown (Underline, Strike, Highlight, HR) */}
        <div ref={formatRef} className="relative">
          <button
            onClick={() => setIsFormatDropdownOpen(!isFormatDropdownOpen)}
            title={t.tool_format_more}
            className={`
              relative flex items-center justify-center h-8 px-1.5 rounded-lg
              transition-all duration-200 ease-out flex-shrink-0
              ${hasFormatActive ? 'text-white shadow-sm' : 'hover:scale-105 active:scale-95'}
            `}
            style={
              hasFormatActive
                ? { backgroundColor: 'var(--accent, #3b82f6)', color: '#fff' }
                : { color: 'var(--text-secondary)' }
            }
            onMouseEnter={(e) => {
              if (!hasFormatActive) {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!hasFormatActive) {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              }
            }}
          >
            <Paintbrush className={ICON_SIZE} strokeWidth={ICON_STROKE} />
            <ChevronDown className="w-3 h-3 ml-0.5" strokeWidth={2} />
          </button>
          {isFormatDropdownOpen && (
            <FormatDropdown
              editor={editor}
              t={t}
              onClose={() => setIsFormatDropdownOpen(false)}
            />
          )}
        </div>
      </div>

      <Divider />

      {/* Alignment */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <ToolBtn
          icon={AlignLeft}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title={t.tool_align_left}
        />
        <ToolBtn
          icon={AlignCenter}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title={t.tool_align_center}
        />
        <ToolBtn
          icon={AlignRight}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title={t.tool_align_right}
        />
        <ToolBtn
          icon={AlignJustify}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          title={t.tool_align_justify}
        />
      </div>

      <Divider />

      {/* Lists */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <ToolBtn
          icon={List}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title={t.tool_bullet}
        />
        <ToolBtn
          icon={ListOrdered}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title={t.tool_ordered}
        />
        <ToolBtn
          icon={ListTodo}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={editor.isActive('taskList')}
          title={t.tool_task}
        />
      </div>

      <Divider />

      {/* Table, Drawing, Media & Links */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* Table grid picker */}
        <div ref={tableRef} className="relative">
          <ToolBtn
            icon={Grid3X3}
            onClick={() => setIsTablePickerOpen(!isTablePickerOpen)}
            isActive={editor.isActive('table')}
            title={t.tool_table}
          />
          {isTablePickerOpen && (
            <TableGridPicker
              onSelect={insertTable}
              onClose={() => setIsTablePickerOpen(false)}
            />
          )}
        </div>

        <ToolBtn
          icon={Pencil}
          onClick={() => (editor.commands as any).insertDrawing()}
          title={t.tool_drawing}
        />

        <ToolBtn
          icon={LinkIcon}
          onClick={setLink}
          isActive={editor.isActive('link')}
          title={t.tool_link}
        />
        <ToolBtn
          icon={ImageIcon}
          onClick={addImage}
          isActive={editor.isActive('image')}
          title={t.tool_image}
        />

        {/* Emoji Picker */}
        <div ref={emojiRef} className="relative">
          <ToolBtn
            icon={Smile}
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            title={t.tool_emoji}
          />
          {isEmojiPickerOpen && (
            <div
              className="absolute z-50 top-full mt-2 right-0 rounded-xl overflow-hidden"
              style={{
                // Map page CSS vars → emoji-picker-react CSS vars
                ['--epr-bg-color' as string]: 'var(--bg-surface)',
                ['--epr-category-label-bg-color' as string]: 'var(--bg-surface)',
                ['--epr-search-input-bg-color' as string]: 'var(--bg-elevated)',
                ['--epr-search-input-bg-color-active' as string]: 'var(--bg-elevated)',
                ['--epr-emoji-hover-color' as string]: 'var(--bg-elevated)',
                ['--epr-text-color' as string]: 'var(--text-primary)',
                ['--epr-search-border-color' as string]: 'var(--border)',
                ['--epr-category-icon-active-color' as string]: 'var(--accent)',
                ['--epr-highlight-color' as string]: 'var(--accent)',
                ['--epr-focus-bg-color' as string]: 'var(--bg-elevated)',
                ['--epr-header-overlay-bg-color' as string]: 'var(--bg-surface)',
              }}
            >
              <EmojiPicker
                onEmojiClick={onEmojiClick}
                theme={emojiTheme}
                width={300}
                height={340}
                searchDisabled={false}
                skinTonesDisabled
                previewConfig={{ showPreview: false }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
