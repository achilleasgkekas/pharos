'use client';
import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { User as UserIcon, Lock, ArrowRight } from 'lucide-react';
import { loginAction } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PharosMark } from '@/components/PharosMark';
import { useT } from '@/components/LocaleProvider';

// Only follow same-origin paths, never protocol-relative (//evil.com) or absolute URLs.
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await loginAction(fd);
      if (res.ok) {
        router.replace(safeNext(params.get('next')));
        router.refresh();
      } else {
        setError(res.error || t('login.failed'));
      }
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-7">
          <PharosMark size={48} className="text-[color:var(--color-accent)]" />
          <h1
            className="mt-3 tracking-[0.18em] uppercase text-xl"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
          >
            Pharos
          </h1>
          <p className="text-xs text-[color:var(--color-text-faint)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('login.tagline')}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 flex flex-col gap-3"
        >
          <label className="text-xs font-medium text-[color:var(--color-text-dim)]">{t('set.username')}</label>
          <Input name="username" autoFocus autoComplete="username" icon={<UserIcon size={15} />} placeholder={t('login.userPlaceholder')} />
          <label className="text-xs font-medium text-[color:var(--color-text-dim)] mt-1">{t('set.password')}</label>
          <Input name="password" type="password" autoComplete="current-password" icon={<Lock size={15} />} placeholder="••••••••" />

          {error && <p className="text-xs text-[color:var(--color-red)] mt-1">{error}</p>}

          <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-3 justify-center">
            {pending ? t('login.signingIn') : t('login.signIn')} <ArrowRight size={16} />
          </Button>
        </form>
      </div>
    </main>
  );
}
