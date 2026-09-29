'use client';
import { useState, useTransition } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Plus, X, Loader2 } from 'lucide-react';
import { cur } from '@/lib/money';
import { useT, useMoney } from '@/components/LocaleProvider';
import { saveAssetAccounts } from '@/app/settings/actions';

export function AssetAccountsModal({
  open,
  onClose,
  initialAccounts = {},
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initialAccounts?: Record<string, number>;
  onSaved?: () => void;
}) {
  const t = useT();
  const money = useMoney();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Array<{ name: string; balance: string }>>(() => {
    const existing = Object.entries(initialAccounts).map(([name, balance]) => ({
      name,
      balance: String(balance),
    }));
    return existing.length ? existing : [{ name: '', balance: '' }];
  });
  const [msg, setMsg] = useState<string | null>(null);

  const total = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);

  function handleSave() {
    setMsg(null);
    const out: Record<string, number> = {};
    for (const r of rows) {
      const n = Number(r.balance);
      if (r.name.trim()) out[r.name.trim()] = Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    startTransition(async () => {
      const res = await saveAssetAccounts(out);
      if (res.ok) {
        setMsg(t('common.savedOk'));
        if (onSaved) onSaved();
        setTimeout(() => {
          setMsg(null);
          onClose();
        }, 600);
      } else {
        setMsg(t('common.failed'));
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={t('set.accountsTitle')} size="md">
      <div className="p-5 space-y-4">
        <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.accountsDesc')}</p>

        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={r.name}
                onChange={(e) =>
                  setRows((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
                placeholder={t('set.accountNamePlaceholder')}
                className="flex-1 min-w-0 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
              />
              <label className="flex items-center gap-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5">
                <span className="text-[10px] text-[color:var(--color-text-faint)]">{cur()}</span>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={r.balance}
                  onChange={(e) =>
                    setRows((p) => p.map((x, j) => (j === i ? { ...x, balance: e.target.value } : x)))
                  }
                  placeholder="0"
                  className="w-24 bg-transparent text-right text-xs text-[color:var(--color-text)] focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-colors p-1"
                title={t('common.delete')}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[color:var(--color-border)]">
          <button
            type="button"
            onClick={() => setRows((p) => [...p, { name: '', balance: '' }])}
            className="flex items-center gap-1 text-xs text-[color:var(--color-cyan)] hover:text-[color:var(--color-accent)] transition-colors"
          >
            <Plus size={13} /> {t('set.addAccount')}
          </button>
          <div className="text-xs font-mono text-[color:var(--color-text-dim)]">
            {t('set.accountsTotal', { amount: money(total) })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          {msg && (
            <span className="text-xs text-[color:var(--color-accent)] font-mono mr-auto">{msg}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[color:var(--color-border)] text-xs text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : null}
            {t('set.saveAccounts')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
