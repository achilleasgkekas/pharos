import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { C } from './theme';

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

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 4 },
  backBtn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  back: { color: C.accent, fontSize: 30, lineHeight: 32, marginTop: -3 },
  title: { flex: 1, color: C.text, fontSize: 19, fontWeight: '800' },
  right: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  error: { color: C.red, fontSize: 13, marginVertical: 10, paddingHorizontal: 16 },
  empty: { color: C.faint, fontSize: 14, textAlign: 'center', marginTop: 50 },
});
