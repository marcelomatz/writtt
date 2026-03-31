import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DictionaryStore {
  words: string[];
  addWord: (word: string) => void;
  removeWord: (word: string) => void;
  hasWord: (word: string) => boolean;
  importWords: (text: string) => void;
}

export const useDictionaryStore = create<DictionaryStore>()(
  persist(
    (set, get) => ({
      words: [],

      addWord: (word: string) => {
        const normalized = word.trim().toLowerCase();
        if (!normalized) return;
        const current = get().words;
        if (current.includes(normalized)) return;
        set({ words: [...current, normalized].sort() });
      },

      removeWord: (word: string) => {
        set({ words: get().words.filter((w) => w !== word.toLowerCase()) });
      },

      hasWord: (word: string) => {
        return get().words.includes(word.trim().toLowerCase());
      },

      importWords: (text: string) => {
        const newWords = text
          .split(/[\n,;]+/)
          .map((w) => w.trim().toLowerCase())
          .filter((w) => w.length > 0);
        const current = get().words;
        const merged = [...new Set([...current, ...newWords])].sort();
        set({ words: merged });
      },
    }),
    {
      name: 'writtt-dictionary',
    },
  ),
);
