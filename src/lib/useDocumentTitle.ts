import { restaurant } from '@content/restaurant';
import { useEffect } from 'react';
import { useI18n } from '@/i18n';

/** Sets the browser tab title ("Réserver une table · B&B Park"), defaulting to the SEO title. */
export function useDocumentTitle(title?: string | null) {
  const { lang } = useI18n();
  useEffect(() => {
    document.title = title ? `${title} · ${restaurant.name}` : restaurant.seo.title[lang];
  }, [title, lang]);
}
