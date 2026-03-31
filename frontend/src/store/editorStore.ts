import { create } from 'zustand';
import { ReadDocument, SaveDocument } from '../../wailsjs/go/main/App';
import { models } from '../../wailsjs/go/models';

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
  homeFilter: 'all' | 'backups';

  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  rightSidebarWidth: number;
  sessionCreatedDocId: string | null;

  setTheme: (theme: 'light' | 'dark') => void;
  setStats: (stats: EditorStats) => void;
  setView: (view: 'home' | 'editor' | 'settings') => void;
  setDocsCount: (count: number) => void;
  setHomeFilter: (filter: 'all' | 'backups') => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setRightSidebarWidth: (width: number) => void;
  loadDocument: (id: string, force?: boolean) => Promise<void>;
  openDocument: (id: string) => Promise<void>;
  saveCurrentDocument: (content?: string, title?: string) => Promise<void>;
  updateDocumentTitle: (title: string) => void;
  updateDocumentContent: (content: string) => void;
  createDocument: (title?: string) => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSaveTime = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  primaryDoc: null,
  theme: (localStorage.getItem('writtt_theme') as 'light' | 'dark') ?? 'dark',
  stats: { words: 0, chars: 0, paragraphs: 0 },
  view: 'home',
  docsCount: 0,
  homeFilter: 'all',
  leftSidebarCollapsed: localStorage.getItem('writtt_left_collapsed') === 'true',
  rightSidebarCollapsed: localStorage.getItem('writtt_right_collapsed') === 'true',
  rightSidebarWidth: parseInt(localStorage.getItem('writtt_right_width') || '320', 10),
  sessionCreatedDocId: null,

  setTheme: (theme) => {
    localStorage.setItem('writtt_theme', theme);
    set({ theme });
  },

  setStats: (stats) => set({ stats }),

  setView: (view) => set({ view }),

  setDocsCount: (count) => set({ docsCount: count }),

  setHomeFilter: (filter) => set({ homeFilter: filter }),

  toggleLeftSidebar: () =>
    set((state) => {
      const next = !state.leftSidebarCollapsed;
      localStorage.setItem('writtt_left_collapsed', String(next));
      return { leftSidebarCollapsed: next };
    }),

  toggleRightSidebar: () =>
    set((state) => {
      const next = !state.rightSidebarCollapsed;
      localStorage.setItem('writtt_right_collapsed', String(next));
      return { rightSidebarCollapsed: next };
    }),

  setRightSidebarWidth: (width) => {
    localStorage.setItem('writtt_right_width', String(Math.max(200, Math.min(800, width))));
    set({ rightSidebarWidth: width });
  },

  updateDocumentContent: (content: string) => {
    const doc = get().primaryDoc;
    if (!doc) return;
    set({
      primaryDoc: models.Document.createFrom({
        ...doc,
        content,
      }),
    });
  },

  updateDocumentTitle: (title) => {
    const state = get();
    const doc = state.primaryDoc;
    if (!doc) return;

    const newDoc = models.Document.createFrom({
      ...doc,
      frontmatter: { ...doc.frontmatter, title },
    });

    set({ primaryDoc: newDoc });

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      get().saveCurrentDocument(undefined, title);
    }, 1000);
  },

  openDocument: async (id: string) => {
    const state = get();
    if (state.primaryDoc?.frontmatter?.id === id) {
      set({ view: 'editor' });
      return;
    }

    // 1. Force save current document BEFORE changing it
    if (state.primaryDoc) {
      await state.saveCurrentDocument();
    }

    // 2. Clear primary doc (unmounts Editor.tsx to cancel closures/timeouts)
    set({ primaryDoc: null });

    // 3. Load the new one
    await get().loadDocument(id, true);
    set({ view: 'editor', sessionCreatedDocId: null });
  },

  loadDocument: async (id: string, force = false) => {
    // If we literally just saved this file within 2 seconds, ignore the watcher event 
    // to prevent circular reloading interrupts
    if (!force && Date.now() - lastSaveTime < 2000) return;
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
        ...(doc?.frontmatter || {}),
        id: doc?.frontmatter?.id || '',
        type: doc?.frontmatter?.type || 'markdown',
        title: finalTitle,
        created_at: doc?.frontmatter?.created_at || null,
        updated_at: new Date().toISOString(),
        is_vault: true,
      },
    };

    try {
      lastSaveTime = Date.now();
      const newDoc = models.Document.createFrom(payload);
      const id = await SaveDocument(newDoc);
      lastSaveTime = Date.now(); // Update after save completes too

      const latestDoc = get().primaryDoc;
      if (!latestDoc) return;

      if (latestDoc.frontmatter.id !== id) {
        const updatedDoc = models.Document.createFrom({
          ...latestDoc,
          frontmatter: { ...latestDoc.frontmatter, id },
        });
        
        let newSessionDocId = get().sessionCreatedDocId;
        if (newSessionDocId === 'pending') {
          newSessionDocId = id;
        }
        
        set({ primaryDoc: updatedDoc, sessionCreatedDocId: newSessionDocId });
      }
    } catch (err) {
      console.error('Save error:', err);
    }
  },

  createDocument: async (title?: string) => {
    // 1. Force save current document BEFORE changing it
    const state = get();
    if (state.primaryDoc) {
      await state.saveCurrentDocument();
    }

    // 2. Clear primary doc (unmounts Editor.tsx to cancel closures/timeouts)
    set({ primaryDoc: null });

    const newDoc = models.Document.createFrom({
      content: '',
      raw: '',
      frontmatter: models.Frontmatter.createFrom({
        id: '',
        title: title || 'Untitled',
        type: 'markdown',
        is_vault: true,
      }),
    });

    set({ primaryDoc: newDoc, view: 'editor', sessionCreatedDocId: 'pending' });

    await get().saveCurrentDocument('', title || 'Untitled');
  },
}));
