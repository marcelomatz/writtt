import { Command } from 'cmdk';
import { FileText, Plus, Search as SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ListDocuments, Search as SearchCmd } from '../../wailsjs/go/main/App';
import type { models } from '../../wailsjs/go/models';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';

const dict = {
  pt: {
    placeholder: 'Buscar documentos ou criar novo...',
    empty_state_text: 'Busca Inteligente Writtt',
    docs_group: 'Seus Documentos',
    create_new: 'Criar novo: "{query}"',
    recent: 'Recentes',
    no_results: 'Nenhum resultado encontrado.',
  },
  en: {
    placeholder: 'Search documents or create new...',
    empty_state_text: 'Writtt Smart Search',
    docs_group: 'Your Documents',
    create_new: 'Create new: "{query}"',
    recent: 'Recent',
    no_results: 'No results found.',
  },
};

export function CommandPalette() {
  const t = useTranslation(dict);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allDocs, setAllDocs] = useState<models.SearchResult[]>([]);
  const [ftsResults, setFtsResults] = useState<models.SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { openDocument, createDocument } = useEditorStore();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Load all documents when palette opens
  useEffect(() => {
    if (open) {
      ListDocuments('all', 100)
        .then((res) => setAllDocs(res || []))
        .catch(console.error);
    } else {
      setQuery('');
      setAllDocs([]);
      setFtsResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // FTS search for content matches (debounced)
  useEffect(() => {
    if (!query.trim() || query.startsWith('>')) {
      setFtsResults([]);
      return;
    }

    const timer = setTimeout(() => {
      SearchCmd(query)
        .then((res) => setFtsResults(res || []))
        .catch(() => setFtsResults([]));
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Compute filtered results: local title filter + FTS content matches, deduped
  const filteredDocs = (() => {
    if (!query.trim()) return allDocs.slice(0, 10); // show recent 10

    const q = query.toLowerCase();

    // Local title/tag filter
    const titleMatches = allDocs.filter(
      (d) =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.tags || []).some((tag) => tag.toLowerCase().includes(q)),
    );

    // Merge FTS results (dedup by id)
    const seenIds = new Set(titleMatches.map((d) => d.id));
    const extraFts = ftsResults.filter((r) => !seenIds.has(r.id));

    return [...titleMatches, ...extraFts];
  })();

  // Flat list of items for keyboard nav: docs + optional "create"
  const hasCreate = !query.startsWith('>') && query.length > 0;
  const totalItems = filteredDocs.length + (hasCreate ? 1 : 0);

  // Reset selection on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (id: string) => {
    openDocument(id);
    setOpen(false);
  };

  const handleCreate = () => {
    createDocument(query || undefined);
    setOpen(false);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % totalItems);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < filteredDocs.length) {
        handleSelect(filteredDocs[selectedIndex].id);
      } else if (hasCreate) {
        handleCreate();
      }
      return;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-cmd-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  const showNoResults = query.length > 0 && filteredDocs.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 p-4 font-light"
      style={{ backgroundColor: 'rgba(2,6,23,0.4)', backdropFilter: 'blur(12px)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border"
        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* ── Search Input ── */}
        <div
          className="flex items-center px-6 py-2"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <SearchIcon
            className="w-5 h-5 mr-4"
            style={{ color: 'var(--text-muted)' }}
            strokeWidth={1}
          />
          <input
            autoFocus
            type="text"
            placeholder={t.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-none focus:outline-none focus:ring-0 py-6 bg-transparent text-xl tracking-tight font-extralight"
            style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
          />
        </div>

        {/* ── Results List ── */}
        <div ref={listRef} className="max-h-[500px] overflow-y-auto p-4 custom-scrollbar">
          {/* ── Empty state ── */}
          {query.length === 0 && allDocs.length === 0 && (
            <div className="p-8 text-center">
              <FileText
                className="w-8 h-8 mx-auto mb-4"
                style={{ color: 'var(--text-muted)', opacity: 0.3 }}
                strokeWidth={1}
              />
              <p
                className="text-xs font-bold uppercase tracking-[0.2em]"
                style={{ color: 'var(--text-muted)' }}
              >
                {t.empty_state_text}
              </p>
            </div>
          )}

          {/* ── Group label ── */}
          {filteredDocs.length > 0 && (
            <p
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{ color: 'var(--text-muted)' }}
            >
              {query.length > 0 ? t.docs_group : t.recent}
            </p>
          )}

          {/* ── Document items ── */}
          {filteredDocs.map((doc, i) => {
            const isSelected = i === selectedIndex;
            return (
              <div
                key={doc.id}
                data-cmd-item
                onClick={() => handleSelect(doc.id)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer mb-1 transition-all duration-150"
                style={{
                  backgroundColor: isSelected ? 'var(--bg-surface)' : 'transparent',
                  color: 'var(--text-primary)',
                  border: isSelected ? '1px solid var(--border-subtle)' : '1px solid transparent',
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <FileText
                  className="w-4 h-4 shrink-0"
                  style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}
                  strokeWidth={1}
                />
                <div className="min-w-0 flex-1">
                  <span className="font-light truncate block">{doc.title || 'Untitled'}</span>
                  {doc.snippet && query.length > 0 && (
                    <span
                      className="text-xs line-clamp-1 italic font-light block mt-0.5"
                      style={{ color: 'var(--text-muted)' }}
                      dangerouslySetInnerHTML={{ __html: doc.snippet }}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {/* ── No results ── */}
          {showNoResults && (
            <p
              className="text-sm font-light text-center py-4"
              style={{ color: 'var(--text-muted)' }}
            >
              {t.no_results}
            </p>
          )}

          {/* ── Create new ── */}
          {hasCreate && (
            <div
              data-cmd-item
              onClick={handleCreate}
              className="flex items-center gap-4 p-5 text-sm rounded-2xl cursor-pointer border mt-2 transition-all duration-150"
              style={{
                backgroundColor:
                  selectedIndex === filteredDocs.length
                    ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                    : 'color-mix(in srgb, var(--accent) 6%, transparent)',
                borderColor:
                  selectedIndex === filteredDocs.length
                    ? 'var(--accent)'
                    : 'color-mix(in srgb, var(--accent) 16%, transparent)',
                color: 'var(--accent)',
              }}
              onMouseEnter={() => setSelectedIndex(filteredDocs.length)}
            >
              <Plus className="w-5 h-5" strokeWidth={1.5} />
              <span className="font-medium text-lg">{t.create_new.replace('{query}', query)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
