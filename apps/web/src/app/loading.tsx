// Shown the moment a page is opened, while its data loads on the server, so a click in
// the menu always answers at once instead of leaving the old page up.
import { PAGE_MAIN } from '@/components/ui/PageHeader';

const bar = 'rounded-lg bg-[color:var(--color-surface-2)]';

export default function Loading() {
  return (
    <main className={PAGE_MAIN} aria-busy="true">
      <div className="animate-pulse">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className={`h-8 w-48 ${bar}`} />
            <div className={`h-4 w-32 ${bar}`} />
          </div>
          <div className={`h-10 w-28 ${bar}`} />
        </div>
        <div className="mb-4 flex gap-2">
          {[0, 1, 2].map((i) => <div key={i} className={`h-8 w-24 ${bar}`} />)}
        </div>
        <div className="overflow-hidden rounded-2xl border border-[color:var(--color-border)]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-[color:var(--color-border)] px-4 py-3.5 last:border-0">
              <div className={`h-9 w-9 shrink-0 rounded-xl bg-[color:var(--color-surface-2)]`} />
              <div className="flex-1 space-y-1.5">
                <div className={`h-3.5 w-2/5 ${bar}`} />
                <div className={`h-3 w-1/4 ${bar}`} />
              </div>
              <div className={`h-4 w-16 ${bar}`} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
