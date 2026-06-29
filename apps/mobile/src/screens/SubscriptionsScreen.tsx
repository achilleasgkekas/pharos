import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getSubscriptions, type Subscription } from '../api';

export function SubscriptionsScreen() {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getSubscriptions()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (loading) return <Spinner />;
  const active = rows.filter((r) => r.active);

  return (
    <View style={s.wrap}>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListHeaderComponent={rows.length ? <Text style={s.head}>{active.length} active</Text> : null}
        ListEmptyComponent={<Empty>No subscriptions.</Empty>}
        renderItem={({ item }) => (
          <View style={[s.row, !item.active && s.faded]}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.meta}>{[item.billingCycle, item.nextRenewal ? `renews ${shortDate(item.nextRenewal)}` : '', !item.active ? 'cancelled' : ''].filter(Boolean).join('  ·  ')}</Text>
            </View>
            <Text style={s.amount}>{money(item.amount, item.currency)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  head: { color: C.faint, fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  faded: { opacity: 0.55 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 3 },
  amount: { color: C.text, fontSize: 16, fontWeight: '700' },
});
