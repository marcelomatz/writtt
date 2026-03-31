import { ArrowLeft, Moon, Settings, Sun } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';
import { BrightnessControl } from './BrightnessControl';

const dict = {
  pt: {
    docs_plural: ' DOCUMENTOS',
    docs_singular: ' DOCUMENTO',
    btn_home: 'INÍCIO',
    title_home: 'Voltar para a tela inicial',
    stat_words: ' PALAVRAS',
    stat_chars: ' CARACTERES',
    title_dark_mode: 'Modo escuro',
    title_light_mode: 'Modo claro',
    title_settings: 'Configurações',
  },
  en: {
    docs_plural: ' DOCUMENTS',
    docs_singular: ' DOCUMENT',
    btn_home: 'HOME',
    title_home: 'Back to home screen',
    stat_words: ' WORDS',
    stat_chars: ' CHARS',
    title_dark_mode: 'Dark mode',
    title_light_mode: 'Light mode',
    title_settings: 'Settings',
  },
};

export function StatusBar() {
  const { theme, setTheme, primaryDoc, stats, setView, view, docsCount } = useEditorStore();
  const t = useTranslation(dict);

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
          <span className="hidden sm:inline">
            {docsCount}
            {docsCount !== 1 ? t.docs_plural : t.docs_singular}
          </span>
        )}

        {view !== 'home' && (
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-2 hover:text-blue-500 dark:hover:text-blue-400 transition-all duration-300 group"
            title={t.title_home}
          >
            <ArrowLeft
              className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity"
              strokeWidth={1.5}
            />
            <span className="text-slate-500 dark:text-slate-400">{t.btn_home}</span>
          </button>
        )}

        {primaryDoc && view === 'editor' && (
          <div
            className="flex items-center gap-6 pl-8"
            style={{ borderLeft: '1px solid var(--border-subtle)' }}
          >
            <span
              className="hidden sm:inline max-w-[200px] truncate"
              title={primaryDoc.frontmatter?.title}
            >
              {primaryDoc.frontmatter?.title}
            </span>
            <span className="hidden sm:inline">
              {stats.words}
              {t.stat_words}
            </span>
            <span className="hidden sm:inline">
              {stats.chars}
              {t.stat_chars}
            </span>
          </div>
        )}
      </div>

      {/* ── Right side ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <BrightnessControl />

        <span
          style={{
            width: '1px',
            height: '12px',
            backgroundColor: 'var(--border-subtle)',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />

        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-1.5 rounded-lg transition-all dark:hover:bg-slate-900 dark:hover:text-slate-200 hover:text-slate-700"
          style={{ color: 'var(--text-muted)' }}
          title={theme === 'light' ? t.title_dark_mode : t.title_light_mode}
        >
          {theme === 'light' ? (
            <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <Sun className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
        </button>

        <button
          onClick={() => setView('settings')}
          className="p-1.5 rounded-lg transition-all dark:hover:bg-slate-900 dark:hover:text-slate-200 hover:text-slate-700"
          style={{ color: 'var(--text-muted)' }}
          title={t.title_settings}
        >
          <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
