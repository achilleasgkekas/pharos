import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getStatements, type Statement } from '../api';

export function StatementsScreen() {
  const [rows, setRows] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getStatements()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (loading) return <Spinner />;

  return (
    <View style={s.wrap}>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No statements.</Empty>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.top}>
              <Text style={s.card_}>{item.card}{item.last4 ? ` ··${item.last4}` : ''}</Text>
              <Text style={s.total}>{money(item.totalAmount, item.currency)}</Text>
            </View>
            <Text style={s.meta}>{[item.period, item.dueDate ? `due ${shortDate(item.dueDate)}` : '', `${item.txnCount} txn`].filter(Boolean).join('  ·  ')}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  card_: { color: C.text, fontSize: 15, fontWeight: '700' },
  total: { color: C.text, fontSize: 16, fontWeight: '800' },
  meta: { color: C.faint, fontSize: 12, marginTop: 4 },
});
