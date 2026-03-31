import type { Editor, Range } from '@tiptap/core';
import {
  CheckSquare,
  Code,
  Grid3X3,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  List,
  ListOrdered,
  Minus,
  Pencil,
  Quote,
  Type,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

interface SlashMenuItem {
  title: string;
  description: string;
  icon: React.ElementType;
  command: (args: { editor: Editor; range: Range }) => void;
}

export function getSlashItems(lang: 'pt' | 'en' = 'pt'): SlashMenuItem[] {
  const labels: Record<string, [string, string]> = lang === 'pt' ? {
    h1: ['Título 1', 'Título grande'],
    h2: ['Título 2', 'Título médio'],
    h3: ['Título 3', 'Título pequeno'],
    text: ['Texto', 'Parágrafo simples'],
    ul: ['Lista', 'Lista com marcadores'],
    ol: ['Lista Numerada', 'Lista em sequência'],
    task: ['Lista de Tarefas', 'Checkboxes interativos'],
    code: ['Bloco de Código', 'Código com syntax highlight'],
    quote: ['Citação', 'Bloco de citação'],
    hr: ['Linha Horizontal', 'Separador visual'],
    table: ['Tabela', 'Tabela 3×3'],
    draw: ['Desenho', 'Canvas para desenho livre'],
    hl: ['Realçar', 'Destacar texto selecionado'],
  } : {
    h1: ['Heading 1', 'Large heading'],
    h2: ['Heading 2', 'Medium heading'],
    h3: ['Heading 3', 'Small heading'],
    text: ['Text', 'Plain paragraph'],
    ul: ['Bullet List', 'Unordered list'],
    ol: ['Ordered List', 'Numbered sequence'],
    task: ['Task List', 'Interactive checkboxes'],
    code: ['Code Block', 'Code with syntax highlighting'],
    quote: ['Quote', 'Block quotation'],
    hr: ['Horizontal Rule', 'Visual divider'],
    table: ['Table', '3×3 table'],
    draw: ['Drawing', 'Freehand drawing canvas'],
    hl: ['Highlight', 'Highlight selected text'],
  };

  return [
    {
      title: labels.h1[0], description: labels.h1[1], icon: Heading1,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(); },
    },
    {
      title: labels.h2[0], description: labels.h2[1], icon: Heading2,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(); },
    },
    {
      title: labels.h3[0], description: labels.h3[1], icon: Heading3,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(); },
    },
    {
      title: labels.text[0], description: labels.text[1], icon: Type,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setParagraph().run(); },
    },
    {
      title: labels.ul[0], description: labels.ul[1], icon: List,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleBulletList().run(); },
    },
    {
      title: labels.ol[0], description: labels.ol[1], icon: ListOrdered,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleOrderedList().run(); },
    },
    {
      title: labels.task[0], description: labels.task[1], icon: CheckSquare,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleTaskList().run(); },
    },
    {
      title: labels.code[0], description: labels.code[1], icon: Code,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleCodeBlock().run(); },
    },
    {
      title: labels.quote[0], description: labels.quote[1], icon: Quote,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleBlockquote().run(); },
    },
    {
      title: labels.hr[0], description: labels.hr[1], icon: Minus,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setHorizontalRule().run(); },
    },
    {
      title: labels.table[0], description: labels.table[1], icon: Grid3X3,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      title: labels.draw[0], description: labels.draw[1], icon: Pencil,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        (editor.commands as any).insertDrawing();
      },
    },
    {
      title: labels.hl[0], description: labels.hl[1], icon: Highlighter,
      command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleHighlight().run(); },
    },
  ];
}

export const SlashCommandList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  { items: SlashMenuItem[]; command: (item: SlashMenuItem) => void }
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectItem = useCallback(
    (index: number) => {
      const item = props.items[index];
      if (item) props.command(item);
    },
    [props],
  );

  useEffect(() => setSelectedIndex(0), [props.items]);

  useEffect(() => {
    const el = containerRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i <= 0 ? props.items.length - 1 : i - 1));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i >= props.items.length - 1 ? 0 : i + 1));
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="slash-menu">
        <div style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Nenhum resultado
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="slash-menu">
      {props.items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={`slash-menu-item ${index === selectedIndex ? 'active' : ''}`}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div className="slash-menu-icon">
            <item.icon className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="slash-menu-text">
            <span className="slash-menu-title">{item.title}</span>
            <span className="slash-menu-desc">{item.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
});

SlashCommandList.displayName = 'SlashCommandList';
