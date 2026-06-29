import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getExpenses, addExpense, type Expense } from '../api';

export function MoneyScreen({ kind }: { kind: 'expense' | 'income' }) {
  const [rows, setRows] = useState<Expense[]>([]);
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getExpenses(kind)); } catch (e) { setErr((e as Error).message); }
  }, [kind]);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function add() {
    const v = vendor.trim();
    const n = parseFloat(amount.replace(',', '.'));
    if (!v || !Number.isFinite(n)) return;
    setVendor(''); setAmount('');
    try { await addExpense({ vendor: v, amount: n, kind }); await load(); } catch (e) { setErr((e as Error).message); }
  }

  if (loading) return <Spinner />;
  const total = rows.reduce((sum, r) => sum + (r.amount || 0), 0);
  const cur = rows[0]?.currency || 'EUR';
  const label = kind === 'income' ? 'source' : 'vendor';

  return (
    <View style={s.wrap}>
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>{kind === 'income' ? 'INCOME' : 'EXPENSES'} · {rows.length}</Text>
        <Text style={[s.total, { color: kind === 'income' ? C.accent : C.text }]}>{money(total, cur)}</Text>
      </View>
      <View style={s.addRow}>
        <TextInput value={vendor} onChangeText={setVendor} placeholder={label} placeholderTextColor={C.faint} style={[s.input, { flex: 2 }]} />
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} />
        <Pressable onPress={add} disabled={!vendor.trim() || !amount.trim()} style={[s.add, (!vendor.trim() || !amount.trim()) && s.dim]}><Text style={s.addText}>＋</Text></Pressable>
      </View>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>Nothing here yet.</Empty>}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.vendor}>{item.vendor || '—'}</Text>
              <Text style={s.meta}>{[item.category, shortDate(item.date), item.recurring ? 'recurring' : ''].filter(Boolean).join('  ·  ')}</Text>
            </View>
            <Text style={[s.amount, { color: kind === 'income' ? C.accent : C.text }]}>{money(item.amount, item.currency)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14 },
  totalLabel: { color: C.faint, fontSize: 11, letterSpacing: 1 },
  total: { fontSize: 22, fontWeight: '800' },
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: C.text, fontSize: 15 },
  add: { width: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#000', fontSize: 24, fontWeight: '700' },
  dim: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  vendor: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 3 },
  amount: { fontSize: 16, fontWeight: '700' },
});
