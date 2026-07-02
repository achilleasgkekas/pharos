import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { C } from '../theme';
import { Empty, Badge, contentWidth } from '../ui';
import { search, type SearchHit } from '../api';
import type { ScreenKey } from './HomeScreen';

const TO_SCREEN: Record<string, ScreenKey> = {
  item: 'items', receipt: 'receipts', statement: 'statements', task: 'tasks',
  subscription: 'subscriptions', expense: 'expenses', voucher: 'vouchers',
};
const COLOR: Record<string, string> = {
  item: C.cyan, receipt: C.purple, statement: C.purple, task: C.accent,
  subscription: C.cyan, expense: C.gold, voucher: C.gold,
};

export function SearchScreen({ onOpen }: { onOpen: (k: ScreenKey) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await search(q);
        if (mine === seq.current) { setHits(r); setErr(null); }
      } catch (e) {
        if (mine === seq.current) setErr((e as Error).message);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <View style={s.wrap}>
      <View style={s.bar}>
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search everything…"
          placeholderTextColor={C.faint}
          style={s.input}
        />
        {busy && <ActivityIndicator color={C.accent} style={{ marginRight: 6 }} />}
      </View>
      {err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={hits}
        keyExtractor={(h) => `${h.type}-${h.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[{ padding: 16, paddingTop: 4 }, contentWidth]}
        ListEmptyComponent={q.trim().length >= 2 && !busy ? <Empty>No matches.</Empty> : null}
        renderItem={({ item }) => {
          const dest = TO_SCREEN[item.type];
          return (
            <Pressable onPress={() => dest && onOpen(dest)} style={s.row}>
              <Badge
                label={item.type.toUpperCase()}
                color={COLOR[item.type] || C.dim}
                style={{ borderColor: COLOR[item.type] || C.border, paddingVertical: 3 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                {!!item.subtitle && <Text style={s.sub} numberOfLines={1}>{item.subtitle}</Text>}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  bar: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8 },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: C.text, fontSize: 16 },
  err: { color: C.red, fontSize: 13, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  sub: { color: C.faint, fontSize: 12, marginTop: 2 },
});
