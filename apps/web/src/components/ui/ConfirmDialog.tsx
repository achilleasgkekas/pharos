'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Field } from './Field';
import { Input } from './Input';
import { useT } from '@/components/LocaleProvider';

type ConfirmOptions = {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

type PromptOptions = {
  title: string;
  message?: string;
  /** Caption above the text field. */
  label: string;
  /** 'password' hides what is typed (a backup passphrase, a new password). */
  type?: 'text' | 'password';
  confirmLabel?: string;
  /** The OK button stays disabled until the value is at least this long. */
  minLength?: number;
  defaultValue?: string;
};

/** Resolves to the typed value, or null when cancelled: the app's own text prompt. */
type PromptFn = (opts: PromptOptions) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);
const PromptContext = createContext<PromptFn>(async () => null);

export const useConfirm = () => useContext(ConfirmContext);
export const usePrompt = () => useContext(PromptContext);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(
    null
  );
  const [ask, setAsk] = useState<{ opts: PromptOptions; resolve: (v: string | null) => void } | null>(null);
  const [value, setValue] = useState('');

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    []
  );
  const prompt = useCallback<PromptFn>(
    (opts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? '');
        setAsk({ opts, resolve });
      }),
    []
  );

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };
  const answer = (v: string | null) => {
    ask?.resolve(v);
    setAsk(null);
    setValue('');
  };
  const tooShort = !!ask?.opts.minLength && value.length < ask.opts.minLength;

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={prompt}>
        {children}
        {state && (
          <Modal open onClose={() => close(false)} title={state.opts.title ?? t('common.confirm')} size="sm">
            {state.opts.message && (
              <p className="text-sm text-[color:var(--color-text-dim)] mb-5">{state.opts.message}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => close(false)}>
                {state.opts.cancelLabel ?? t('common.cancel')}
              </Button>
              <Button
                variant={state.opts.danger ? 'danger' : 'primary'}
                onClick={() => close(true)}
                autoFocus
              >
                {state.opts.confirmLabel ?? t('common.confirm')}
              </Button>
            </div>
          </Modal>
        )}
        {ask && (
          <Modal open onClose={() => answer(null)} title={ask.opts.title} size="sm">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!tooShort) answer(value);
              }}
            >
              {ask.opts.message && <p className="text-sm text-[color:var(--color-text-dim)]">{ask.opts.message}</p>}
              <Field label={ask.opts.label}>
                <Input
                  type={ask.opts.type ?? 'text'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoComplete={ask.opts.type === 'password' ? 'new-password' : 'off'}
                  autoFocus
                />
              </Field>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" onClick={() => answer(null)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" variant="primary" disabled={tooShort}>
                  {ask.opts.confirmLabel ?? t('common.continue')}
                </Button>
              </div>
            </form>
          </Modal>
        )}
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  );
}
