import { BubbleMenu as TipTapBubbleMenu, Editor } from '@tiptap/react';
import { Bold, Italic, Heading1, Heading2, Link as LinkIcon } from 'lucide-react';
import { useCallback } from 'react';
import { NodeSelection } from '@tiptap/pm/state';
import { useModalStore } from '../store/modalStore';

interface BubbleMenuProps {
  editor: Editor;
}

export function BubbleMenu({ editor }: BubbleMenuProps) {
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

  const buttons = [
    {
      icon: Bold,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
      label: 'Bold',
    },
    {
      icon: Italic,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
      label: 'Italic',
    },
    {
      icon: Heading1,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: editor.isActive('heading', { level: 1 }),
      label: 'H1',
    },
    {
      icon: Heading2,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor.isActive('heading', { level: 2 }),
      label: 'H2',
    },
    {
      icon: LinkIcon,
      action: setLink,
      isActive: editor.isActive('link'),
      label: 'Link',
    },
  ];

  return (
    <TipTapBubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100 }}
      shouldShow={({ state }) => {
        const { selection } = state;
        // Hide the text menu when an image node is selected
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
          return false;
        }
        // Only show when there is an actual text range selection
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
