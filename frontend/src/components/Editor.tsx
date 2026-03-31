import BubbleMenuExtension from '@tiptap/extension-bubble-menu';
import CharacterCount from '@tiptap/extension-character-count';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Focus from '@tiptap/extension-focus';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';
import { all, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { SaveAttachment } from '../../wailsjs/go/main/App';
import { CustomDictionary } from '../extensions/CustomDictionary';
import { Drawing } from '../extensions/DrawingExtension';
import { createSlashCommand } from '../extensions/SlashCommand';
import { CodeBlockNodeView } from './CodeBlockNodeView';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';
import { useSecurityStore } from '../store/securityStore';
import { BubbleMenu } from './BubbleMenu';
import { ChapterNavigator } from './ChapterNavigator';
import { EditorContextMenu } from './EditorContextMenu';
import { ImageBubbleMenu } from './ImageBubbleMenu';
import { ImageNodeView } from './ImageNodeView';
import { TableBubbleMenu } from './TableBubbleMenu';
import { Toolbar } from './Toolbar';
import { VaultUnlockOverlay } from './VaultUnlockOverlay';

const dict = {
  pt: {
    placeholder_body: 'Comece a pensar aqui...',
    no_document: 'No document selected. Cmd+K to search or create.',
    placeholder_title: 'Dê um título ao seu pensamento...',
  },
  en: {
    placeholder_body: 'Start thinking here...',
    no_document: 'No document selected. Cmd+K to search or create.',
    placeholder_title: 'Give your thought a title...',
  },
};

export function Editor() {
  const t = useTranslation(dict);
  const { primaryDoc, saveCurrentDocument, setStats, updateDocumentTitle, sessionCreatedDocId } = useEditorStore();

  const doc = primaryDoc;
  const { vaultUnlocked } = useSecurityStore();
  const showChapters = useEditorStore((s) => s.showChapters);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const [scrolled, setScrolled] = useState(false);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolled(el.scrollTop > 8);
  };

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
        codeBlock: false,
        link: false,
        underline: false,
      }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockNodeView);
        },
      }).configure({
        lowlight: createLowlight(all),
        defaultLanguage: 'plaintext',
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
                  'data-caption':
                    (el as HTMLImageElement).getAttribute('data-caption') ??
                    (el as HTMLImageElement).getAttribute('title') ??
                    '',
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
        placeholder: t.placeholder_body,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({
        table: { resizable: true },
      }),
      Highlight,
      Underline,
      Drawing,
      CustomDictionary,
      createSlashCommand((document.documentElement.lang || 'pt') as 'pt' | 'en'),
      BubbleMenuExtension,
    ],
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[500px]',
      },
      handleDrop: (view, event, slice, moved) => {
        if (
          !moved &&
          event.dataTransfer &&
          event.dataTransfer.files &&
          event.dataTransfer.files[0]
        ) {
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
                  console.error('Failed to save attachment:', err);
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
                  console.error('Failed to save pasted attachment:', err);
                }
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
    content: doc?.content || '',
    autofocus: 'end',
    onUpdate: ({ editor }) => {
      const { doc } = editor.state;
      const lastNode = doc.lastChild;
      if (lastNode && lastNode.type.name === 'image') {
        const endPos = doc.content.size;
        const p = editor.state.schema.nodes.paragraph.create();
        editor.chain().insertContentAt(endPos, p.toJSON()).run();
      }

      setStats({
        words: editor.storage.characterCount.words(),
        chars: editor.storage.characterCount.characters(),
        paragraphs: editor.state.doc.childCount,
      });

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const markdown = (editor.storage as any).markdown.getMarkdown();
        useEditorStore.getState().updateDocumentContent(markdown);
        saveCurrentDocument(markdown);
      }, 1500);
    },
  });

  useEffect(() => {
    if (editor) {
      setStats({
        words: editor.storage.characterCount.words(),
        chars: editor.storage.characterCount.characters(),
        paragraphs: editor.state.doc.childCount,
      });
      // Force an initial update of the content on load so we have the latest immediately
      const initialMarkdown = (editor.storage as any).markdown.getMarkdown();
      useEditorStore.getState().updateDocumentContent(initialMarkdown);
    }
  }, [editor]);

  const currentDocId = useRef(doc?.frontmatter?.id);

  useEffect(() => {
    if (!editor || !doc) return;

    const normalized = (doc.content || '').replace(
      /!\[([^\]]*)\]\(\/attachments\/([^)]+)\)/g,
      (_match, alt, rawPath) => {
        const encodedPath = rawPath
          .split('/')
          .map((seg: string) => encodeURIComponent(decodeURIComponent(seg)))
          .join('/');
        return `![${alt}](/attachments/${encodedPath})`;
      }
    );

    if (doc.frontmatter?.id !== currentDocId.current) {
      currentDocId.current = doc.frontmatter?.id;
      editor.commands.setContent(normalized);
      return;
    }

    if ((editor.storage as any).markdown.getMarkdown() !== doc.content) {
      if (!editor.isFocused) {
        const currentSelection = editor.state.selection;
        editor.commands.setContent(normalized);
        editor.commands.setTextSelection(currentSelection);
      }
    }
  }, [doc?.content, doc?.frontmatter?.id, editor]);

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600">
        <p>{t.no_document}</p>
      </div>
    );
  }

  const isSessionCreated =
    !doc.frontmatter?.id || sessionCreatedDocId === doc.frontmatter?.id || sessionCreatedDocId === 'pending';

  if (doc.frontmatter?.is_vault && !vaultUnlocked && !isSessionCreated) {
    return <VaultUnlockOverlay />;
  }

  return (
    <div className="h-full flex flex-col transition-all duration-500">
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

      {editor && <BubbleMenu editor={editor} />}
      {editor && <ImageBubbleMenu editor={editor} />}
      {editor && <TableBubbleMenu editor={editor} />}
      <EditorContextMenu editor={editor} />

      <div className="flex flex-1 overflow-hidden">
        <ChapterNavigator editor={editor} visible={showChapters} />

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
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
            placeholder={t.placeholder_title}
            className="w-full mb-8 text-5xl md:text-6xl font-extralight text-slate-900 dark:text-white outline-none bg-transparent border-none p-0 tracking-tight placeholder:text-slate-200 dark:placeholder:text-slate-800 transition-all duration-500 resize-none overflow-hidden leading-tight break-words whitespace-pre-wrap"
          />
          <div className="font-light leading-relaxed text-lg">
            <EditorContent editor={editor} />
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
