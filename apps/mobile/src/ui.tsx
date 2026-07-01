import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, TextInput, type TextInputProps, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { C, SIZE, RADIUS, SPACE } from './theme';

export const CUR: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
export const money = (n: number | undefined, cur = 'EUR') => `${CUR[cur] || cur + ' '}${(n ?? 0).toLocaleString()}`;
export const shortDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '');

/** Screen top bar with a back button. */
export function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={s.bar}>
      <Pressable onPress={onBack} hitSlop={12} style={s.backBtn}><Text style={s.back}>‹</Text></Pressable>
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      <View style={s.right}>{right}</View>
    </View>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <View style={s.center}>{children}</View>;
}
export function Spinner() {
  return <Centered><ActivityIndicator color={C.accent} /></Centered>;
}
export function ErrorText({ children }: { children: React.ReactNode }) {
  return children ? <Text style={s.error}>{children}</Text> : null;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <Text style={s.empty}>{children}</Text>;
}

type InputProps = TextInputProps & { variant?: 'surface' | 'modal' };

/**
 * Single-line text field. `surface` (default) sits on the page background;
 * `modal` sits on surface-2 inside a bottom-sheet/modal. Unifies the borderRadius/
 * padding/fontSize tokens that used to diverge per screen. Pass `style` to add
 * layout props (e.g. `{ flex: 1 }`); it merges on top of the base.
 */
export function Input({ variant = 'surface', style, ...rest }: InputProps) {
  return (
    <TextInput
      placeholderTextColor={C.faint}
      {...rest}
      style={[variant === 'modal' ? s.inputModal : s.inputSurface, style]}
    />
  );
}

/** Multi-line variant (top-aligned). Pass `minHeight` via `style`. */
export function TextArea({ variant = 'surface', style, ...rest }: InputProps) {
  return (
    <TextInput
      placeholderTextColor={C.faint}
      multiline
      {...rest}
      style={[variant === 'modal' ? s.inputModal : s.inputSurface, s.textArea, style]}
    />
  );
}

/**
 * Shared checkbox visual (24×24 box + ✓ when checked). Display-only — wrap it
 * in a Pressable for tap handling. When it IS the tap target, give the wrapping
 * Pressable `hitSlop={10}` so the effective hit area is ≥44pt.
 */
export function Check({ checked }: { checked: boolean }) {
  return (
    <View style={[s.checkbox, checked && s.checkboxOn]}>
      {checked ? <Text style={s.checkboxMark}>✓</Text> : null}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Show a spinner in place of the label (also blocks the press). */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Primary accent action pill (the "Save"/"Add" button). Unifies the byte-identical
 * `save` + `saveText` + `dim` styles that were duplicated across screens. `disabled`
 * or `busy` dims it to 0.4 and blocks taps; `busy` swaps the label for a spinner.
 * Pass `style` to override layout (e.g. wider padding / minWidth on Items).
 */
export function Button({ label, onPress, disabled, busy, style, textStyle }: ButtonProps) {
  const off = !!(disabled || busy);
  return (
    <Pressable onPress={onPress} disabled={off} style={[s.btn, off && s.btnDim, style]}>
      {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={[s.btnText, textStyle]}>{label}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 4 },
  backBtn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  back: { color: C.accent, fontSize: 30, lineHeight: 32, marginTop: -3 },
  title: { flex: 1, color: C.text, fontSize: 19, fontWeight: '800' },
  right: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  error: { color: C.red, fontSize: 13, marginVertical: 10, paddingHorizontal: 16 },
  empty: { color: C.faint, fontSize: 14, textAlign: 'center', marginTop: 50 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  checkboxMark: { color: C.onAccent, fontSize: SIZE.md, fontWeight: '800' },
  btn: { backgroundColor: C.accent, borderRadius: RADIUS.md, paddingVertical: SPACE.md, paddingHorizontal: 22 },
  btnText: { color: C.onAccent, fontSize: SIZE.md, fontWeight: '700' },
  btnDim: { opacity: 0.4 },
  inputSurface: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: 11, color: C.text, fontSize: SIZE.md },
  inputModal: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: 10, color: C.text, fontSize: SIZE.md },
  textArea: { textAlignVertical: 'top' },
});
