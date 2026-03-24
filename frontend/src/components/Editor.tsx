import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Image from '@tiptap/extension-image';

import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Focus from '@tiptap/extension-focus';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useSecurityStore } from '../store/securityStore';

import { SaveAttachment } from '../../wailsjs/go/main/App';
import { Toolbar } from './Toolbar';
import { BubbleMenu } from './BubbleMenu';
import { ImageBubbleMenu } from './ImageBubbleMenu';
import { VaultUnlockOverlay } from './VaultUnlockOverlay';
import { ImageNodeView } from './ImageNodeView';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import BubbleMenuExtension from '@tiptap/extension-bubble-menu';

export function Editor() {
  const { 
    primaryDoc,
    saveCurrentDocument,
    setStats,
    updateDocumentTitle
  } = useEditorStore();

  const doc = primaryDoc;
  const { vaultUnlocked } = useSecurityStore();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Track whether the user has scrolled past the initial position.
  // Used to toggle the glassmorphism "floating" effect on the toolbar.
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolled(el.scrollTop > 8);
  };

  // Recalculate textarea height whenever the doc changes (e.g. on open)
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [doc?.frontmatter.id]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        paragraph: { HTMLAttributes: { class: 'leading-relaxed mb-4' } },
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            'data-align': {
              default: 'center',
            },
            'data-caption': {
              default: '',
            },
          };
        },
        // Custom markdown serializer: encode data-caption as the image title
        // so it survives save/load. Output: ![alt](src "caption")
        addStorage() {
          return {
            markdown: {
              serialize(state: any, node: any) {
                const caption = node.attrs['data-caption'] ?? '';
                const alt = (node.attrs.alt ?? '').replace(/"/g, '\\"');
                const title = caption ? ` "${caption.replace(/"/g, '\\"')}"` : '';
                state.write(`![${alt}](${node.attrs.src}${title})`);
              },
              parse: {},
            },
          };
        },
        // Restore data-caption from the markdown title attribute on parse
        parseHTML() {
          return [
            {
              tag: 'img[src]',
              getAttrs(el: HTMLElement | string) {
                if (typeof el === 'string') return {};
                return {
                  src: (el as HTMLImageElement).getAttribute('src'),
                  alt: (el as HTMLImageElement).getAttribute('alt'),
                  'data-align': (el as HTMLImageElement).getAttribute('data-align') ?? 'center',
                  'data-caption': (el as HTMLImageElement).getAttribute('data-caption') ?? (el as HTMLImageElement).getAttribute('title') ?? '',
                };
              },
            },
          ];
        },
        addNodeView() {
          return ReactNodeViewRenderer(ImageNodeView);
        },
      }),
      CharacterCount,
      Typography,
      Focus.configure({ className: 'has-focus', mode: 'all' }),
      Placeholder.configure({
        placeholder: 'Comece a pensar aqui...',
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
      }),
      BubbleMenuExtension,
    ],
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[500px]',
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async (e) => {
              if (e.target?.result) {
                const base64 = e.target.result as string;
                try {
                  const url = await SaveAttachment(file.name, base64);
                  const { schema } = view.state;
                  const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                  if (coordinates) {
                    const node = schema.nodes.image.create({ src: url, alt: file.name });
                    const tr = view.state.tr.insert(coordinates.pos, node);
                    view.dispatch(tr);
                  }
                } catch (err) {
                  console.error("Failed to save attachment:", err);
                }
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event, slice) => {
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files[0]) {
          const file = event.clipboardData.files[0];
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async (e) => {
              if (e.target?.result) {
                const base64 = e.target.result as string;
                try {
                  const url = await SaveAttachment(file.name, base64);
                  const { schema } = view.state;
                  const node = schema.nodes.image.create({ src: url, alt: file.name });
                  const tr = view.state.tr.replaceSelectionWith(node);
                  view.dispatch(tr);
                } catch (err) {
                  console.error("Failed to save pasted attachment:", err);
                }
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      }
    },
    content: doc?.content || '',
    autofocus: 'end',
    onUpdate: ({ editor }) => {
      // Ensure there's always a paragraph after the last node if it's an image
      const { doc } = editor.state;
      const lastNode = doc.lastChild;
      if (lastNode && lastNode.type.name === 'image') {
        const endPos = doc.content.size;
        const p = editor.state.schema.nodes.paragraph.create();
        editor.chain().insertContentAt(endPos, p.toJSON()).run();
      }

      const markdown = (editor.storage as any).markdown.getMarkdown();


      
      // Update stats reactively
      setStats({
        words: editor.storage.characterCount.words(),
        chars: editor.storage.characterCount.characters(),
        paragraphs: editor.state.doc.childCount,
      });

      // Debounce saving
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        saveCurrentDocument(markdown);
      }, 800);
    },
  });

  useEffect(() => {
    if (editor) {
      setStats({
        words: editor.storage.characterCount.words(),
        chars: editor.storage.characterCount.characters(),
        paragraphs: editor.state.doc.childCount,
      });
    }
  }, [editor]);

  useEffect(() => {
    if (editor && doc && (editor.storage as any).markdown.getMarkdown() !== doc.content) {
      if (!editor.isFocused) {
        // Backward-compat: old documents were saved with unencoded spaces in
        // attachment URLs (e.g. ![alt](/attachments/my file.png)).
        // markdown-it only parses image URLs without spaces, so we encode
        // each path segment before passing the content to the parser.
        const normalized = doc.content.replace(
          /!\[([^\]]*)\]\(\/attachments\/([^)]+)\)/g,
          (_match, alt, rawPath) => {
            const encodedPath = rawPath
              .split('/')
              .map((seg: string) => encodeURIComponent(decodeURIComponent(seg)))
              .join('/');
            return `![${alt}](/attachments/${encodedPath})`;
          }
        );
        // tiptap-markdown overrides setContent to transparently parse markdown
        // — image nodes (![alt](url)) are handled correctly provided the URL
        // contains no unencoded spaces.
        editor.commands.setContent(normalized);
      }
    }
  }, [doc?.content, editor]);

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600">
        <p>No document selected. Cmd+K to search or create.</p>
      </div>
    );
  }

  if (doc.frontmatter?.is_vault && !vaultUnlocked) {
    return <VaultUnlockOverlay />;
  }

  return (
    <div className="h-full flex flex-col transition-all duration-500">
      {/*
        ── Sticky toolbar ───────────────────────────────────────────────────
        The toolbar lives OUTSIDE the scroll container so it never scrolls
        away. When the user scrolls past 8px the wrapper picks up a glassy
        backdrop (glassmorphism) and a soft shadow — giving it a "floating"
        feel aligned with the Antigravity Design principle: weightless UI
        elements that lift above the content as you navigate through it.
        All transitions run at 300ms ease-out to match the rest of the UI.
      */}
      {/* Toolbar wrapper — always transparent so only the pill stands out */}
      <div className="flex justify-center w-full px-16 pt-4 pb-2" style={{ zIndex: 10 }}>
        <div
          className="w-full max-w-4xl"
          style={{
            transition: 'box-shadow 300ms ease-out',
            boxShadow: scrolled
              ? '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)'
              : 'none',
            borderRadius: scrolled ? '12px' : undefined,
          }}
        >
          <Toolbar editor={editor} />
        </div>
      </div>

      {/* BubbleMenus render into portals – independent of scroll */}
      {editor && <BubbleMenu editor={editor} />}
      {editor && <ImageBubbleMenu editor={editor} />}

      {/* ── Scrollable content area ──────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="px-16 py-12 prose prose-slate dark:prose-invert max-w-4xl mx-auto focus:outline-none selection:bg-blue-100/50 dark:selection:bg-blue-900/30">
          <textarea
            ref={titleRef}
            rows={1}
            value={doc.frontmatter.title || ''}
            onChange={(e) => {
              updateDocumentTitle(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }}
            placeholder="Dê um título ao seu pensamento..."
            className="w-full mb-8 text-7xl font-extralight text-slate-900 dark:text-white outline-none bg-transparent border-none p-0 tracking-tighter placeholder:text-slate-100 dark:placeholder:text-slate-900 transition-all duration-500 resize-none overflow-hidden leading-tight"
          />
          <div className="font-light leading-relaxed text-lg">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}
