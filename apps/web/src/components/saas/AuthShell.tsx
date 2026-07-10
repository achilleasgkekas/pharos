// Presentational, server-safe wrapper for the SaaS auth pages (login/signup). Centered card on
// the Pharos ambient background, styled ONLY with the existing design tokens (var(--color-*))
// — no shared CSS/globals touched, no client JS. The interactive form is passed as children.
import type { ReactNode } from 'react';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-bg)] px-4 py-10 text-[color:var(--color-text)]">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="font-display text-lg font-bold uppercase tracking-[0.3em] text-[color:var(--color-accent)]">
            Pharos
          </span>
        </div>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-2xl">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-[color:var(--color-text-dim)]">{subtitle}</p>
          )}
          <div className="mt-5">{children}</div>
        </div>
        {footer && (
          <p className="mt-5 text-center text-sm text-[color:var(--color-text-dim)]">{footer}</p>
        )}
      </div>
    </div>
  );
}
