import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ListDocuments } from '../../wailsjs/go/main/App';
import type { models } from '../../wailsjs/go/models';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';

const dict = {
  pt: {
    documents: 'Documentos',
    expand: 'Expandir',
    collapse: 'Recolher',
    untitled: 'Untitled',
    untitled_generation: 'Untitled (Geração)',
    no_documents: 'Nenhum documento encontrado.',
  },
  en: {
    documents: 'Documents',
    expand: 'Expand',
    collapse: 'Collapse',
    untitled: 'Untitled',
    untitled_generation: 'Untitled (Generation)',
    no_documents: 'No documents found.',
  },
};

export function DocumentTree() {
  const t = useTranslation(dict);
  const { primaryDoc, openDocument, leftSidebarCollapsed, toggleLeftSidebar, showChapters, toggleChapters } = useEditorStore();
  const [docs, setDocs] = useState<models.SearchResult[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchDocs = async () => {
    try {
      const results = await ListDocuments('all', 100);
      setDocs(results || []);
    } catch (err) {
      console.error('Error fetching tree docs:', err);
    }
  };

  useEffect(() => {
    fetchDocs();

    // Listen for backend file updates (saves from editor)
    const unsub = EventsOn('file-updated', () => {
      fetchDocs();
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [primaryDoc?.frontmatter?.id]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const parents = docs.filter((d) => !d.parent_id);
  const getChildren = (parentId: string) => docs.filter((d) => d.parent_id === parentId);

  const activeId = primaryDoc?.frontmatter?.id;

  return (
    <div
      className={`h-full flex flex-col transition-[width] duration-300 ease-in-out overflow-y-auto custom-scrollbar rounded-2xl shadow-sm border ${leftSidebarCollapsed ? 'w-14 items-center' : 'w-64'}`}
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div
        className={`p-4 border-b w-full flex items-center ${leftSidebarCollapsed ? 'justify-center' : 'justify-between'}`}
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {!leftSidebarCollapsed && (
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {t.documents}
          </h3>
        )}
        <button
          onClick={toggleLeftSidebar}
          className="text-slate-400 hover:text-blue-500 transition-colors shrink-0"
          title={leftSidebarCollapsed ? t.expand : t.collapse}
        >
          {leftSidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>
      <div
        className={`p-2 flex-1 w-full flex flex-col ${leftSidebarCollapsed ? 'items-center' : ''}`}
      >
        {parents.map((parent) => {
          const children = getChildren(parent.id);
          const hasChildren = children.length > 0;
          const isExpanded = expanded[parent.id];
          const isActive = activeId === parent.id;

          return (
            <div key={parent.id} className="mb-1 w-full">
              <div
                onClick={() => openDocument(parent.id)}
                title={
                  isActive
                    ? primaryDoc?.frontmatter?.title || t.untitled
                    : parent.title || t.untitled
                }
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${isActive ? 'bg-blue-500/10 text-blue-500 font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5'} ${leftSidebarCollapsed ? 'justify-center' : ''}`}
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
              >
                {!leftSidebarCollapsed && (
                  <div
                    onClick={(e) => hasChildren && toggleExpand(parent.id, e)}
                    className="w-4 h-4 shrink-0 flex items-center justify-center"
                  >
                    {hasChildren ? (
                      isExpanded ? (
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      ) : (
                        <ChevronRight className="w-3 h-3 opacity-50" />
                      )
                    ) : (
                      <span className="w-3 h-3" />
                    )}
                  </div>
                )}
                <FileText className="w-4 h-4 opacity-70 shrink-0" />
                {!leftSidebarCollapsed && (
                  <span className="truncate">
                    {isActive
                      ? primaryDoc?.frontmatter?.title || t.untitled
                      : parent.title || t.untitled}
                  </span>
                )}

                {/* Chapter toggle — only on active doc, expanded sidebar */}
                {isActive && !leftSidebarCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleChapters();
                    }}
                    className="ml-auto p-1 rounded-md transition-all duration-200 flex-shrink-0"
                    style={{
                      backgroundColor: showChapters ? 'var(--accent)' : 'transparent',
                      color: showChapters ? '#fff' : 'var(--text-muted)',
                    }}
                    title={showChapters ? 'Hide chapters' : 'Show chapters'}
                  >
                    <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                )}
              </div>

              {!leftSidebarCollapsed && isExpanded && hasChildren && (
                <div
                  className="pl-6 mt-1 flex flex-col gap-1 border-l ml-3"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {children.map((child) => {
                    const isChildActive = activeId === child.id;
                    return (
                      <div
                        key={child.id}
                        title={
                          isChildActive
                            ? primaryDoc?.frontmatter?.title || t.untitled_generation
                            : child.title || t.untitled_generation
                        }
                        onClick={() => openDocument(child.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer text-xs transition-colors ${isChildActive ? 'bg-blue-500/10 text-blue-500 font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                        style={{ color: isChildActive ? 'var(--accent)' : 'var(--text-muted)' }}
                      >
                        <FileCode2 className="w-3 h-3 opacity-60 shrink-0" />
                        <span className="truncate">
                          {isChildActive
                            ? primaryDoc?.frontmatter?.title || t.untitled_generation
                            : child.title || t.untitled_generation}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {parents.length === 0 && !leftSidebarCollapsed && (
          <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
            {t.no_documents}
          </p>
        )}
      </div>
    </div>
  );
}
