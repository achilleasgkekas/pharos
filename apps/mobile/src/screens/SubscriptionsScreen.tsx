import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getSubscriptions, addSubscription, type Subscription } from '../api';

export function SubscriptionsScreen() {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getSubscriptions()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function add() {
    const n = name.trim();
    const a = parseFloat(amount.replace(',', '.'));
    if (!n || !Number.isFinite(a)) return;
    setName(''); setAmount('');
    try { await addSubscription({ name: n, amount: a, billingCycle: 'monthly' }); await load(); } catch (e) { setErr((e as Error).message); }
  }

  if (loading) return <Spinner />;
  const active = rows.filter((r) => r.active);

  return (
    <View style={s.wrap}>
      <View style={s.addRow}>
        <TextInput value={name} onChangeText={setName} placeholder="name" placeholderTextColor={C.faint} style={[s.input, { flex: 2 }]} />
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="€/mo" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} />
        <Pressable onPress={add} disabled={!name.trim() || !amount.trim()} style={[s.addBtn, (!name.trim() || !amount.trim()) && s.dim]}><Text style={s.addBtnText}>＋</Text></Pressable>
      </View>
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
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: C.text, fontSize: 15 },
  addBtn: { width: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#000', fontSize: 24, fontWeight: '700' },
  dim: { opacity: 0.4 },
  head: { color: C.faint, fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  faded: { opacity: 0.55 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 3 },
  amount: { color: C.text, fontSize: 16, fontWeight: '700' },
});
