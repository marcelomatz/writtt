import type React from 'react';
import { useTranslation } from '../hooks/useTranslation';

const dict = {
  pt: {
    slogan: 'Think. Type. Transform.',
    start_thought: 'Inicie um pensamento com',
  },
  en: {
    slogan: 'Think. Type. Transform.',
    start_thought: 'Start a thought with',
  },
};

export const EmptyState: React.FC = () => {
  const t = useTranslation(dict);
  return (
    <div className="flex flex-col items-center justify-center h-full w-full text-slate-300 dark:text-slate-700 animate-in fade-in duration-700">
      <h2 className="text-3xl sm:text-4xl font-light tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-slate-300 dark:from-slate-600 dark:to-slate-700 mb-6 select-none">
        {t.slogan}
      </h2>
      <p className="font-light tracking-wide italic text-sm">
        {t.start_thought}{' '}
        <kbd className="px-2 py-0.5 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 text-[10px] uppercase font-bold not-italic ml-1">
          Cmd K
        </kbd>
      </p>
    </div>
  );
};

export default EmptyState;
