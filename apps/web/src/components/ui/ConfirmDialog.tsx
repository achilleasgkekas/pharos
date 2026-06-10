'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

type ConfirmOptions = {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(
    null
  );

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    []
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal open onClose={() => close(false)} title={state.opts.title ?? 'Confirm'} size="sm">
          {state.opts.message && (
            <p className="text-sm text-[color:var(--color-text-dim)] mb-5">{state.opts.message}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => close(false)}>
              {state.opts.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={state.opts.danger ? 'danger' : 'primary'}
              onClick={() => close(true)}
              autoFocus
            >
              {state.opts.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
