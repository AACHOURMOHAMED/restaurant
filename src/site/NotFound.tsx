import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { ButtonLink } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function NotFoundPage() {
  const { t } = useI18n();
  useDocumentTitle(t.common.notFoundTitle);
  return (
    <section className="grain flex min-h-[80svh] items-center bg-ink-950 pt-32 pb-24 text-cream-50">
      <div className="container-x max-w-2xl">
        <p className="font-display text-[7rem] leading-none text-gold-400/70 italic">404</p>
        <h1 className="font-display mt-4 text-5xl font-medium">{t.common.notFoundTitle}</h1>
        <p className="mt-4 text-lg text-cream-100/75">{t.common.notFoundText}</p>
        <ButtonLink to="/" variant="gold" className="mt-10">
          {t.common.backHome}
        </ButtonLink>
      </div>
    </section>
  );
}

/** Shown if a page crashes or a lazy chunk fails to load (e.g. after a deploy). */
export function RouteError() {
  const error = useRouteError();
  const { t } = useI18n();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="grain flex min-h-svh items-center bg-ink-950 text-cream-50">
      <div className="container-x max-w-xl py-20">
        <h1 className="font-display text-5xl font-medium">{notFound ? t.common.notFoundTitle : t.errors.generic}</h1>
        <div className="mt-8 flex gap-3">
          <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-gold-400 px-6 py-3 font-semibold text-ink-950">
            {t.common.retry}
          </button>
          <Link to="/" className="rounded-full px-6 py-3 font-semibold ring-1 ring-cream-50/30" reloadDocument>
            {t.common.backHome}
          </Link>
        </div>
      </div>
    </div>
  );
}
