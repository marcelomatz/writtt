import { create } from 'zustand';
import { models } from '../../wailsjs/go/models';
import { ReadDocument, SaveDocument } from '../../wailsjs/go/main/App';

interface EditorStats {
  words: number;
  chars: number;
  paragraphs: number;
}

interface EditorState {
  primaryDoc: models.Document | null;
  theme: 'light' | 'dark';
  stats: EditorStats;
  view: 'home' | 'editor' | 'settings';
  docsCount: number;
  homeFilter: 'recent' | 'all' | 'backups' | 'protected';

  setTheme: (theme: 'light' | 'dark') => void;
  setStats: (stats: EditorStats) => void;
  setView: (view: 'home' | 'editor' | 'settings') => void;
  setDocsCount: (count: number) => void;
  setHomeFilter: (filter: 'recent' | 'all' | 'backups' | 'protected') => void;
  loadDocument: (id: string) => Promise<void>;
  saveCurrentDocument: (content?: string, title?: string) => Promise<void>;
  updateDocumentTitle: (title: string) => void;
  createDocument: (title?: string) => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useEditorStore = create<EditorState>((set, get) => ({
  primaryDoc: null,
  theme: (localStorage.getItem('writtt_theme') as 'light' | 'dark') ?? 'dark',
  stats: { words: 0, chars: 0, paragraphs: 0 },
  view: 'home',
  docsCount: 0,
  homeFilter: 'recent',

  setTheme: (theme) => {
    localStorage.setItem('writtt_theme', theme);
    set({ theme });
  },

  setStats: (stats) => set({ stats }),

  setView: (view) => set({ view }),

  setDocsCount: (count) => set({ docsCount: count }),

  setHomeFilter: (filter) => set({ homeFilter: filter }),

  updateDocumentTitle: (title) => {
    const state = get();
    const doc = state.primaryDoc;
    if (!doc) return;

    const newDoc = models.Document.createFrom({
      ...doc,
      frontmatter: { ...doc.frontmatter, title }
    });

    set({ primaryDoc: newDoc });

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      get().saveCurrentDocument(newDoc.content, title);
    }, 1000);
  },

  loadDocument: async (id: string) => {
    try {
      const doc = await ReadDocument(id);
      set({ primaryDoc: doc });
    } catch (err) {
      console.error('Failed to load document', err);
    }
  },

  saveCurrentDocument: async (content?: string, title?: string) => {
    const state = get();
    const doc = state.primaryDoc;

    if (!doc && !content && !title) return;

    const finalContent = content ?? doc?.content ?? '';
    const finalTitle = title ?? doc?.frontmatter?.title ?? 'Untitled';

    const payload = {
      content: finalContent,
      raw: '',
      frontmatter: {
        id: doc?.frontmatter?.id || '',
        type: doc?.frontmatter?.type || 'markdown',
        title: finalTitle,
        created_at: doc?.frontmatter?.created_at || null,
        updated_at: new Date().toISOString()
      }
    };

    try {
      const newDoc = models.Document.createFrom(payload);
      const id = await SaveDocument(newDoc);

      const updatedDoc = models.Document.createFrom({
        ...payload,
        frontmatter: { ...payload.frontmatter, id }
      });

      set({ primaryDoc: updatedDoc });
    } catch (err) {
      console.error('Save error:', err);
    }
  },

  createDocument: async (title?: string) => {
    const newDoc = models.Document.createFrom({
      content: '',
      raw: '',
      frontmatter: models.Frontmatter.createFrom({
        id: '',
        title: title || 'Untitled',
        type: 'markdown'
      })
    });

    set({ primaryDoc: newDoc });

    await get().saveCurrentDocument('', title || 'Untitled');
  }
}));
