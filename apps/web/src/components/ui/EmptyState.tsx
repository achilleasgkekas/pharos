import { cn } from './cn';

/**
 * What a page shows when its list is empty (#351): the page's own nav icon, one line saying
 * why, and an optional hint or action. One look everywhere, instead of an emoji on some pages
 * (which renders differently per OS) and a bordered box on others.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  /** The lucide icon of the page, as in the nav: <Wallet size={40} />. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('py-20 px-4 text-center text-[color:var(--color-text-faint)]', className)}>
      {icon && <div className="mb-3 flex justify-center opacity-40 [&>svg]:h-10 [&>svg]:w-10">{icon}</div>}
      <p className="text-sm text-[color:var(--color-text-dim)] max-w-md mx-auto">{title}</p>
      {hint && <p className="mt-1 text-xs max-w-md mx-auto">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
