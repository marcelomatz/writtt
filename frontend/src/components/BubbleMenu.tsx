import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { BubbleMenu as TipTapBubbleMenu } from '@tiptap/react/menus';
import { Bold, Heading1, Heading2, Italic, Link as LinkIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useModalStore } from '../store/modalStore';

const dict = {
  pt: {
    add_link: 'Adicionar Link',
    enter_link_url: 'Insira a URL do link:',
    bold: 'Negrito',
    italic: 'Itálico',
    heading1: 'Título 1',
    heading2: 'Título 2',
    link: 'Link',
  },
  en: {
    add_link: 'Add Link',
    enter_link_url: 'Enter link URL:',
    bold: 'Bold',
    italic: 'Italic',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    link: 'Link',
  },
};

export interface BubbleMenuProps {
  editor: Editor;
}

export function BubbleMenu({ editor }: BubbleMenuProps) {
  const t = useTranslation(dict);

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;

    useModalStore.getState().show({
      type: 'prompt',
      title: t.add_link,
      message: t.enter_link_url,
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

  const buttons = [
    {
      icon: Bold,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
      label: t.bold,
    },
    {
      icon: Italic,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
      label: t.italic,
    },
    {
      icon: Heading1,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: editor.isActive('heading', { level: 1 }),
      label: t.heading1,
    },
    {
      icon: Heading2,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor.isActive('heading', { level: 2 }),
      label: t.heading2,
    },
    {
      icon: LinkIcon,
      action: setLink,
      isActive: editor.isActive('link'),
      label: t.link,
    },
  ];

  return (
    <TipTapBubbleMenu
      editor={editor}
      shouldShow={({ state }: any) => {
        const { selection } = state;
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
          return false;
        }
        return !selection.empty;
      }}
    >
      <div
        className="flex items-center gap-1 p-1 dark:bg-slate-800 dark:border-slate-700 rounded-lg shadow-lg border"
        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
        {buttons.map((btn, i) => (
          <button
            key={i}
            onClick={btn.action}
            className={`p-1.5 rounded-md transition-all duration-300 ${
              btn.isActive
                ? 'bg-slate-900 dark:bg-blue-600 text-white'
                : 'dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-700 hover:text-slate-700'
            }`}
            style={!btn.isActive ? { color: 'var(--text-secondary)' } : {}}
            title={btn.label}
          >
            <btn.icon className="w-4 h-4" strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </TipTapBubbleMenu>
  );
}
