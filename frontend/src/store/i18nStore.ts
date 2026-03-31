import { create } from 'zustand';

export type SupportedLanguage = 'pt' | 'en';

interface I18nState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  toggleLanguage: () => void;
}

export const useI18nStore = create<I18nState>((set) => {
  // Try to load initial language from localStorage
  const storedLang = localStorage.getItem('writtt-language');
  const initialLang: SupportedLanguage = storedLang === 'en' ? 'en' : 'pt';

  return {
    language: initialLang,
    setLanguage: (lang) => {
      localStorage.setItem('writtt-language', lang);
      set({ language: lang });
    },
    toggleLanguage: () => {
      set((state) => {
        const nextLang = state.language === 'pt' ? 'en' : 'pt';
        localStorage.setItem('writtt-language', nextLang);
        return { language: nextLang };
      });
    },
  };
});
