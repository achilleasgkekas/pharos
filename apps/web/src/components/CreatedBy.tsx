'use client';
import { createContext, useContext } from 'react';
import { useT } from '@/components/LocaleProvider';
import { cn } from '@/components/ui/cn';

// P75 (#20): user id -> display name, loaded once in the root layout. Null (the default, and
// what a single-user instance gets) makes every <CreatedBy> render nothing.
const AttributionContext = createContext<Record<string, string> | null>(null);

export function AttributionProvider({ names, children }: { names: Record<string, string> | null; children: React.ReactNode }) {
  return <AttributionContext.Provider value={names}>{children}</AttributionContext.Provider>;
}

/** The name of whoever created a record, or null when it should not be shown. */
export function useCreatedByName(id: string | null | undefined): string | null {
  const names = useContext(AttributionContext);
  if (!names || !id) return null;
  return names[id] || null; // a deleted account reads as unknown, not as a raw id
}

/** "Added by Maria". Renders nothing on a single-user instance or for an unknown author. */
export function CreatedBy({ id, className }: { id: string | null | undefined; className?: string }) {
  const t = useT();
  const name = useCreatedByName(id);
  if (!name) return null;
  return (
    <span className={cn('text-[10px] text-[color:var(--color-text-faint)]', className)} style={{ fontFamily: 'var(--font-mono)' }}>
      {t('common.addedBy', { name })}
    </span>
  );
}
