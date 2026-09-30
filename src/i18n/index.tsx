import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Localized } from '@content/restaurant';
import type { Lang } from '@shared/constants';
import { storage } from '@/lib/storage';
import { en } from './en';
import { fr, type Dictionary } from './fr';

const DICTIONARIES: Record<Lang, Dictionary> = { fr, en };
const KEY = 'bb-lang';

function detectLang(): Lang {
  const saved = storage.get(KEY);
  if (saved === 'fr' || saved === 'en') return saved;
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.toLowerCase().slice(0, 2);
    if (code === 'fr') return 'fr';
    if (code === 'en') return 'en';
  }
  return 'fr';
}

type I18n = {
  lang: Lang;
  t: Dictionary;
  setLang(lang: Lang): void;
  /** Picks the current language from a { fr, en } content value. */
  loc(value: Localized): string;
  /** Picks a dish/category name: English when available and selected, otherwise French. */
  pick(frText: string, enText: string | null | undefined): string;
  locale: string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    storage.set(KEY, next);
    setLangState(next);
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      t: DICTIONARIES[lang],
      setLang,
      loc: (v) => v[lang],
      pick: (frText, enText) => (lang === 'en' && enText ? enText : frText),
      locale: lang === 'fr' ? 'fr-FR' : 'en-GB',
    }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
