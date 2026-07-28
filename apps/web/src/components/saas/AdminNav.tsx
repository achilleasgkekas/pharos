'use client';
// Console nav for the SaaS superadmin shell. Client-only for the active-link highlight
// (usePathname). Links are additive as console pages land. Purely presentational — the actual
// authorization is enforced server-side by requireSuperadminPage() in the /admin layout and
// each page.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/tenants', label: 'Workspaces' },
  { href: '/admin/audit', label: 'Activity' },
];

/** Overview matches exactly; section links (e.g. /admin/tenants) also match their sub-paths. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={[
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-[color:var(--color-surface-2)] text-[color:var(--color-text)]'
                : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]',
            ].join(' ')}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
