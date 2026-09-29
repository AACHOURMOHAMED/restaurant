import { restaurant } from '@content/restaurant';
import type { AvailabilityResponse, BookingCalendar, ReservationCreated } from '@shared/api-types';
import { LIMITS } from '@shared/constants';
import { issuesToFields, reservationInputSchema } from '@shared/schemas';
import { daysBetween, type LocalDate } from '@shared/time';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, ChevronRight, Clock, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, ButtonA, Notice, Spinner, TextArea, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError, errorMessage, fieldErrors } from '@/lib/api';
import { formatDateLong, telHref, ucfirst } from '@/lib/format';
import { useSite } from '@/lib/queries';
import { uuid } from '@/lib/storage';
import { myReservationsStore } from '@/lib/stores';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { PageHero } from '@/site/PageHero';
import { DateStrip, PartySize, TimeSlots } from './pickers';

type FormState = { name: string; phone: string; email: string; notes: string };
const FIELD_ORDER = ['partySize', 'date', 'time', 'name', 'phone', 'email', 'notes'];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-cream-200 py-7 first:border-t-0 first:pt-0">
      <h2 className="mb-4 flex items-center gap-3 text-[12px] font-bold tracking-[0.2em] text-taupe-500 uppercase">
        <span className="flex size-7 items-center justify-center rounded-full bg-ink-900 text-[12px] tracking-normal text-cream-50">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ReservePage() {
  const { t, lang, locale } = useI18n();
  useDocumentTitle(t.reserve.title);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const site = useSite();
  const booking = site.data?.booking;

  const [party, setParty] = useState(2);
  const [date, setDate] = useState<LocalDate | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ name: '', phone: '', email: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idempotency = useRef<{ key: string; fingerprint: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const enabled = !!booking?.onlineBookingEnabled;
  const calendar = useQuery({
    queryKey: ['calendar', party],
    queryFn: () => api<BookingCalendar>(`/api/public/calendar?party=${party}`),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Keep a valid date selected: the chosen one if still bookable, otherwise the first bookable day.
  useEffect(() => {
    if (!calendar.data) return;
    const current = calendar.data.days.find((d) => d.date === date);
    if (!current?.available) setDate(calendar.data.days.find((d) => d.available)?.date ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar.data]);

  const availability = useQuery({
    queryKey: ['availability', date, party],
    queryFn: () => api<AvailabilityResponse>(`/api/public/availability?date=${date}&party=${party}`),
    enabled: enabled && !!date,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const day = availability.data?.date === date ? availability.data : undefined;

  useEffect(() => {
    if (time && day && !day.slots.some((s) => s.time === time && s.available)) setTime(null);
  }, [day, time]);

  const mutation = useMutation({
    mutationFn: ({ payload, key }: { payload: unknown; key: string }) =>
      api<ReservationCreated>('/api/public/reservations', { body: payload, idempotencyKey: key }),
    onSuccess: (res) => {
      myReservationsStore.set((all) => [
        { token: res.statusToken, reference: res.reference, date: res.date, time: res.time, partySize: res.partySize },
        ...all.filter((r) => r.reference !== res.reference),
      ].slice(0, 10));
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      navigate(`/reservation/${res.statusToken}`, { state: { justCreated: true } });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'VALIDATION') {
        setErrors(fieldErrors(t, err));
        return;
      }
      if (err instanceof ApiError && ['SLOT_FULL', 'SLOT_UNAVAILABLE', 'DATE_IN_PAST', 'CLOSED'].includes(err.code)) {
        setTime(null);
        setErrors({ time: errorMessage(t, err) });
        void availability.refetch();
        void calendar.refetch();
        return;
      }
      setSubmitError(errorMessage(t, err));
    },
  });

  const update = (field: keyof FormState) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mutation.isPending) return;
    setSubmitError(null);
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
      date: date ?? '',
      time: time ?? '',
      partySize: party,
      lang,
    };
    const parsed = reservationInputSchema.safeParse(payload);
    if (!parsed.success) {
      const codes = issuesToFields(parsed.error.issues);
      const messages: Record<string, string> = {};
      for (const [k, code] of Object.entries(codes)) messages[k] = t.fields[code] ?? t.fields.invalid!;
      setErrors(messages);
      const first = FIELD_ORDER.find((f) => f in messages);
      const el = first ? formRef.current?.querySelector<HTMLElement>(`[name="${first}"], [data-field="${first}"]`) : null;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus({ preventScroll: true });
      return;
    }
    setErrors({});
    // Same content → same idempotency key, so a retry after a network error can't book twice.
    const fingerprint = JSON.stringify(parsed.data);
    if (!idempotency.current || idempotency.current.fingerprint !== fingerprint) idempotency.current = { key: uuid(), fingerprint };
    mutation.mutate({ payload: parsed.data, key: idempotency.current.key });
  };

  const today = site.data?.today;
  const myUpcoming = myReservationsStore.use().filter((r) => today && daysBetween(today, r.date) >= 0);
  const summary = useMemo(
    () => (date && time ? t.reserve.summary(t.reserve.guestsCount(party), formatDateLong(date, locale), time) : null),
    [date, time, party, t, locale],
  );

  const unavailable = site.isError || (site.data && !booking?.onlineBookingEnabled);

  return (
    <>
      <PageHero eyebrow={restaurant.name} title={t.reserve.title}>
        <p>{t.reserve.intro}</p>
        {/* Space for two lines on phones (where the note wraps) so the form doesn't jump once it loads. */}
        <p className="mt-3 flex min-h-12 items-start gap-2 text-[15px] leading-6 text-gold-300 sm:min-h-6">
          {booking && (
            <>
              <ShieldCheck className="mt-[3px] size-4.5 shrink-0" aria-hidden />
              {booking.requireApproval ? t.reserve.approvalNote : t.reserve.instantNote}
            </>
          )}
        </p>
      </PageHero>

      <div className="container-x relative -mt-16 pb-24 md:-mt-20">
        <div className="grid gap-8 lg:grid-cols-12">
          <form
            ref={formRef}
            noValidate
            onSubmit={submit}
            className="min-w-0 rounded-[2rem] bg-cream-50 p-5 shadow-lift ring-1 ring-cream-200 sm:p-8 lg:col-span-8"
            aria-label={t.reserve.title}
          >
            {site.isPending ? (
              // Same footprint as the form, so nothing jumps when it appears.
              <div className="flex min-h-[44rem] items-center justify-center text-taupe-500">
                <Spinner label={t.common.loading} />
              </div>
            ) : unavailable ? (
              <div className="space-y-5 py-4">
                <Notice tone="warn">{t.reserve.unavailable}</Notice>
                <ButtonA href={telHref(restaurant.contact.phone)} variant="dark" size="lg">
                  <Phone className="size-5" aria-hidden />
                  {t.reserve.callToBook} · {restaurant.contact.phoneDisplay}
                </ButtonA>
              </div>
            ) : (
              <>
                <Step n={1} title={t.reserve.guests}>
                  <div data-field="partySize">
                    <PartySize value={party} max={booking!.maxPartySize} onChange={setParty} />
                  </div>
                  <p className="mt-3 text-sm text-taupe-600">
                    {t.reserve.largeGroup(booking!.maxPartySize)}{' '}
                    <a href={telHref(restaurant.contact.phone)} className="font-semibold text-ink-900 underline underline-offset-4">
                      {restaurant.contact.phoneDisplay}
                    </a>
                  </p>
                </Step>

                <Step n={2} title={t.reserve.date}>
                  <div data-field="date">
                    {calendar.data ? (
                      <DateStrip days={calendar.data.days} value={date} onChange={(d) => setDate(d)} loading={calendar.isFetching} />
                    ) : calendar.isError ? (
                      <Notice tone="error">{errorMessage(t, calendar.error)}</Notice>
                    ) : (
                      <div className="flex h-[6.6rem] gap-2 overflow-hidden" aria-busy="true" aria-label={t.reserve.loadingSlots}>
                        {Array.from({ length: 8 }, (_, i) => (
                          <div key={i} className="w-[4.4rem] shrink-0 animate-pulse rounded-2xl bg-cream-200/70" />
                        ))}
                      </div>
                    )}
                    {errors.date && (
                      <p className="mt-2 text-[13px] font-medium text-terracotta-600" role="alert">
                        {errors.date}
                      </p>
                    )}
                  </div>
                </Step>

                <Step n={3} title={t.reserve.time}>
                  <div data-field="time">
                    <TimeSlots
                      day={day}
                      loading={availability.isFetching}
                      value={time}
                      onChange={(v) => {
                        setTime(v);
                        if (errors.time) setErrors(({ time: _t, ...rest }) => rest);
                      }}
                      error={errors.time}
                    />
                  </div>
                </Step>

                <Step n={4} title={t.reserve.details}>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <TextField
                      label={t.reserve.name}
                      name="name"
                      autoComplete="name"
                      value={form.name}
                      onChange={update('name')}
                      maxLength={LIMITS.nameMax}
                      error={errors.name}
                      required
                    />
                    <TextField
                      label={t.reserve.phone}
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={update('phone')}
                      maxLength={LIMITS.phoneMax}
                      error={errors.phone}
                      hint={t.reserve.phoneHint}
                      placeholder="06 12 34 56 78"
                      required
                    />
                    <TextField
                      label={t.reserve.email}
                      optional={t.reserve.optional}
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={update('email')}
                      maxLength={LIMITS.emailMax}
                      error={errors.email}
                      wrapperClassName="sm:col-span-2"
                    />
                    <TextArea
                      label={t.reserve.notes}
                      optional={t.reserve.optional}
                      name="notes"
                      value={form.notes}
                      onChange={update('notes')}
                      maxLength={LIMITS.reservationNotesMax}
                      placeholder={t.reserve.notesPlaceholder}
                      error={errors.notes}
                      rows={3}
                      wrapperClassName="sm:col-span-2"
                    />
                  </div>
                  <p className="mt-4 flex items-start gap-2 text-[13px] text-taupe-500">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {t.reserve.privacy}
                  </p>
                </Step>

                {submitError && (
                  <Notice tone="error" className="mb-5">
                    {submitError}
                  </Notice>
                )}

                <div className="flex flex-col gap-4 border-t border-cream-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-display text-xl text-ink-800" aria-live="polite">
                    {summary ?? <span className="text-taupe-500">{t.reserve.pickDate}</span>}
                  </p>
                  <Button type="submit" variant="dark" size="lg" loading={mutation.isPending} className="w-full sm:w-auto">
                    {mutation.isPending
                      ? t.reserve.submitting
                      : booking!.requireApproval
                        ? t.reserve.submitRequest
                        : t.reserve.submitBook}
                  </Button>
                </div>
              </>
            )}
          </form>

          <aside className="min-w-0 space-y-4 lg:col-span-4">
            {myUpcoming.length > 0 && (
              <div className="rounded-[1.5rem] bg-white/70 p-5 ring-1 ring-cream-200">
                <h2 className="text-[12px] font-bold tracking-[0.18em] text-taupe-500 uppercase">{t.reserve.recent}</h2>
                <ul className="mt-3 space-y-2">
                  {myUpcoming.map((r) => (
                    <li key={r.reference}>
                      <Link
                        to={`/reservation/${r.token}`}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-cream-200 hover:ring-taupe-300"
                      >
                        <span className="text-sm">
                          <span className="block font-semibold">{ucfirst(formatDateLong(r.date, locale))}</span>
                          <span className="text-taupe-600">
                            {r.time} · {t.reserve.guestsCount(r.partySize)}
                          </span>
                        </span>
                        <ChevronRight className="size-4 text-taupe-400" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-[1.5rem] bg-ink-900 p-6 text-cream-50">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-gold-400" aria-hidden />
                <p className="text-sm leading-relaxed text-cream-100/85">
                  {restaurant.address.street}
                  {restaurant.address.complement ? `, ${restaurant.address.complement}` : ''}
                  <br />
                  {restaurant.address.postalCode} {restaurant.address.city}
                </p>
              </div>
              <div className="mt-4 flex items-start gap-3">
                <Clock className="mt-0.5 size-5 shrink-0 text-gold-400" aria-hidden />
                <Link to="/#infos" className="text-sm text-cream-100/85 underline-offset-4 hover:underline">
                  {t.visit.hours}
                </Link>
              </div>
              <ButtonA href={telHref(restaurant.contact.phone)} variant="outline-light" className="mt-6 w-full">
                <Phone className="size-4.5" aria-hidden />
                {restaurant.contact.phoneDisplay}
              </ButtonA>
            </div>
            <div className="flex items-start gap-3 rounded-[1.5rem] bg-white/60 p-5 text-sm text-taupe-600 ring-1 ring-cream-200">
              <CalendarCheck className="mt-0.5 size-5 shrink-0 text-gold-600" aria-hidden />
              <p>{booking?.requireApproval ? t.reserve.approvalNote : t.reserve.instantNote}</p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
