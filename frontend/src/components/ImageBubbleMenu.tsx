import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { AlignCenter, AlignLeft, AlignRight, MessageSquare, Trash2 } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useModalStore } from '../store/modalStore';

const dict = {
  pt: {
    caption_title: 'Legenda da imagem',
    caption_msg: 'Adicione uma legenda, referência ou observação:',
    caption_placeholder: 'Ex: Vista aérea do centro histórico...',
    align_left: 'Alinhar à esquerda',
    align_center: 'Centralizar',
    align_right: 'Alinhar à direita',
    edit_caption: 'Editar legenda',
    add_caption: 'Adicionar legenda',
    remove_image: 'Remover imagem',
  },
  en: {
    caption_title: 'Image caption',
    caption_msg: 'Add a caption, reference, or note:',
    caption_placeholder: 'Ex: Aerial view of the historic center...',
    align_left: 'Align left',
    align_center: 'Center',
    align_right: 'Align right',
    edit_caption: 'Edit caption',
    add_caption: 'Add caption',
    remove_image: 'Remove image',
  },
};

export interface ImageBubbleMenuProps {
  editor: Editor;
}

export function ImageBubbleMenu({ editor }: ImageBubbleMenuProps) {
  const t = useTranslation(dict);

  const setCaption = useCallback(() => {
    const current = editor.getAttributes('image')['data-caption'] ?? '';
    useModalStore.getState().show({
      type: 'prompt',
      title: t.caption_title,
      message: t.caption_msg,
      placeholder: t.caption_placeholder,
      initialValue: current,
      onConfirm: (caption) => {
        editor
          .chain()
          .focus()
          .updateAttributes('image', { 'data-caption': caption ?? '' })
          .run();
      },
    });
  }, [editor, t]);

  const alignButtons = [
    {
      icon: AlignLeft,
      action: () =>
        editor.chain().focus().updateAttributes('image', { 'data-align': 'left' }).run(),
      isActive: editor.isActive('image', { 'data-align': 'left' }),
      label: t.align_left,
    },
    {
      icon: AlignCenter,
      action: () =>
        editor.chain().focus().updateAttributes('image', { 'data-align': 'center' }).run(),
      isActive: editor.isActive('image', { 'data-align': 'center' }),
      label: t.align_center,
    },
    {
      icon: AlignRight,
      action: () =>
        editor.chain().focus().updateAttributes('image', { 'data-align': 'right' }).run(),
      isActive: editor.isActive('image', { 'data-align': 'right' }),
      label: t.align_right,
    },
  ];

  const hasCaption = !!editor.getAttributes('image')['data-caption'];

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageBubbleMenu"
      shouldShow={({ state }: any) => {
        const { selection } = state;
        return selection instanceof NodeSelection && selection.node.type.name === 'image';
      }}
    >
      <div
        className="flex items-center gap-1 p-1 rounded-lg shadow-lg border"
        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
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

        <button
          onClick={setCaption}
          className={`p-1.5 rounded-md transition-all duration-300 ${
            hasCaption
              ? 'bg-slate-900 dark:bg-blue-600 text-white'
              : 'dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 dark:hover:bg-slate-700'
          }`}
          style={!hasCaption ? { color: 'var(--text-secondary)' } : {}}
          title={hasCaption ? t.edit_caption : t.add_caption}
        >
          <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
        </button>

        <div className="h-4 w-px mx-1" style={{ backgroundColor: 'var(--border-subtle)' }} />

        <button
          onClick={() => editor.chain().focus().deleteSelection().run()}
          className="p-1.5 rounded-md text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-300"
          title={t.remove_image}
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </BubbleMenu>
  );
}
