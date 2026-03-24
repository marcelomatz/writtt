import { useEditorStore } from '../store/editorStore';
import { BrightnessControl } from './BrightnessControl';
import { ArrowLeft, Moon, Settings, Sun } from 'lucide-react';

export function StatusBar() {
  const { theme, setTheme, primaryDoc, stats, setView, view, docsCount } = useEditorStore();

  return (
    <div
      className="h-10 flex items-center justify-between px-6 text-[9px] uppercase tracking-[0.2em] font-medium select-none shrink-0 transition-colors dark:bg-[#020617] dark:border-slate-800/50 dark:text-slate-600"
      style={{
        borderTop: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-surface)',
        color: 'var(--text-muted)',
      }}
    >
      {/* ── Left side ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-8">
        {view === 'home' && (
          <span className="hidden sm:inline">{docsCount} DOCUMENTO{docsCount !== 1 ? 'S' : ''}</span>
        )}

        {view !== 'home' && (
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-2 hover:text-blue-500 dark:hover:text-blue-400 transition-all duration-300 group"
            title="Voltar para a tela inicial"
          >
            <ArrowLeft className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
            <span className="text-slate-500 dark:text-slate-400">INÍCIO</span>
          </button>
        )}

        {primaryDoc && view === 'editor' && (
          <div className="flex items-center gap-6 pl-8" style={{ borderLeft: '1px solid var(--border-subtle)' }}>
            <span className="hidden sm:inline max-w-[200px] truncate" title={primaryDoc.frontmatter?.title}>
              {primaryDoc.frontmatter?.title}
            </span>
            <span className="hidden sm:inline">{stats.words} PALAVRAS</span>
            <span className="hidden sm:inline">{stats.chars} CARACTERES</span>
          </div>
        )}
      </div>

      {/* ── Right side ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <BrightnessControl />

        <span style={{ width: '1px', height: '12px', backgroundColor: 'var(--border-subtle)', display: 'inline-block', flexShrink: 0 }} />

        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-1.5 rounded-lg transition-all dark:hover:bg-slate-900 dark:hover:text-slate-200 hover:text-slate-700"
          style={{ color: 'var(--text-muted)' }}
          title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
        >
          {theme === 'light'
            ? <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />
            : <Sun  className="w-3.5 h-3.5" strokeWidth={1.5} />}
        </button>

        <button
          onClick={() => setView('settings')}
          className="p-1.5 rounded-lg transition-all dark:hover:bg-slate-900 dark:hover:text-slate-200 hover:text-slate-700"
          style={{ color: 'var(--text-muted)' }}
          title="Configurações"
        >
          <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
