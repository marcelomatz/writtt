import { FileText, Plus, Trash2, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { DeleteDocument, ListDocuments, UpdateMetadata } from '../../wailsjs/go/main/App';
import type { models } from '../../wailsjs/go/models';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';
import { useModalStore } from '../store/modalStore';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const tagColors = [
  'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400',
  'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
  'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400',
  'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400',
  'bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400',
  'bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400',
  'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400',
  'bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400',
  'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400',
];

function getTagColorClass(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return tagColors[Math.abs(hash) % tagColors.length];
}

const dict = {
  pt: {
    remove_tag: 'Remover tag',
    new_tag_placeholder: 'NOVA TAG',
    add_tag: 'Adicionar tag',
    delete_doc_title: 'Deletar documento',
    delete_doc_msg: '"{title}" será deletado permanentemente. Esta ação não pode ser desfeita.',
    updated_at: 'Atualizado em',
    workspace_sec: 'Workspace Secundizado',
    hero_title: 'Seus documentos.\nÁrea restrita.',
    new_doc: 'Novo Documento',
    new_doc_desc: 'Suas palavras são suas. Completamente.',
  },
  en: {
    remove_tag: 'Remove tag',
    new_tag_placeholder: 'NEW TAG',
    add_tag: 'Add tag',
    delete_doc_title: 'Delete document',
    delete_doc_msg: '"{title}" will be permanently deleted. This action cannot be undone.',
    updated_at: 'Updated at',
    workspace_sec: 'Secured Workspace',
    hero_title: 'Your documents.\nRestricted area.',
    new_doc: 'New Document',
    new_doc_desc: 'Your words are yours. Completely.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TagManager (inalterado)
// ─────────────────────────────────────────────────────────────────────────────

function TagManager({ doc, onRefresh }: { doc: models.SearchResult; onRefresh: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [newTag, setNewTag] = useState('');
  const t = useTranslation(dict);

  const handleAddTag = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.preventDefault();
      const tag = newTag.trim();
      if (tag && !(doc.tags || []).includes(tag)) {
        await UpdateMetadata(doc.id, [...(doc.tags || []), tag], doc.is_vault).catch(console.error);
        onRefresh();
      }
      setNewTag('');
      setIsEditing(false);
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      setNewTag('');
      setIsEditing(false);
    }
  };

  const handleRemoveTag = async (e: React.MouseEvent, tagToRemove: string) => {
    e.stopPropagation();
    await UpdateMetadata(
      doc.id,
      (doc.tags || []).filter((t) => t !== tagToRemove),
      doc.is_vault
    ).catch(console.error);
    onRefresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {(doc.tags || []).map((tag) => (
        <span
          key={tag}
          className={`group/tag flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md ${getTagColorClass(tag)}`}
        >
          {tag}
          <button
            onClick={(e) => handleRemoveTag(e, tag)}
            className="hidden group-hover/tag:flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 rounded-full w-3 h-3"
            title={t.remove_tag}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}

      {isEditing ? (
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleAddTag}
          onBlur={() => {
            setIsEditing(false);
            setNewTag('');
          }}
          autoFocus
          className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md bg-white dark:bg-slate-800 border border-blue-500 outline-none w-20 text-slate-800 dark:text-slate-200"
          placeholder={t.new_tag_placeholder}
        />
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="px-1.5 py-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          title={t.add_tag}
        >
          <Plus className="w-3 h-3" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DocCard — card individual com hover actions
// ─────────────────────────────────────────────────────────────────────────────

interface DocCardProps {
  doc: models.SearchResult;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}

function DocCard({ doc, onOpen, onRefresh }: DocCardProps) {
  const [hovered, setHovered] = useState(false);
  const showModal = useModalStore((s) => s.show);
  const t = useTranslation(dict);

  // ── Deletar documento ──────────────────────────────────────────────────────
  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    showModal({
      type: 'confirm',
      title: t.delete_doc_title,
      message: t.delete_doc_msg.replace('{title}', doc.title || ''),
      onConfirm: async () => {
        await DeleteDocument(doc.id).catch(console.error);
        onRefresh();
      },
    });
  }

  function handleCardClick() {
    onOpen(doc.id);
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleCardClick}
      className="relative flex flex-col p-6 border rounded-2xl transition-all duration-300 cursor-pointer min-h-[200px]"
      style={{
        backgroundColor: hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        borderColor: hovered ? 'var(--border)' : 'var(--border-subtle)',
        boxShadow: hovered ? '0 0 15px rgba(0,0,0,0.04)' : '',
      }}
    >
      <div
        className="absolute top-4 right-4 flex items-center gap-1 transition-all duration-200"
        style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none' }}
      >
        <button
          onClick={handleDelete}
          title={t.delete_doc_title}
          className="p-1.5 rounded-lg transition-all duration-200 hover:scale-110"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="mb-2 pr-8">
        <h3 className="text-xl font-light line-clamp-2" style={{ color: 'var(--text-primary)' }}>
          {doc.title}
        </h3>
      </div>

      <div
        className="flex flex-col pt-4 mt-auto gap-3"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <div className="w-full">
          <TagManager doc={doc} onRefresh={onRefresh} />
        </div>
        <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>
          {t.updated_at}{' '}
          {new Date(doc.updated_at).toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HomeScreen
// ─────────────────────────────────────────────────────────────────────────────

export function HomeScreen() {
  const { createDocument, openDocument, setView, homeFilter, setDocsCount } = useEditorStore();

  const [docs, setDocs] = useState<models.SearchResult[]>([]);
  const t = useTranslation(dict);

  const fetchDocs = () => {
    ListDocuments(homeFilter, 50)
      .then((res) => {
        const results = res || [];
        setDocs(results);
        setDocsCount(results.length);
      })
      .catch((err) => console.error('Error listing documents:', err));
  };

  useEffect(() => {
    fetchDocs();
  }, [homeFilter]);

  const handleOpen = (id: string) => {
    openDocument(id);
  };

  const handleNew = () => {
    createDocument();
    setView('editor');
  };

  return (
    <div
      className="h-full w-full flex flex-col overflow-y-auto custom-scrollbar font-light transition-colors duration-500"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      <div className="w-full max-w-6xl mx-auto px-8 py-16 flex flex-col min-h-full">
        <header className="mb-16">
          <div className="flex justify-between items-center mb-16">
            <div>
              <h1 className="text-3xl logo-font text-slate-900 dark:text-white">Writtt.</h1>
            </div>
          </div>

          <div
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] mb-4"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="w-8 h-[1px]" style={{ backgroundColor: 'var(--border)' }} />
            {t.workspace_sec}
          </div>
          <h2 className="text-5xl md:text-6xl font-extralight text-slate-900 dark:text-white tracking-tight leading-tight max-w-3xl whitespace-pre-line">
            {t.hero_title}
          </h2>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-16">
          {/* ── Botão Novo Documento ── */}
          <div
            onClick={handleNew}
            className="group flex flex-col items-center justify-center p-6 backdrop-blur-sm border-2 border-dashed rounded-2xl transition-all duration-500 cursor-pointer min-h-[200px] dark:border-slate-700/50 dark:hover:border-blue-500 dark:bg-slate-900/20 dark:hover:bg-slate-900/40 hover:border-blue-500"
            style={{ backgroundColor: 'transparent', borderColor: 'var(--border)' }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all duration-500 backdrop-blur-sm"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              <Plus className="w-6 h-6" strokeWidth={1.5} />
            </div>
            <span className="text-slate-600 dark:text-slate-300 font-medium text-lg">
              {t.new_doc}
            </span>
            <span className="text-slate-400 dark:text-slate-500 text-sm mt-2 font-light text-center">
              {t.new_doc_desc}
            </span>
          </div>

          {/* ── Documentos ── */}
          {docs.map((doc) => (
            <DocCard key={doc.id} doc={doc} onOpen={handleOpen} onRefresh={fetchDocs} />
          ))}
        </div>
      </div>
    </div>
  );
}
