import { useId } from 'react';
import { cn } from './cn';

/** The small mono caption above a form control. Exported for the rare caption that labels no
 *  single control (a row of chips, a read-only value). */
export const FIELD_LABEL = 'block text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5';

/**
 * One labelled form row, the same on every page (#351).
 *
 * By default the caption is a <label> that WRAPS the control, so it names it: a sibling
 * <label> without htmlFor names nothing, and a screen reader read those fields as unlabeled.
 * Use `as="div"` when the child is a composite widget (a row of buttons, a custom picker)
 * that a label click should not activate; the caption then names the group instead.
 */
export function Field({
  label,
  children,
  hint,
  className,
  as = 'label',
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  /** One line of help under the control. */
  hint?: React.ReactNode;
  className?: string;
  as?: 'label' | 'div';
}) {
  const id = useId();
  const caption = (
    <span id={as === 'div' ? id : undefined} className={FIELD_LABEL} style={{ fontFamily: 'var(--font-mono)' }}>
      {label}
    </span>
  );
  const help = hint ? <span className="block mt-1 text-[11px] text-[color:var(--color-text-faint)]">{hint}</span> : null;
  if (as === 'div') {
    return (
      <div role="group" aria-labelledby={id} className={cn('block min-w-0', className)}>
        {caption}
        {children}
        {help}
      </div>
    );
  }
  return (
    <label className={cn('block min-w-0', className)}>
      {caption}
      {children}
      {help}
    </label>
  );
}
