import type { StaffUser } from '@shared/api-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Notice, Sheet, Spinner, TextField } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { formatInstant } from '@/lib/format';
import { useSite } from '@/lib/queries';
import { staffKeys, useUsers } from './api';
import { Badge, PageHeader, Select } from './kit';
import { useStaffContext } from './StaffApp';
import { useStaffT } from './strings';

function UserSheet({ mode, onClose }: { mode: { kind: 'new' } | { kind: 'password'; user: StaffUser } | null; onClose: () => void }) {
  const s = useStaffT();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setForm({ name: '', email: '', role: 'staff', password: '' });
    setErrors({});
  }, [mode]);

  const save = useMutation({
    mutationFn: () =>
      mode?.kind === 'password'
        ? api(`/api/staff/users/${mode.user.id}`, { method: 'PATCH', body: { password: form.password } })
        : api('/api/staff/users', { body: form }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.users });
      toast.show(mode?.kind === 'password' ? s.team.passwordChanged : s.team.created, 'success');
      onClose();
    },
    onError: (err) => {
      const f = fieldErrors(t, err);
      setErrors(f);
      if (Object.keys(f).length === 0) toast.show(errorMessage(t, err), 'error');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Sheet open={!!mode} onClose={onClose} title={mode?.kind === 'password' ? `${s.team.resetPassword} — ${mode.user.name}` : s.team.add} closeLabel={s.close}>
      <form onSubmit={submit} noValidate className="space-y-4 px-5 pb-6 sm:px-7">
        {mode?.kind === 'new' && (
          <>
            <TextField label={s.team.name} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} />
            <TextField label={s.team.email} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} />
            <Select label={s.team.role} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="staff">{s.team.roles.staff}</option>
              <option value="admin">{s.team.roles.admin}</option>
            </Select>
          </>
        )}
        <TextField
          label={s.team.password}
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          error={errors.password}
          hint={s.team.passwordHint}
        />
        <Button type="submit" variant="dark" className="w-full" loading={save.isPending}>
          {s.save}
        </Button>
      </form>
    </Sheet>
  );
}

export default function TeamPage() {
  const s = useStaffT();
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me, isAdmin } = useStaffContext();
  const users = useUsers();
  const site = useSite();
  const [mode, setMode] = useState<{ kind: 'new' } | { kind: 'password'; user: StaffUser } | null>(null);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: object }) => api(`/api/staff/users/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: staffKeys.users }),
    onError: (err) => toast.show(errorMessage(t, err), 'error'),
  });

  if (!isAdmin) return <Notice tone="warn">{s.adminOnly}</Notice>;
  return (
    <>
      <PageHeader title={s.team.title} intro={s.team.intro}>
        <Button variant="dark" onClick={() => setMode({ kind: 'new' })}>
          <Plus className="size-4" aria-hidden />
          {s.team.add}
        </Button>
      </PageHeader>
      {users.isPending ? (
        <Spinner className="text-taupe-500" label={s.loading} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {(users.data ?? []).map((u) => (
            <li key={u.id} className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-cream-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">
                    {u.name} {u.id === me.id && <span className="text-sm font-normal text-taupe-500">({s.team.you})</span>}
                  </p>
                  <p className="text-sm text-taupe-600">{u.email}</p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={u.role === 'admin' ? 'dark' : 'neutral'}>{s.team.roles[u.role]}</Badge>
                  <Badge tone={u.active ? 'green' : 'red'}>{u.active ? s.team.active : s.team.inactive}</Badge>
                </div>
              </div>
              <p className="mt-2 text-xs text-taupe-500">
                {s.team.lastLogin} : {u.lastLoginAt ? formatInstant(u.lastLoginAt, site.data?.timeZone ?? 'Africa/Casablanca', locale) : s.team.never}
              </p>
              {u.id !== me.id && (
                <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-cream-200 pt-4">
                  <div className="w-44">
                    <Select label={s.team.role} hideLabel value={u.role} onChange={(e) => update.mutate({ id: u.id, patch: { role: e.target.value } })} className="h-9 text-sm">
                      <option value="staff">{s.team.roles.staff}</option>
                      <option value="admin">{s.team.roles.admin}</option>
                    </Select>
                  </div>
                  <Button variant="outline-dark" size="sm" onClick={() => setMode({ kind: 'password', user: u })}>
                    <KeyRound className="size-4" aria-hidden />
                    {s.team.resetPassword}
                  </Button>
                  <Button variant="ghost" size="sm" className={u.active ? 'text-terracotta-600' : ''} onClick={() => update.mutate({ id: u.id, patch: { active: !u.active } })}>
                    {u.active ? s.team.deactivate : s.team.activate}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <UserSheet mode={mode} onClose={() => setMode(null)} />
    </>
  );
}
