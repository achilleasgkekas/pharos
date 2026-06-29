import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getCalendar, type CalEvent } from '../api';

const KIND: Record<CalEvent['kind'], { label: string; color: string }> = {
  renewal: { label: 'RENEWAL', color: C.cyan },
  voucher: { label: 'VOUCHER', color: C.gold },
  warranty: { label: 'WARRANTY', color: C.purple },
};

export function CalendarScreen() {
  const [rows, setRows] = useState<CalEvent[]>([]);
  const [cur, setCur] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { const r = await getCalendar(); setRows(r.events); setCur(r.currency); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (loading) return <Spinner />;

  return (
    <View style={s.wrap}>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListHeaderComponent={rows.length ? <Text style={s.head}>Next {rows.length} · coming up</Text> : null}
        ListEmptyComponent={<Empty>Nothing coming up.</Empty>}
        renderItem={({ item }) => {
          const k = KIND[item.kind];
          return (
            <View style={s.row}>
              <View style={[s.dot, { backgroundColor: k.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.kind, { color: k.color }]}>{k.label}</Text>
                <Text style={s.label} numberOfLines={1}>{item.label}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.date}>{shortDate(item.date)}</Text>
                {item.amount != null && <Text style={s.amount}>{money(item.amount, cur)}</Text>}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  head: { color: C.faint, fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kind: { fontSize: 9, letterSpacing: 1, fontWeight: '700' },
  label: { color: C.text, fontSize: 15, fontWeight: '600', marginTop: 2 },
  date: { color: C.dim, fontSize: 13 },
  amount: { color: C.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
});
