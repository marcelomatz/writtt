import type { Editor } from '@tiptap/react';
import { BubbleMenu as TipTapBubbleMenu } from '@tiptap/react/menus';
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Columns2,
  Merge,
  Rows2,
  Split,
  Trash2,
} from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

const dict = {
  pt: {
    add_col_before: 'Coluna antes',
    add_col_after: 'Coluna depois',
    add_row_before: 'Linha acima',
    add_row_after: 'Linha abaixo',
    del_col: 'Remover coluna',
    del_row: 'Remover linha',
    merge: 'Mesclar células',
    split: 'Dividir célula',
    del_table: 'Excluir tabela',
  },
  en: {
    add_col_before: 'Column before',
    add_col_after: 'Column after',
    add_row_before: 'Row above',
    add_row_after: 'Row below',
    del_col: 'Delete column',
    del_row: 'Delete row',
    merge: 'Merge cells',
    split: 'Split cell',
    del_table: 'Delete table',
  },
};

export function TableBubbleMenu({ editor }: { editor: Editor }) {
  const t = useTranslation(dict);

  const actions = [
    {
      icon: ArrowLeftToLine,
      action: () => editor.chain().focus().addColumnBefore().run(),
      label: t.add_col_before,
    },
    {
      icon: ArrowRightToLine,
      action: () => editor.chain().focus().addColumnAfter().run(),
      label: t.add_col_after,
    },
    {
      icon: ArrowUpToLine,
      action: () => editor.chain().focus().addRowBefore().run(),
      label: t.add_row_before,
    },
    {
      icon: ArrowDownToLine,
      action: () => editor.chain().focus().addRowAfter().run(),
      label: t.add_row_after,
    },
    {
      icon: Columns2,
      action: () => editor.chain().focus().deleteColumn().run(),
      label: t.del_col,
      danger: true,
    },
    {
      icon: Rows2,
      action: () => editor.chain().focus().deleteRow().run(),
      label: t.del_row,
      danger: true,
    },
    {
      icon: Merge,
      action: () => editor.chain().focus().mergeCells().run(),
      label: t.merge,
    },
    {
      icon: Split,
      action: () => editor.chain().focus().splitCell().run(),
      label: t.split,
    },
    {
      icon: Trash2,
      action: () => editor.chain().focus().deleteTable().run(),
      label: t.del_table,
      danger: true,
    },
  ];

  return (
    <TipTapBubbleMenu
      editor={editor}
      shouldShow={() => editor.isActive('table')}
    >
      <div
        className="flex items-center gap-0.5 p-1 rounded-lg shadow-lg border"
        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
        {actions.map((btn, i) => (
          <button
            key={i}
            onClick={btn.action}
            className="p-1.5 rounded-md transition-all duration-200 hover:scale-105"
            style={{
              color: btn.danger ? '#ef4444' : 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-surface)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
            title={btn.label}
          >
            <btn.icon className="w-4 h-4" strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </TipTapBubbleMenu>
  );
}
