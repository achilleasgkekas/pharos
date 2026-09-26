'use client';
import { forwardRef } from 'react';
import { cn } from './cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const base =
  'w-full min-w-0 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-faint)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, className, ...props }, ref) => {
    if (icon) {
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-faint)]">
            {icon}
          </span>
          <input ref={ref} className={cn(base, 'pl-9 pr-3 py-2', className)} {...props} />
        </div>
      );
    }
    return <input ref={ref} className={cn(base, 'px-3 py-2', className)} {...props} />;
  }
);
Input.displayName = 'Input';

/**
 * The same look for a control that is not an <Input>: a native <select>, a <textarea>, a
 * DateInput (#351). Use it instead of a page-local class string, so every form field on every
 * page has one border, one padding and one focus colour.
 */
export const controlClass = cn(base, 'px-3 py-2');

/** A dense control for a table row or a small popover (a transaction line, a picker search). */
export const compactControlClass = cn(base, 'px-2.5 py-1.5 text-xs');

/** The smaller control of the filter sidebar (sort, category): same look, one step down. */
export const filterControlClass = cn(base, 'px-3 py-1.5 text-xs text-[color:var(--color-text-dim)]');
