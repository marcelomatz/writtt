import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import { ListDocuments, UpdateMetadata, UnlockVault, UnlockVaultWithPIN, DeleteDocument } from '../../wailsjs/go/main/App';
import { models } from '../../wailsjs/go/models';
import { FileText, Eye, EyeOff, Lock, Plus, Shield, ShieldOff, X, Trash2 } from 'lucide-react';
import { useSecurityStore } from '../store/securityStore';
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

// ─────────────────────────────────────────────────────────────────────────────
// TagManager (inalterado)
// ─────────────────────────────────────────────────────────────────────────────

function TagManager({ doc, onRefresh }: { doc: models.SearchResult; onRefresh: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [newTag, setNewTag] = useState('');

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
    await UpdateMetadata(doc.id, (doc.tags || []).filter((t) => t !== tagToRemove), doc.is_vault).catch(console.error);
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
            title="Remover tag"
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
          onBlur={() => { setIsEditing(false); setNewTag(''); }}
          autoFocus
          className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md bg-white dark:bg-slate-800 border border-blue-500 outline-none w-20 text-slate-800 dark:text-slate-200"
          placeholder="NOVA TAG"
        />
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
          className="px-1.5 py-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          title="Adicionar tag"
        >
          <Plus className="w-3 h-3" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultPasswordModal — mini modal inline para confirmar remoção do cofre
// ─────────────────────────────────────────────────────────────────────────────

interface VaultPasswordModalProps {
  docTitle: string;
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
  mode?: 'remove' | 'open';
  isPIN?: boolean; // true = campo PIN numérico; false/undefined = senha
}

function VaultPasswordModal({ docTitle, onConfirm, onCancel, mode = 'remove', isPIN = false }: VaultPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleConfirm() {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err: any) {
      setError(isPIN ? 'PIN incorreto' : 'Senha incorreta');
      setShake(true);
      setPassword('');
      setTimeout(() => setShake(false), 620);
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          className={`pointer-events-auto w-80 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl transition-all ${shake ? 'animate-[shake_0.6s_ease]' : ''}`}
          style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          {/* Icon */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              {mode === 'open'
                ? <Lock className="w-5 h-5" style={{ color: 'var(--accent)' }} strokeWidth={1.5} />
                : <ShieldOff className="w-5 h-5" style={{ color: 'var(--accent)' }} strokeWidth={1.5} />}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {mode === 'open' ? 'Abrir documento do Cofre' : 'Remover do Cofre'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                "{docTitle}"
              </p>
            </div>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {mode === 'open'
              ? 'Este documento está protegido. Digite a senha do cofre para abrir.'
              : 'Para remover este documento do cofre, confirme sua senha. O conteúdo voltará para o workspace sem criptografia.'}
          </p>

          {/* Password / PIN field */}
          <div className="relative">
            <input
              ref={inputRef}
              type={showPw ? 'text' : 'password'}
              inputMode={isPIN ? 'numeric' : 'text'}
              maxLength={isPIN ? 8 : undefined}
              placeholder={isPIN ? 'PIN (4–8 dígitos)' : 'Senha do cofre'}
              value={password}
              onChange={(e) => { setPassword(isPIN ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm outline-none transition-all"
              style={{
                backgroundColor: 'var(--bg-base)',
                color: 'var(--text-primary)',
                border: `1px solid ${error ? 'var(--color-danger, #ef4444)' : 'var(--border-strong)'}`,
                letterSpacing: isPIN ? '0.3em' : undefined,
                textAlign: isPIN ? 'center' : undefined,
              }}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-center" style={{ color: 'var(--color-danger, #ef4444)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded-xl text-sm transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !password}
              className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                backgroundColor: loading || !password ? 'var(--bg-hover)' : 'var(--accent)',
                color: loading || !password ? 'var(--text-muted)' : '#fff',
                cursor: loading || !password ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Verificando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          15%{transform:translateX(-8px)}
          30%{transform:translateX(8px)}
          45%{transform:translateX(-6px)}
          60%{transform:translateX(6px)}
          75%{transform:translateX(-3px)}
          90%{transform:translateX(3px)}
        }
      `}</style>
    </>
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
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);

  const { setVaultUnlocked, vaultUnlocked, vaultPINEnabled } = useSecurityStore();
  const showModal = useModalStore((s) => s.show);

  // ── Mover para o Cofre (workspace → vault) ─────────────────────────────────
  async function handleSendToVault(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await UpdateMetadata(doc.id, doc.tags, true);
      onRefresh();
    } catch (err: any) {
      console.error(err);
    }
  }

  // ── Remover do Cofre (requer senha) ────────────────────────────────────────
  async function handleRemoveFromVault(password: string) {
    // Authenticate — UnlockVault returns true if password is correct
    const ok = await UnlockVault(password);
    if (!ok) throw new Error('wrong password');
    setVaultUnlocked(true);
    await UpdateMetadata(doc.id, doc.tags, false);
    setShowVaultModal(false);
    onRefresh();
  }

  // ── Abrir doc do cofre — usa PIN se disponível, senão senha ──
  async function handleOpenWithPassword(credential: string) {
    const ok = vaultPINEnabled
      ? await UnlockVaultWithPIN(credential)
      : await UnlockVault(credential);
    if (!ok) throw new Error(vaultPINEnabled ? 'wrong pin' : 'wrong password');
    setVaultUnlocked(true);
    setShowOpenModal(false);
    onOpen(doc.id);
  }

  // ── Deletar documento ──────────────────────────────────────────────────────
  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    showModal({
      type: 'confirm',
      title: 'Deletar documento',
      message: `"${doc.title}" será deletado permanentemente. Esta ação não pode ser desfeita.`,
      onConfirm: async () => {
        await DeleteDocument(doc.id).catch(console.error);
        onRefresh();
      },
    });
  }

  function handleCardClick() {
    // If this is a vault doc and the vault is not yet unlocked, ask for password first
    if (doc.is_vault && !vaultUnlocked) {
      setShowOpenModal(true);
    } else {
      onOpen(doc.id);
    }
  }

  return (
    <>
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
        {/* ── Hover action buttons (top-right) ── */}
        <div
          className="absolute top-4 right-4 flex items-center gap-1 transition-all duration-200"
          style={{ opacity: hovered ? 1 : 0, pointerEvents: hovered ? 'auto' : 'none' }}
        >
          {/* Vault toggle button */}
          {doc.is_vault ? (
            <button
              onClick={(e) => { e.stopPropagation(); setShowVaultModal(true); }}
              title="Remover do Cofre"
              className="p-1.5 rounded-lg transition-all duration-200 hover:scale-110"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--accent)',
              }}
            >
              <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          ) : (
            <button
              onClick={handleSendToVault}
              title="Enviar para o Cofre"
              className="p-1.5 rounded-lg transition-all duration-200 hover:scale-110"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <Shield className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}

          {/* Delete button */}
          <button
            onClick={handleDelete}
            title="Deletar documento"
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

        {/* ── Título ── */}
        <div className="mb-2 pr-8">
          <h3
            className="text-xl font-light line-clamp-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {doc.title}
          </h3>
        </div>

        <p
          className="text-sm font-light line-clamp-2 mb-4 leading-relaxed flex-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {doc.snippet || 'Sem notas adicionais…'}
        </p>

        <div
          className="flex flex-col pt-4 mt-auto gap-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <div className="w-full">
            <TagManager doc={doc} onRefresh={onRefresh} />
          </div>
          <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>
            Atualizado em{' '}
            {new Date(doc.updated_at).toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </span>
        </div>
      </div>

      {/* ── Modal de senha para remover do cofre ── */}
      {showVaultModal && (
        <VaultPasswordModal
          docTitle={doc.title}
          onConfirm={handleRemoveFromVault}
          onCancel={() => setShowVaultModal(false)}
          mode="remove"
        />
      )}

      {/* ── Modal de senha para abrir doc do cofre ── */}
      {showOpenModal && (
        <VaultPasswordModal
          docTitle={doc.title}
          onConfirm={handleOpenWithPassword}
          onCancel={() => setShowOpenModal(false)}
          mode="open"
          isPIN={vaultPINEnabled}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HomeScreen
// ─────────────────────────────────────────────────────────────────────────────

export function HomeScreen() {
  const { createDocument, loadDocument, setView, homeFilter, setHomeFilter, setDocsCount } =
    useEditorStore();

  const [docs, setDocs] = useState<models.SearchResult[]>([]);


  const fetchDocs = () => {
    ListDocuments(homeFilter, 50)
      .then((res) => {
        const results = res || [];
        setDocs(results);
        setDocsCount(results.length);
      })
      .catch((err) => console.error('Error listing documents:', err));
  };

  useEffect(() => { fetchDocs(); }, [homeFilter]);

  const handleOpen = (id: string) => {
    loadDocument(id);
    setView('editor');
  };


  const handleNew = () => {
    createDocument();
    setView('editor');
  };

  const navItems = [
    { id: 'recent', label: 'Recentes', icon: FileText },
    { id: 'protected', label: 'Protegidos', icon: Shield },
  ];

  const activeIndex = navItems.findIndex((item) => item.id === homeFilter);

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

            <nav
              className="relative grid p-1 rounded-xl border shadow-inner"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
              }}
            >
              <div
                className="absolute left-1 top-1 bottom-1 rounded-lg shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08),0_1px_4px_-1px_rgba(0,0,0,0.04)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-0"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  width: `calc((100% - 8px) / ${navItems.length})`,
                  transform: `translateX(calc(${activeIndex} * 100%))`,
                }}
              />
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setHomeFilter(item.id as any)}
                  className={`relative flex justify-center items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-10 font-medium ${homeFilter === item.id
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                  <item.icon
                    className={`w-4 h-4 transition-colors duration-500 ${homeFilter === item.id ? 'text-blue-500 dark:text-blue-400' : 'opacity-50'
                      }`}
                    strokeWidth={1.5}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] mb-4"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="w-8 h-[1px]" style={{ backgroundColor: 'var(--border)' }} />
            {navItems.find((i) => i.id === homeFilter)?.label || 'Workspace'}
          </div>
          <h2 className="text-5xl md:text-6xl font-extralight text-slate-900 dark:text-white tracking-tight leading-tight max-w-3xl">
            {homeFilter === 'recent' ? 'Continue de onde parou.' : 'Área restrita.'}
          </h2>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-16">
          {/* ── Botão Novo Documento ── */}
          {homeFilter === 'recent' && (
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
                Novo Documento
              </span>
              <span className="text-slate-400 dark:text-slate-500 text-sm mt-2 font-light text-center">
                Suas palavras são suas. Completamente.
              </span>
            </div>
          )}

          {/* ── Documentos ── */}
          {docs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onOpen={handleOpen}
              onRefresh={fetchDocs}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
