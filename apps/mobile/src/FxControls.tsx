// Multi-currency UI (P9), mobile mirror of the web's <FxBadge> and the Expenses form's
// <FxFields>. Shared rather than screen-local because the same two controls belong on every
// money screen (expenses/income first, then bills, subscriptions, statements).
import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { C, RADIUS, SIZE, SPACE, alpha } from './theme';
import { Chip, Input, CUR } from './ui';
import { convertToBase, deriveFxRate, fxBadgeLabel, isForeign, needsRate, normalizeCurrency } from './fx';

/** Codes offered as one-tap chips (the web's CURRENCIES list); any other code can be typed. */
export const CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'CAD', 'AUD', 'JPY', 'INR'];

/**
 * What the paper said, e.g. `$88.00 @ 0.92`. Purple when the rate is known (the amount next
 * to it IS converted), gold when it is still missing, because then the number sitting in the
 * app's totals is a foreign one. Renders nothing for an ordinary base-currency record, so it
 * can be dropped into a row unconditionally.
 */
export function FxBadge({
  doc,
  base,
}: {
  doc: { currency?: string | null; origAmount?: number | null; fxRate?: number | null };
  base: string;
}) {
  const label = fxBadgeLabel(doc, base);
  if (!label) return null;
  const warn = needsRate(doc, base);
  return (
    <Text style={[s.badge, warn ? s.badgeWarn : s.badgeOk]}>{warn ? `${label} ⚠` : label}</Text>
  );
}

/**
 * Currency picker + exchange rate for one money form.
 *
 * `amount` is the PRINTED figure the user is typing (what the bill says); the server converts
 * it. Two ways in, because someone reading a card statement knows the charged total but not
 * the rate: type the rate, or type what the account was actually debited and let
 * deriveFxRate() back it out. The preview line is the number that will be stored.
 *
 * Render it only when the deployment has multi-currency on; the rate row hides itself while
 * the selected code IS the base one, so a normal entry sees just the currency chips.
 */
export function FxFields({
  amount,
  currency,
  fxRate,
  base,
  onChange,
}: {
  amount: number;
  currency: string;
  fxRate: string;
  base: string;
  onChange: (p: { currency?: string; fxRate?: string }) => void;
}) {
  // What the account was debited, if the user chose to enter that instead of a rate. Local:
  // it is an input INTO the rate, never a stored field.
  const [charged, setCharged] = useState('');
  const baseCode = normalizeCurrency(base) || 'EUR';
  const code = normalizeCurrency(currency) || baseCode;
  const foreign = isForeign(code, baseCode);
  const rate = Number(fxRate) || 0;
  // Base first, then the rest — the common case is one tap away.
  const codes = [baseCode, ...CURRENCY_CODES.filter((c) => c !== baseCode)];
  return (
    <View style={foreign ? s.box : undefined}>
      <Text style={s.label}>CURRENCY</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chips}>
        {codes.map((c) => (
          <Chip
            key={c}
            label={`${CUR[c] ? CUR[c].trim() + ' ' : ''}${c}`}
            on={c === code}
            // Back to base = no longer foreign, so the rate must go with it (leaving a stale
            // rate behind would silently reconvert the next save).
            onPress={() => onChange(c === baseCode ? { currency: c, fxRate: '' } : { currency: c })}
          />
        ))}
      </ScrollView>
      {foreign && (
        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.label}>{`RATE (1 ${code} → ${baseCode})`}</Text>
            <Input
              variant="modal"
              value={fxRate}
              onChangeText={(v) => { setCharged(''); onChange({ fxRate: v }); }}
              keyboardType="decimal-pad"
              placeholder="0.92"
            />
          </View>
          <View style={s.col}>
            <Text style={s.label}>{`CHARGED (${CUR[baseCode] || baseCode})`}</Text>
            <Input
              variant="modal"
              value={charged}
              onChangeText={(v) => {
                setCharged(v);
                const derived = deriveFxRate(amount, parseFloat(v.replace(',', '.')) || 0);
                onChange({ fxRate: derived ? String(derived) : '' });
              }}
              keyboardType="decimal-pad"
              placeholder="81.20"
            />
          </View>
        </View>
      )}
      {foreign && (
        <Text style={rate > 0 ? s.previewOk : s.previewWarn}>
          {rate > 0
            ? `= ${CUR[baseCode] || baseCode + ' '}${convertToBase(amount, rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `⚠ no rate yet — this will count as ${baseCode} until you add one`}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  badge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm, overflow: 'hidden' },
  badgeOk: { color: C.purple, backgroundColor: alpha(C.purple, 0.12) },
  badgeWarn: { color: C.gold, backgroundColor: alpha(C.gold, 0.12) },
  box: { borderWidth: 1, borderColor: alpha(C.purple, 0.35), backgroundColor: C.surface2, borderRadius: RADIUS.md, padding: SPACE.md, marginTop: SPACE.xs },
  label: { fontSize: SIZE.xs, color: C.faint, marginTop: SPACE.sm, marginBottom: SPACE.xs, letterSpacing: 0.5 },
  chips: { gap: SPACE.sm, paddingRight: SPACE.sm },
  row: { flexDirection: 'row', gap: SPACE.md },
  col: { flex: 1 },
  previewOk: { fontSize: SIZE.xs, color: C.purple, marginTop: SPACE.sm },
  previewWarn: { fontSize: SIZE.xs, color: C.gold, marginTop: SPACE.sm },
});
