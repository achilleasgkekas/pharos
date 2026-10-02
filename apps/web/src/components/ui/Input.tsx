'use client';
import { forwardRef } from 'react';
import { cn } from './cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

/** The one field look (#351): border, radius, fill and focus colour of every input, select,
 *  textarea, date field and searchable dropdown. */
export const fieldBase =
  'w-full min-w-0 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)] rounded-[10px] text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-faint)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, className, ...props }, ref) => {
    if (icon) {
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-faint)]">
            {icon}
          </span>
          <input ref={ref} className={cn(fieldBase, 'pl-9 pr-3 h-10', className)} {...props} />
        </div>
      );
    }
    return <input ref={ref} className={cn(fieldBase, 'px-3 py-2 min-h-10', className)} {...props} />;
  }
);
Input.displayName = 'Input';

/**
 * The same look for a control that is not an <Input>: a native <select>, a <textarea>, a
 * DateInput (#351). Use it instead of a page-local class string, so every form field on every
 * page has one border, one padding and one focus colour.
 */
export const controlClass = cn(fieldBase, 'px-3 py-2 min-h-10');

/** A dense control for a table row or a small popover (a transaction line, a picker search). */
export const compactControlClass = cn(fieldBase, 'px-2.5 py-1.5 min-h-8 text-xs');

/** The control of the filter bar and panel (sort, category): same look, same height as the
 *  search box beside it. */
export const filterControlClass = cn(fieldBase, 'px-3 h-10 text-sm');
