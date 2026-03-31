import { type SupportedLanguage, useI18nStore } from '../store/i18nStore';

export type ComponentDictionary<T> = Record<SupportedLanguage, T>;

export function useTranslation<T>(dictionary: ComponentDictionary<T>): T {
  const language = useI18nStore((state) => state.language);
  return dictionary[language] || dictionary['pt'];
}
