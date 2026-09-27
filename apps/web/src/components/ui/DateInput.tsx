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
  /** ISO bounds for the calendar picker (a date-range filter keeps from ≤ to). */
  min?: string;
  max?: string;
  'aria-label'?: string;
  /**
   * A filter, not a form (#355): keep the last complete date while the user types a new one,
   * instead of emitting '' on every unfinished keystroke (which switched a filter off and made
   * the list jump). Clearing the field still emits ''.
   */
  keepWhileTyping?: boolean;
}

const base =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-faint)] focus:outline-none focus:border-[color:var(--color-accent)] transition-colors pl-3 pr-9 py-2';

/**
 * Date field that shows the APP's locale order (ΗΗ/ΜΜ/ΕΕΕΕ in Greek) instead of the operating
 * system's, which is what a native date input does (#3). Typing is the primary path; the
 * calendar button opens the browser's own picker on a hidden native input, because a picker
 * grid has no field order to get wrong and re-implementing one is not worth the weight.
 */
export function DateInput({ value, onValueChange, required, name, id, className, disabled, min, max, 'aria-label': ariaLabel, keepWhileTyping }: DateInputProps) {
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
  // #355: min and max used to bind only the calendar popup; a typed date ignored them.
  const problem =
    parsed === null ? t('date.invalid')
    : parsed && min && parsed < min ? t('date.beforeMin', { date: formatIsoDate(min, locale) })
    : parsed && max && parsed > max ? t('date.afterMax', { date: formatIsoDate(max, locale) })
    : '';

  useEffect(() => {
    textRef.current?.setCustomValidity(problem);
  }, [problem]);

  function emit(iso: string) {
    emitted.current = iso;
    if (iso !== value) onValueChange(iso);
  }

  return (
    <div className="relative">
      <input
        ref={textRef}
        id={id}
        aria-label={ariaLabel}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={text}
        placeholder={datePlaceholder(locale, {
          day: t('date.placeholderDay'), month: t('date.placeholderMonth'), year: t('date.placeholderYear'),
        })}
        aria-invalid={problem ? true : undefined}
        title={problem || undefined}
        className={cn(base, className)}
        onChange={(e) => {
          setText(e.target.value);
          // An unfinished date emits '' so the form never submits the stale previous value;
          // the custom validity above is what tells the user why. A filter keeps its value.
          const next = parseLocaleDate(e.target.value, locale);
          if (next === null && keepWhileTyping) return;
          emit(next ?? '');
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
        min={min}
        max={max}
        // Covers the whole field (invisible, not clickable) so showPicker() opens the calendar
        // under the field, not off its bottom-right corner (#355).
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
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
