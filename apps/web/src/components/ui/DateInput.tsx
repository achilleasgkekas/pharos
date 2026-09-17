'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useLocale, useT } from '@/components/LocaleProvider';
import { formatIsoDate, parseLocaleDate, datePlaceholder } from '@/lib/dateInput';
import { cn } from './cn';

interface DateInputProps {
  /** ISO `YYYY-MM-DD`, or '' for no date. Same contract as a native date input's value. */
  value: string;
  onValueChange: (iso: string) => void;
  required?: boolean;
  name?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

const base =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-faint)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors pl-4 pr-9 py-2';

/**
 * Date field that shows the APP's locale order (ΗΗ/ΜΜ/ΕΕΕΕ in Greek) instead of the operating
 * system's, which is what a native date input does (#3). Typing is the primary path; the
 * calendar button opens the browser's own picker on a hidden native input, because a picker
 * grid has no field order to get wrong and re-implementing one is not worth the weight.
 */
export function DateInput({ value, onValueChange, required, name, id, className, disabled }: DateInputProps) {
  const locale = useLocale();
  const t = useT();
  const [text, setText] = useState(() => formatIsoDate(value, locale));
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  // The last ISO value this field emitted. A `value` prop that differs came from outside
  // (form reset, AI suggestion), so the text is rewritten; one that matches is our own echo,
  // and rewriting then would wipe a half-typed date on every keystroke.
  const emitted = useRef(value);

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(formatIsoDate(value, locale));
    }
  }, [value, locale]);

  const parsed = parseLocaleDate(text, locale);

  useEffect(() => {
    textRef.current?.setCustomValidity(parsed === null ? t('date.invalid') : '');
  }, [parsed, t]);

  function emit(iso: string) {
    emitted.current = iso;
    if (iso !== value) onValueChange(iso);
  }

  return (
    <div className="relative">
      <input
        ref={textRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={text}
        placeholder={datePlaceholder(locale, {
          day: t('date.placeholderDay'), month: t('date.placeholderMonth'), year: t('date.placeholderYear'),
        })}
        aria-invalid={parsed === null || undefined}
        className={cn(base, className)}
        onChange={(e) => {
          setText(e.target.value);
          // An unfinished date emits '' so the form never submits the stale previous value;
          // the custom validity above is what tells the user why.
          emit(parseLocaleDate(e.target.value, locale) ?? '');
        }}
        onBlur={() => { if (parsed) setText(formatIsoDate(parsed, locale)); }}
      />
      {/* Carries `name` so a FormData-based form still receives the ISO value. */}
      <input
        ref={pickerRef}
        type="date"
        name={name}
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        value={value}
        className="absolute right-0 bottom-0 w-px h-px opacity-0 pointer-events-none"
        onChange={(e) => {
          emit(e.target.value);
          setText(formatIsoDate(e.target.value, locale));
        }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={t('date.openCalendar')}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"
        onClick={() => {
          try { pickerRef.current?.showPicker(); } catch { textRef.current?.focus(); }
        }}
      >
        <CalendarDays size={14} />
      </button>
    </div>
  );
}
