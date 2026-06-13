'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ArrowLeft } from 'lucide-react';
import { cn } from './cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

const sizes = {
  sm: 'md:w-[440px]',
  md: 'md:w-[600px]',
  lg: 'md:w-[720px]',
  xl: 'md:w-[960px]',
  '2xl': 'md:w-[1140px]',
  full: '',
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const isFull = size === 'full';

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={cn('fixed inset-0 z-50', isFull ? 'bg-[color:var(--color-bg)]' : 'bg-black/70')} />
        <Dialog.Content
          className={cn(
            'fixed z-50 bg-[color:var(--color-surface)] outline-none overflow-y-auto overscroll-contain',
            isFull
              ? 'inset-0 bg-[color:var(--color-bg)]'
              : cn(
                  'border border-[color:var(--color-border)] shadow-2xl',
                  'bottom-0 left-0 right-0 rounded-t-2xl max-h-[92vh]',
                  'md:bottom-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:right-auto md:rounded-2xl md:max-h-[90vh]',
                  sizes[size]
                )
          )}
        >
          {isFull ? (
            <>
              {/* Full-screen header with back button */}
              <div className="sticky top-0 z-10 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg)]/90 backdrop-blur-xl">
                <div className="max-w-[1000px] mx-auto px-4 py-3 flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="flex items-center gap-1.5 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] transition-colors"
                  >
                    <ArrowLeft size={18} /> Back
                  </button>
                  {title && (
                    <>
                      <span className="text-[color:var(--color-border-light)] select-none">/</span>
                      <Dialog.Title className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-display)' }}>
                        {title}
                      </Dialog.Title>
                    </>
                  )}
                </div>
              </div>
              <div className="max-w-[1000px] mx-auto px-4 py-6">{children}</div>
            </>
          ) : (
            <>
              {title && (
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
                  <Dialog.Title className="text-base font-semibold truncate pr-4" style={{ fontFamily: 'var(--font-display)' }}>
                    {title}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="shrink-0 p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="px-4 py-5 md:px-6">{children}</div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
