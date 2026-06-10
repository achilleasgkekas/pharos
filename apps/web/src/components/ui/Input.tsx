'use client';
import { forwardRef } from 'react';
import { cn } from './cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

const base =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-faint)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, className, ...props }, ref) => {
    if (icon) {
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-faint)]">
            {icon}
          </span>
          <input ref={ref} className={cn(base, 'pl-9 pr-4 py-2', className)} {...props} />
        </div>
      );
    }
    return <input ref={ref} className={cn(base, 'px-4 py-2', className)} {...props} />;
  }
);
Input.displayName = 'Input';
