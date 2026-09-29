import type { StaffEvent, StaffMe } from '@shared/api-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Armchair,
  BellRing,
  BookOpen,
  CalendarDays,
  ExternalLink,
  KeyRound,
  LogOut,
  ReceiptText,
  Settings,
  Users,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router';
import { Logo } from '@/components/brand';
import { Button, cn, Sheet, Spinner, TextField } from '@/components/ui';
import { useToast } from '@/components/toast';
import { api, ApiError, errorMessage, fieldErrors } from '@/lib/api';
import { useI18n } from '@/i18n';
import { LanguageSwitch } from '@/site/SiteLayout';
import { staffKeys, useMe, useOrders, useReservationCounts } from './api';
import { playChime, soundPreference, unlockAudio } from './sound';
import { useStaffT } from './strings';

export type StaffContext = { me: StaffMe; live: boolean; isAdmin: boolean };
export const useStaffContext = () => useOutletContext<StaffContext>();

/** Live updates from the server; returns whether the stream is connected. */
function useStaffEvents(enabled: boolean, onEvent: (e: StaffEvent) => void): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource('/api/staff/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        handler.current(JSON.parse(e.data as string) as StaffEvent);
      } catch {
        /* ignore malformed events */
      }
    };
    return () => {
      es.close();
      setConnected(false);
    };
  }, [enabled]);
  return connected;
}

function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStaffT();
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useMutation({
    mutationFn: () => api('/api/staff/me/password', { body: form }),
    onSuccess: () => {
      toast.show(s.team.passwordChanged, 'success');
      setForm({ currentPassword: '', newPassword: '' });
      onClose();
    },
    onError: (err) => {
      setErrors(fieldErrors(t, err));
      if (!(err instanceof ApiError && err.fields)) toast.show(errorMessage(t, err), 'error');
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title={s.team.changePassword} closeLabel={s.close}>
      <form
        className="space-y-4 px-5 pb-6 sm:px-7"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          change.mutate();
        }}
      >
        <TextField
          label={s.team.currentPassword}
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
          error={errors.currentPassword}
        />
        <TextField
          label={s.team.newPassword}
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
          error={errors.newPassword}
          hint={s.team.passwordHint}
        />
        <Button type="submit" variant="dark" className="w-full" loading={change.isPending}>
          {s.save}
        </Button>
      </form>
    </Sheet>
  );
}

type NavItem = { to: string; label: string; icon: LucideIcon; badge?: number; admin?: boolean; end?: boolean };

export default function StaffApp() {
  const s = useStaffT();
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const me = useMe();
  const [sound, setSound] = useState(soundPreference.get);
  const [accountOpen, setAccountOpen] = useState(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    document.title = `${s.dashboard} · B&B Park`;
  }, [s]);

  const signedIn = !!me.data;
  const live = useStaffEvents(signedIn, (event) => {
    switch (event.type) {
      case 'reservation.created':
        void queryClient.invalidateQueries({ queryKey: staffKeys.reservations });
        toast.show(s.res.newRequest, 'info');
        if (soundRef.current) playChime();
        break;
      case 'reservation.updated':
        void queryClient.invalidateQueries({ queryKey: staffKeys.reservations });
        break;
      case 'order.created':
        void queryClient.invalidateQueries({ queryKey: staffKeys.orders });
        toast.show(s.orders.newOrder(event.tableNumber), 'success');
        if (soundRef.current) playChime();
        break;
      case 'order.updated':
        void queryClient.invalidateQueries({ queryKey: staffKeys.orders });
        break;
      case 'menu.updated':
        void queryClient.invalidateQueries({ queryKey: staffKeys.menu });
        void queryClient.invalidateQueries({ queryKey: ['menu'] });
        break;
      case 'settings.updated':
        void queryClient.invalidateQueries({ queryKey: staffKeys.settings });
        void queryClient.invalidateQueries({ queryKey: ['site'] });
        break;
      case 'tables.updated':
        void queryClient.invalidateQueries({ queryKey: staffKeys.tables });
        break;
    }
  });

  // Any 401 from a staff query means the session expired: go back to the sign-in page.
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((e) => {
        const err = e.query.state.error;
        if (e.type === 'updated' && err instanceof ApiError && err.status === 401 && e.query.queryKey[0] === 'staff') {
          navigate(`/staff/login?next=${encodeURIComponent(pathname)}`, { replace: true });
        }
      }),
    [queryClient, navigate, pathname],
  );

  const counts = useReservationCounts(live, signedIn);
  const openOrders = useOrders('open', live, signedIn);

  const logout = useMutation({
    mutationFn: () => api('/api/staff/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.removeQueries({ queryKey: staffKeys.all });
      navigate('/staff/login', { replace: true });
    },
  });

  if (me.isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-cream-100 text-taupe-500">
        <Spinner label={s.loading} />
      </div>
    );
  }
  if (me.isError || !me.data) return <Navigate to={`/staff/login?next=${encodeURIComponent(pathname)}`} replace />;

  const isAdmin = me.data.role === 'admin';
  const nav: NavItem[] = [
    { to: '/staff', label: s.nav.reservations, icon: CalendarDays, badge: counts.data?.pendingUpcoming, end: true },
    { to: '/staff/orders', label: s.nav.orders, icon: ReceiptText, badge: openOrders.data?.filter((o) => o.status === 'received').length },
    { to: '/staff/tables', label: s.nav.tables, icon: Armchair },
    { to: '/staff/menu', label: s.nav.menu, icon: BookOpen },
    { to: '/staff/settings', label: s.nav.settings, icon: Settings, admin: true },
    { to: '/staff/team', label: s.nav.team, icon: Users, admin: true },
  ].filter((n) => !n.admin || isAdmin);

  const toggleSound = async () => {
    const next = !sound;
    if (next) await unlockAudio().catch(() => undefined);
    soundPreference.set(next);
    setSound(next);
    if (next) playChime();
  };

  const liveBadge = (
    <span className="inline-flex items-center gap-2 text-xs font-semibold" role="status">
      <span className={cn('size-2 rounded-full', live ? 'pulse-dot bg-[#86c778]' : 'bg-terracotta-400')} aria-hidden />
      {live ? s.live : s.reconnecting}
    </span>
  );
  const soundButton = (
    <button
      type="button"
      onClick={() => void toggleSound()}
      aria-pressed={sound}
      title={s.enableSound}
      className={cn('inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold ring-1', sound ? 'bg-gold-400 text-ink-950 ring-gold-400' : 'text-cream-100/80 ring-cream-50/20')}
    >
      {sound ? <BellRing className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
      {sound ? s.soundOn : s.soundOff}
    </button>
  );

  return (
    <div className="min-h-svh bg-cream-100 text-ink-900 lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-svh flex-col bg-ink-950 px-4 py-6 text-cream-50 lg:flex">
        <div className="px-2">
          <Logo className="text-[1.5rem]" />
          <p className="mt-1 text-[11px] font-semibold tracking-[0.2em] text-cream-100/50 uppercase">{s.dashboard}</p>
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label={s.dashboard}>
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition-colors',
                  isActive ? 'bg-cream-50 text-ink-900' : 'text-cream-100/75 hover:bg-cream-50/8 hover:text-cream-50',
                )
              }
            >
              <n.icon className="size-4.5" aria-hidden />
              <span className="flex-1">{n.label}</span>
              {!!n.badge && <span className="min-w-6 rounded-full bg-gold-400 px-1.5 text-center text-xs leading-6 text-ink-950">{n.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          <div className="flex items-center justify-between">
            {liveBadge}
            <LanguageSwitch />
          </div>
          {soundButton}
          <div className="border-t border-cream-50/10 pt-3 text-sm">
            <p className="font-semibold">{me.data.name}</p>
            <p className="truncate text-xs text-cream-100/55">{me.data.email}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-cream-100/70">
              <button type="button" className="inline-flex items-center gap-1.5 hover:text-cream-50" onClick={() => setAccountOpen(true)}>
                <KeyRound className="size-3.5" aria-hidden />
                {s.myPassword}
              </button>
              <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-cream-50">
                <ExternalLink className="size-3.5" aria-hidden />
                {s.viewSite}
              </a>
              <button type="button" className="inline-flex items-center gap-1.5 hover:text-cream-50" onClick={() => logout.mutate()}>
                <LogOut className="size-3.5" aria-hidden />
                {s.signOut}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Top bar (phones & tablets) */}
        <header className="sticky top-0 z-40 bg-ink-950 text-cream-50 lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Logo className="text-[1.25rem]" />
            <div className="flex items-center gap-2">
              {liveBadge}
              <button type="button" onClick={() => void toggleSound()} aria-pressed={sound} aria-label={s.enableSound} className={cn('flex size-9 items-center justify-center rounded-full ring-1', sound ? 'bg-gold-400 text-ink-950 ring-gold-400' : 'ring-cream-50/20')}>
                {sound ? <BellRing className="size-4" /> : <VolumeX className="size-4" />}
              </button>
              <button type="button" onClick={() => logout.mutate()} aria-label={s.signOut} className="flex size-9 items-center justify-center rounded-full ring-1 ring-cream-50/20">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2" aria-label={s.dashboard}>
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold',
                    isActive ? 'bg-cream-50 text-ink-900' : 'text-cream-100/75',
                  )
                }
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
                {!!n.badge && <span className="rounded-full bg-gold-400 px-1.5 text-[11px] leading-5 text-ink-950">{n.badge}</span>}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
          <Outlet context={{ me: me.data, live, isAdmin } satisfies StaffContext} />
        </main>
      </div>
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}
