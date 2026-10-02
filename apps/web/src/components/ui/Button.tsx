'use client';
import { forwardRef } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:   'bg-[color:var(--color-accent)] text-[color:var(--color-on-accent)] hover:brightness-110',
  secondary: 'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)] text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-3)]',
  ghost:     'text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-text)]',
  danger:    'bg-[color:var(--color-red)]/13 border border-[color:var(--color-red)]/25 text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/19',
};

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 h-8',
  md: 'text-sm px-4 h-10',
  lg: 'text-base px-5 h-11',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
Button.displayName = 'Button';
