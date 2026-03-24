import { Editor } from '@tiptap/react';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote, 
  Code, 
  Undo, 
  Redo,
  Heading1,
  Heading2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Image as ImageIcon,
  Smile,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useModalStore } from '../store/modalStore';
import { SaveAttachment } from '../../wailsjs/go/main/App';

interface ToolbarProps {
  editor: Editor | null;
}

const ICON_SIZE = 'w-[18px] h-[18px]';
const ICON_STROKE = 1.75;

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
  title 
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
        ${isActive
          ? 'text-white shadow-sm'
          : 'hover:scale-105 active:scale-95'
        }
      `}
      style={
        isActive
          ? { backgroundColor: 'var(--accent, #3b82f6)', color: '#fff' }
          : { color: 'var(--text-secondary)' }
      }
      onMouseEnter={e => {
        if (!isActive && !disabled) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-elevated)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
        }
      }}
      onMouseLeave={e => {
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

export function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;

  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Detect current theme from CSS variable set on :root
  const [emojiTheme, setEmojiTheme] = useState<Theme>(Theme.LIGHT);
  useEffect(() => {
    const readAndInject = () => {
      const s = getComputedStyle(document.documentElement);
      const get = (v: string) => s.getPropertyValue(v).trim();

      const bg       = get('--bg-surface');
      const elevated = get('--bg-elevated');
      const text     = get('--text-primary');
      const border   = get('--border');
      const accent   = get('--accent');

      // Detect dark/light for the Theme prop
      const isDark = document.documentElement.classList.contains('dark') ||
        get('color-scheme').includes('dark') ||
        bg.startsWith('#1') || bg.startsWith('#0') || bg.startsWith('rgb(1') || bg.startsWith('rgb(0');
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
      title: 'Adicionar Link',
      message: 'Insira a URL do link:',
      initialValue: previousUrl,
      onConfirm: (url) => {
        if (url) {
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        } else {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
        }
      },
    });
  }, [editor]);

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
              editor.chain().focus().insertContent(`<a href="${url}" download>${file.name}</a>`).run();
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
      title: 'Adicionar Mídia',
      message: 'Insira a URL ou faça upload de um arquivo:',
      onConfirm: (url) => {
        if (url) editor.chain().focus().setImage({ src: url }).run();
      },
      onFileUpload: handleFileUpload,
    });
  }, [editor]);

  const onEmojiClick = (emojiObject: EmojiClickData) => {
    editor.chain().focus().insertContent(emojiObject.emoji).run();
    setIsEmojiPickerOpen(false);
  };

  return (
    <div
      className="flex items-center justify-center gap-0.5 px-3 py-2 z-10 transition-colors duration-300 rounded-xl"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        minHeight: '48px',
      }}
    >
      {/* History */}
      <div className="flex items-center gap-0.5">
        <ToolBtn
          icon={Undo}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Desfazer (Ctrl+Z)"
        />
        <ToolBtn
          icon={Redo}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Refazer (Ctrl+Y)"
        />
      </div>

      <Divider />

      {/* Headings */}
      <div className="flex items-center gap-0.5">
        <ToolBtn
          icon={Heading1}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Título 1"
        />
        <ToolBtn
          icon={Heading2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Título 2"
        />
      </div>

      <Divider />

      {/* Formatting */}
      <div className="flex items-center gap-0.5">
        <ToolBtn
          icon={Bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Negrito (Ctrl+B)"
        />
        <ToolBtn
          icon={Italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Itálico (Ctrl+I)"
        />
        <ToolBtn
          icon={Code}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive('codeBlock')}
          title="Bloco de Código"
        />
        <ToolBtn
          icon={Quote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          title="Citação"
        />
      </div>

      <Divider />

      {/* Alignment */}
      <div className="flex items-center gap-0.5">
        <ToolBtn
          icon={AlignLeft}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Alinhar à esquerda"
        />
        <ToolBtn
          icon={AlignCenter}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Centralizar"
        />
        <ToolBtn
          icon={AlignRight}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Alinhar à direita"
        />
        <ToolBtn
          icon={AlignJustify}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          title="Justificar"
        />
      </div>

      <Divider />

      {/* Lists */}
      <div className="flex items-center gap-0.5">
        <ToolBtn
          icon={List}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Lista com marcadores"
        />
        <ToolBtn
          icon={ListOrdered}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Lista numerada"
        />
      </div>

      <Divider />

      {/* Media & Links */}
      <div className="flex items-center gap-0.5">
        <ToolBtn
          icon={LinkIcon}
          onClick={setLink}
          isActive={editor.isActive('link')}
          title="Inserir Link"
        />
        <ToolBtn
          icon={ImageIcon}
          onClick={addImage}
          isActive={editor.isActive('image')}
          title="Inserir Imagem / Mídia"
        />

        {/* Emoji Picker */}
        <div ref={emojiRef} className="relative">
          <ToolBtn
            icon={Smile}
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            title="Emoji"
          />
          {isEmojiPickerOpen && (
            <div
              className="absolute z-50 top-full mt-2 right-0 rounded-xl overflow-hidden"
              style={{
                // Map page CSS vars → emoji-picker-react CSS vars
                ['--epr-bg-color' as string]:                   'var(--bg-surface)',
                ['--epr-category-label-bg-color' as string]:    'var(--bg-surface)',
                ['--epr-search-input-bg-color' as string]:      'var(--bg-elevated)',
                ['--epr-search-input-bg-color-active' as string]:'var(--bg-elevated)',
                ['--epr-emoji-hover-color' as string]:          'var(--bg-elevated)',
                ['--epr-text-color' as string]:                 'var(--text-primary)',
                ['--epr-search-border-color' as string]:        'var(--border)',
                ['--epr-category-icon-active-color' as string]: 'var(--accent)',
                ['--epr-highlight-color' as string]:            'var(--accent)',
                ['--epr-focus-bg-color' as string]:             'var(--bg-elevated)',
                ['--epr-header-overlay-bg-color' as string]:    'var(--bg-surface)',
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
