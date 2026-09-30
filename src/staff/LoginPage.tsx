import { loginSchema } from '@shared/schemas';
import type { StaffMe } from '@shared/api-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Logo } from '@/components/brand';
import { Button, Notice, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { LanguageSwitch } from '@/site/SiteLayout';
import { staffKeys } from './api';
import { useStaffT } from './strings';

export default function LoginPage() {
  const s = useStaffT();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const next = params.get('next')?.startsWith('/staff') ? params.get('next')! : '/staff';

  useEffect(() => {
    document.title = `${s.login.title} · B&B Park`;
  }, [s]);

  const login = useMutation({
    mutationFn: () => api<StaffMe>('/api/staff/login', { body: loginSchema.parse({ email, password }) }),
    onSuccess: (me) => {
      queryClient.setQueryData(staffKeys.me, me);
      navigate(next, { replace: true });
    },
    onError: (err) => setError(errorMessage(t, err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError(t.fields.email_required!);
    login.mutate();
  };

  return (
    <div className="grain flex min-h-svh items-center justify-center bg-ink-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between text-cream-50">
          <Logo />
          <LanguageSwitch />
        </div>
        <form onSubmit={submit} noValidate className="rounded-[2rem] bg-cream-50 p-7 shadow-lift sm:p-9">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-ink-900 text-gold-400">
            <Lock className="size-5" aria-hidden />
          </span>
          <h1 className="font-display mt-5 text-4xl font-medium">{s.login.title}</h1>
          <p className="mt-2 text-sm text-taupe-600">{s.login.intro}</p>
          <div className="mt-7 space-y-4">
            <TextField label={s.login.email} type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextField
              label={s.login.password}
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <Notice tone="error" className="mt-5">
              {error}
            </Notice>
          )}
          <Button type="submit" variant="dark" size="lg" className="mt-7 w-full" loading={login.isPending}>
            {s.login.submit}
          </Button>
        </form>
        <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm text-cream-100/70 hover:text-cream-50">
          <ArrowLeft className="size-4" aria-hidden />
          {s.login.back}
        </Link>
      </div>
    </div>
  );
}
