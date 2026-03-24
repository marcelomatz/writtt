import { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { useEditorStore } from '../store/editorStore';
import { Search as SearchIcon, FileText, Plus } from 'lucide-react';
import { Search as SearchCmd } from '../../wailsjs/go/main/App';
import { models } from '../../wailsjs/go/models';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<models.SearchResult[]>([]);
  const { loadDocument, createDocument, primaryDoc } = useEditorStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        if (open) {
          setOpen(false);
        }
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open]);

  useEffect(() => {
    if (query) {
      if (!query.startsWith('>')) {
        SearchCmd(query).then(res => {
          setResults(res || []);
        });
      }
    } else {
      setResults([]);
    }
  }, [query]);

  const handleSelect = (id: string) => {
    loadDocument(id);
    setOpen(false);
  };

  const handleCreate = () => {
    createDocument(query);
    setOpen(false);
  };

  if (!open) return null;

  const isCommand = query.startsWith('>');

  return (
    <div className="fixed inset-0 bg-[#020617]/40 dark:bg-black/60 backdrop-blur-xl z-50 flex items-start justify-center pt-32 p-4 font-light">
      <Command 
        className="w-full max-w-2xl dark:bg-[#0b1224]/95 rounded-2xl shadow-2xl overflow-hidden dark:border-slate-800/50 border"
        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
        shouldFilter={false}
      >
        <div className="flex items-center px-6 py-2 dark:border-slate-800/50" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <SearchIcon className="w-5 h-5 mr-4 dark:text-slate-700" style={{ color: 'var(--text-muted)' }} strokeWidth={1} />
          <Command.Input 
            autoFocus 
            placeholder="O que você está pensando hoje?..." 
            value={query}
            onValueChange={setQuery}
            className="w-full border-none focus:outline-none focus:ring-0 py-6 dark:text-slate-200 bg-transparent text-xl dark:placeholder:text-slate-800 tracking-tight font-extralight"
            style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
          />
        </div>

        <Command.List className="max-h-[500px] overflow-y-auto p-4 custom-scrollbar">
          {query.length === 0 && (
            <div className="p-8 text-center animate-in fade-in duration-700">
              <FileText className="w-8 h-8 text-slate-100 dark:text-slate-900 mx-auto mb-4" strokeWidth={1} />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300 dark:text-slate-700">Busca Inteligente Writtt</p>
            </div>
          )}

              {results.length > 0 && (
                <Command.Group heading="Seus Documentos" className="px-4 py-2 text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">
                  {results.map((res) => (
                    <Command.Item 
                      key={res.id} 
                      onSelect={() => handleSelect(res.id)}
                      className="flex flex-col p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 cursor-pointer mb-2 transition-all duration-300 border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
                    >
                      <div className="flex items-center text-base font-light mb-1">
                        <FileText className="w-4 h-4 mr-3 text-slate-300 dark:text-slate-700" strokeWidth={1} />
                        {res.title}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-600 ml-7 line-clamp-1 italic font-light" dangerouslySetInnerHTML={{ __html: res.snippet }} />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              
              {!isCommand && query.length > 0 && results.length === 0 && (
                <Command.Item 
                  onSelect={handleCreate}
                  className="flex items-center gap-4 p-5 text-sm rounded-2xl bg-blue-50/50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 cursor-pointer border border-blue-100 dark:border-blue-900/30"
                >
                  <Plus className="w-5 h-5" strokeWidth={1.5} />
                  <span className="font-medium text-lg">Criar novo: "{query}"</span>
                </Command.Item>
              )}
        </Command.List>
      </Command>
    </div>
  );
}
