import { BubbleMenu, Editor } from '@tiptap/react';
import { AlignLeft, AlignCenter, AlignRight, Trash2, MessageSquare } from 'lucide-react';
import { useModalStore } from '../store/modalStore';
import { useCallback } from 'react';
import { NodeSelection } from '@tiptap/pm/state';

interface ImageBubbleMenuProps {
  editor: Editor;
}

export function ImageBubbleMenu({ editor }: ImageBubbleMenuProps) {
  const setCaption = useCallback(() => {
    const current = editor.getAttributes('image')['data-caption'] ?? '';
    useModalStore.getState().show({
      type: 'prompt',
      title: 'Legenda da imagem',
      message: 'Adicione uma legenda, referência ou observação:',
      placeholder: 'Ex: Vista aérea do centro histórico...',
      initialValue: current,
      onConfirm: (caption) => {
        editor.chain().focus().updateAttributes('image', { 'data-caption': caption ?? '' }).run();
      },
    });
  }, [editor]);

  const alignButtons = [
    {
      icon: AlignLeft,
      action: () => editor.chain().focus().updateAttributes('image', { 'data-align': 'left' }).run(),
      isActive: editor.isActive('image', { 'data-align': 'left' }),
      label: 'Alinhar à esquerda',
    },
    {
      icon: AlignCenter,
      action: () => editor.chain().focus().updateAttributes('image', { 'data-align': 'center' }).run(),
      isActive: editor.isActive('image', { 'data-align': 'center' }),
      label: 'Centralizar',
    },
    {
      icon: AlignRight,
      action: () => editor.chain().focus().updateAttributes('image', { 'data-align': 'right' }).run(),
      isActive: editor.isActive('image', { 'data-align': 'right' }),
      label: 'Alinhar à direita',
    },
  ];

  const hasCaption = !!(editor.getAttributes('image')['data-caption']);

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageBubbleMenu"
      shouldShow={({ state }) => {
        const { selection } = state;
        return selection instanceof NodeSelection && selection.node.type.name === 'image';
      }}
      tippyOptions={{ duration: 100, appendTo: () => document.body, zIndex: 40 }}
    >
      <div
        className="flex items-center gap-1 p-1 rounded-lg shadow-lg border"
        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
        {/* Alignment buttons */}
        {alignButtons.map((btn, i) => (
          <button
            key={i}
            onClick={btn.action}
            className={`p-1.5 rounded-md transition-all duration-300 ${
              btn.isActive
                ? 'bg-slate-900 dark:bg-blue-600 text-white'
                : 'dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 dark:hover:bg-slate-700'
            }`}
            style={!btn.isActive ? { color: 'var(--text-secondary)' } : {}}
            title={btn.label}
          >
            <btn.icon className="w-4 h-4" strokeWidth={1.5} />
          </button>
        ))}

        <div className="h-4 w-px mx-1" style={{ backgroundColor: 'var(--border-subtle)' }} />

        {/* Caption button */}
        <button
          onClick={setCaption}
          className={`p-1.5 rounded-md transition-all duration-300 ${
            hasCaption
              ? 'bg-slate-900 dark:bg-blue-600 text-white'
              : 'dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 dark:hover:bg-slate-700'
          }`}
          style={!hasCaption ? { color: 'var(--text-secondary)' } : {}}
          title={hasCaption ? 'Editar legenda' : 'Adicionar legenda'}
        >
          <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
        </button>

        <div className="h-4 w-px mx-1" style={{ backgroundColor: 'var(--border-subtle)' }} />

        {/* Delete button */}
        <button
          onClick={() => editor.chain().focus().deleteSelection().run()}
          className="p-1.5 rounded-md text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-300"
          title="Remover imagem"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </BubbleMenu>
  );
}
