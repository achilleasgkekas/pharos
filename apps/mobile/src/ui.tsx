import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, TextInput, Modal, type TextInputProps, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { C, SIZE, RADIUS, SPACE, scrim } from './theme';

/**
 * Max readable content-column width for the main list/scroll containers. Spread into a
 * `contentContainerStyle` array to cap and center the column on tablet/landscape; it is
 * a no-op on phones (already narrower than the cap). `width:'100%'` fills a phone,
 * `maxWidth` caps a tablet, `alignSelf:'center'` centers the capped column.
 */
export const contentWidth: ViewStyle = { width: '100%', maxWidth: 640, alignSelf: 'center' };

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

type ModalSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra style for the backdrop wrapper (e.g. tighter `padding`). */
  wrapStyle?: StyleProp<ViewStyle>;
  /** Extra style for the card (e.g. `maxHeight` for a scrollable body). */
  cardStyle?: StyleProp<ViewStyle>;
};

/**
 * Centered modal card over a dimmed scrim. Tap the backdrop to close; taps on the
 * card itself are swallowed (inner `Pressable` no-op) so touches don't bubble out.
 * Unifies the identical `<Modal><Pressable modalWrap><Pressable modal>` scaffold that
 * was copy-pasted across Subscriptions/Money/Tasks/Items/Vouchers screens.
 */
export function ModalSheet({ visible, onClose, children, wrapStyle, cardStyle }: ModalSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[s.modalWrap, wrapStyle]} onPress={onClose}>
        <Pressable style={[s.modalCard, cardStyle]} onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type InputProps = TextInputProps & { variant?: 'surface' | 'modal' | 'cell' };

/**
 * Single-line text field. `surface` (default) sits on the page background;
 * `modal` sits on surface-2 inside a bottom-sheet/modal; `cell` is a compact
 * variant for narrow inline fields (e.g. a QTY/NET/VAT row of 3 side-by-side
 * inputs) — smaller padding/font than `surface`, same token scale. Unifies the
 * borderRadius/padding/fontSize tokens that used to diverge per screen. Pass
 * `style` to add layout props (e.g. `{ flex: 1 }`); it merges on top of the base.
 */
export function Input({ variant = 'surface', style, ...rest }: InputProps) {
  const base = variant === 'modal' ? s.inputModal : variant === 'cell' ? s.inputCell : s.inputSurface;
  return (
    <TextInput
      placeholderTextColor={C.faint}
      {...rest}
      style={[base, style]}
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

/** `primary` = accent pill · `danger` = red text-button · `ghost` = dim text-button. */
type ButtonVariant = 'primary' | 'danger' | 'ghost';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Show a spinner in place of the label (also blocks the press). */
  busy?: boolean;
  /** Visual style (defaults to `primary`). */
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Action button. `primary` (default) is the accent "Save"/"Add" pill (unifies the
 * byte-identical `save`+`saveText`+`dim` styles). `danger` and `ghost` are the
 * fill-less text-buttons that sat next to the primary action in modal footers:
 * `danger` = red "Delete"/"Discard" (the byte-identical `delBtn`+`delBtnText` pair
 * duplicated across Money/Subscriptions/Items/Vouchers), `ghost` = dim "Cancel".
 * Both share the padH12/padV12 tap target. `disabled`/`busy` dim to 0.4 and block
 * taps; `busy` swaps the label for a spinner. Pass `style`/`textStyle` for layout
 * overrides (e.g. wider padding / minWidth on Items).
 */
export function Button({ label, onPress, disabled, busy, variant = 'primary', style, textStyle }: ButtonProps) {
  const off = !!(disabled || busy);
  const btnStyle = variant === 'primary' ? s.btn : s.btnGhost;
  const txtStyle = variant === 'danger' ? s.btnDangerText : variant === 'ghost' ? s.btnGhostText : s.btnText;
  const spinner = variant === 'danger' ? C.red : variant === 'ghost' ? C.dim : C.onAccent;
  return (
    <Pressable onPress={onPress} disabled={off} style={[btnStyle, off && s.btnDim, style]}>
      {busy ? <ActivityIndicator color={spinner} /> : <Text style={[txtStyle, textStyle]}>{label}</Text>}
    </Pressable>
  );
}

type IconButtonProps = {
  /** Single glyph shown centered (e.g. "＋" or "✦"). */
  glyph: string;
  onPress: () => void;
  disabled?: boolean;
  /** Show a spinner in place of the glyph (also blocks the press). */
  busy?: boolean;
  /** Spinner tint when `busy` (defaults to onAccent). */
  busyColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Square 46-wide accent glyph button — the "＋"/"✦" pill that sits next to an
 * input in an add-row. Height stretches to the sibling input in a flex row.
 * Unifies the byte-identical `addBtn`+`addBtnText` / `add`+`addText` pairs that
 * were duplicated across six screens. `disabled`/`busy` dim to 0.4 and block
 * taps; `busy` swaps the glyph for a spinner. Pass `style` for a colour override
 * (e.g. Items' cyan import variant) or `textStyle` for a glyph tweak.
 */
export function IconButton({ glyph, onPress, disabled, busy, busyColor = C.onAccent, style, textStyle }: IconButtonProps) {
  const off = !!(disabled || busy);
  return (
    <Pressable onPress={onPress} disabled={off} style={[s.iconBtn, off && s.btnDim, style]}>
      {busy ? <ActivityIndicator color={busyColor} /> : <Text style={[s.iconBtnText, textStyle]}>{glyph}</Text>}
    </Pressable>
  );
}

type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Surface card container — border + 14 radius + 14 padding + 10 bottom margin.
 * Unifies the byte-identical `card` StyleSheet entry that was duplicated across
 * the Activity / Statements / Vouchers screens. Renders a `Pressable` when an
 * `onPress`/`onLongPress` handler is given (so tap / long-press cards keep their
 * behaviour), otherwise a plain `View`. Pass `style` for per-card modifiers
 * (e.g. unread / used / faded states); it merges on top of the base.
 */
export function Card({ children, onPress, onLongPress, style }: CardProps) {
  if (onPress || onLongPress) {
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} style={[s.card, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

/**
 * Horizontal list row — a `Card` laid out as a flex row (`flexDirection:'row'`,
 * `alignItems:'center'`, `gap:12`). Unifies the byte-identical `row` StyleSheet
 * entry that was duplicated across the Calendar / Money / Items / Subscriptions /
 * Tasks screens. Like `Card`, renders a `Pressable` when an `onPress`/`onLongPress`
 * handler is given (tap-to-edit / long-press-to-delete rows) and a plain `View`
 * otherwise. Pass `style` for per-row modifiers (e.g. faded / pinned states); it
 * merges on top of the base.
 */
export function ListItem({ children, onPress, onLongPress, style }: CardProps) {
  if (onPress || onLongPress) {
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} style={[s.listItem, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.listItem, style]}>{children}</View>;
}

type BadgeProps = {
  /** Short label, usually uppercase (a status or record type). */
  label: string;
  /** Border + text colour (typically a status/type colour). */
  color: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Small outlined status/type badge — a coloured 1px-border pill with matching
 * coloured uppercase text. Display-only. Unifies the byte-identical
 * `badge`+`badgeText` / `chip`+`chipText` pairs that were duplicated across the
 * Tasks, Search and Activity screens. `color` drives both the border and the
 * text; pass `style`/`textStyle` for per-screen tweaks (e.g. Activity's
 * `marginLeft:'auto'` + larger font, or Search's separate border fallback).
 */
export function Badge({ label, color, style, textStyle }: BadgeProps) {
  return (
    <View style={[s.badge, { borderColor: color }, style]}>
      <Text style={[s.badgeText, { color }, textStyle]}>{label}</Text>
    </View>
  );
}

type ChipProps = {
  /** Chip text (already formatted, e.g. `#network` or `EUR`). */
  label: string;
  /** Selected state — fills the chip with accent and flips the text to onAccent. */
  on?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/**
 * Toggle/filter pill — surface-2 fill + 1px border, flips to an accent fill with
 * onAccent text when `on`. Unifies the byte-identical 4-entry `chip`/`chipOn`/
 * `chipText`/`chipTextOn` StyleSheet clusters that were duplicated across the
 * Items (filter + status), Subscriptions (cycle), Settings (currency/card kind+
 * type), Tasks (tag) and Reports (range) screens. The base is padH12/padV6/
 * radius10/12px; pass `style`/`textStyle` for the small per-screen size tweaks
 * (like the other primitives) so each call site stays pixel-identical.
 */
export function Chip({ label, on, onPress, style, textStyle }: ChipProps) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn, style]}>
      <Text style={[s.chipText, on && s.chipTextOn, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.sm, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.dim, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: C.onAccent },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.lg, padding: 14, marginBottom: 10 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.lg, padding: 14, marginBottom: 10 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  iconBtn: { width: 46, borderRadius: RADIUS.md, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: C.onAccent, fontSize: 24, fontWeight: '700' },
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
  btnGhost: { paddingVertical: SPACE.md, paddingHorizontal: SPACE.md },
  btnDangerText: { color: C.red, fontSize: SIZE.md, fontWeight: '600' },
  btnGhostText: { color: C.dim, fontSize: SIZE.md },
  btnDim: { opacity: 0.4 },
  inputSurface: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: 11, color: C.text, fontSize: SIZE.md },
  inputModal: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: 10, color: C.text, fontSize: SIZE.md },
  inputCell: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.sm, color: C.text, fontSize: SIZE.base },
  textArea: { textAlignVertical: 'top' },
  modalWrap: { flex: 1, backgroundColor: scrim, justifyContent: 'center', padding: SPACE.xl },
  modalCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.xl, padding: 20 },
});
