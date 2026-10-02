'use client';
import { useState } from 'react';
import { Globe, Plus, Trash2, RotateCcw, AlertCircle } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/Input';
import { cn } from '@/components/ui/cn';
import { addShopToList, SHOPPING_PRESETS } from '@/lib/shoppingRegion';

interface ForeignShopsEditorProps {
  country: string;
  countryLabel: string;
  shops: string[];
  onChange: (shops: string[]) => void;
}

export function ForeignShopsEditor({
  country,
  countryLabel,
  shops,
  onChange,
}: ForeignShopsEditorProps) {
  const t = useT();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const presetShops = country ? SHOPPING_PRESETS[country]?.extraShops ?? [] : [];
  const suggestions = presetShops.filter((p) => !shops.includes(p));

  function handleAdd() {
    setError(null);
    if (!input.trim()) return;
    const res = addShopToList(shops, input);
    if (res.ok) {
      onChange(res.shops);
      setInput('');
    } else {
      if (res.error === 'invalid') setError(t('set.shopInvalid'));
      else if (res.error === 'duplicate') setError(t('set.shopDuplicate'));
      else if (res.error === 'limit') setError(t('set.shopLimitReached'));
    }
  }

  function handleRemove(host: string) {
    onChange(shops.filter((s) => s !== host));
    setError(null);
  }

  function handleReset() {
    onChange([...presetShops]);
    setError(null);
  }

  function addSuggestion(host: string) {
    const res = addShopToList(shops, host);
    if (res.ok) {
      onChange(res.shops);
      setError(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span
          className="font-medium text-[color:var(--color-text-dim)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('set.shoppingExtraShops')}
        </span>
        <div className="flex items-center gap-3">
          <span
            className="text-[11px] text-[color:var(--color-text-faint)] tabular-nums"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('set.shopCount', { n: shops.length, max: 20 })}
          </span>
          {country && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-[11px] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] transition-colors"
            >
              <RotateCcw size={11} /> {t('set.resetShops')}
            </button>
          )}
        </div>
      </div>

      {/* Shop rows */}
      <div className="space-y-1.5 max-h-56 overflow-y-auto overscroll-contain pr-0.5">
        {shops.length === 0 ? (
          <p className="text-xs text-[color:var(--color-text-faint)] italic py-2">
            {t('set.shoppingExtraShopsHint')}
          </p>
        ) : (
          shops.map((shop) => (
            <div
              key={shop}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-xs transition-colors hover:border-[color:var(--color-border-light)]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Globe size={14} className="text-[color:var(--color-accent)] shrink-0" />
                <span
                  className="font-medium text-[color:var(--color-text)] truncate"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {shop}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(shop)}
                className="p-1 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] hover:bg-[color:var(--color-surface-2)] transition-colors shrink-0"
                aria-label={t('common.remove')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add shop input */}
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={t('set.addShopPlaceholder')}
            className={cn(controlClass, 'flex-1')}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            disabled={!input.trim() || shops.length >= 20}
          >
            <Plus size={14} /> {t('set.addShop')}
          </Button>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-[color:var(--color-red)] pt-0.5">
            <AlertCircle size={13} className="shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>

      {/* Suggestions for current country */}
      {suggestions.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] text-[color:var(--color-text-faint)] mb-1.5">
            {t('set.shopPresetSuggestions', { country: countryLabel })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((sug) => (
              <button
                type="button"
                key={sug}
                onClick={() => addSuggestion(sug)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[11px] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)]/40 transition-colors"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Plus size={11} /> {sug}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
