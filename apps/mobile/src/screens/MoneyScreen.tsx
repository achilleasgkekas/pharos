import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl, Modal, StyleSheet, Alert } from 'react-native';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getExpenses, addExpense, deleteExpense, updateExpense, type Expense } from '../api';

export function MoneyScreen({ kind }: { kind: 'expense' | 'income' }) {
  const [rows, setRows] = useState<Expense[]>([]);
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [eVendor, setEVendor] = useState('');
  const [eAmount, setEAmount] = useState('');
  const [eCategory, setECategory] = useState('');

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

  function remove(it: Expense) {
    Alert.alert('Delete', `Delete "${it.vendor}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteExpense(it.id); } catch { await load(); } } },
    ]);
  }
  function openEdit(it: Expense) { setEditing(it); setEVendor(it.vendor); setEAmount(String(it.amount)); setECategory(it.category); }
  async function saveEdit() {
    if (!editing) return;
    const a = parseFloat(eAmount.replace(',', '.'));
    const id = editing.id;
    setEditing(null);
    try { await updateExpense(id, { vendor: eVendor.trim(), amount: Number.isFinite(a) ? a : undefined, category: eCategory.trim() }); await load(); } catch (e) { setErr((e as Error).message); }
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
          <Pressable onPress={() => openEdit(item)} onLongPress={() => remove(item)} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.vendor}>{item.vendor || '—'}</Text>
              <Text style={s.meta}>{[item.category, shortDate(item.date), item.recurring ? 'recurring' : ''].filter(Boolean).join('  ·  ')}</Text>
            </View>
            <Text style={[s.amount, { color: kind === 'income' ? C.accent : C.text }]}>{money(item.amount, item.currency)}</Text>
          </Pressable>
        )}
      />

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={s.modalWrap} onPress={() => setEditing(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Edit</Text>
            <Text style={s.mlabel}>{label.toUpperCase()}</Text>
            <TextInput value={eVendor} onChangeText={setEVendor} style={s.minput} placeholderTextColor={C.faint} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Text style={s.mlabel}>AMOUNT</Text><TextInput value={eAmount} onChangeText={setEAmount} keyboardType="decimal-pad" style={s.minput} placeholderTextColor={C.faint} /></View>
              <View style={{ flex: 1 }}><Text style={s.mlabel}>CATEGORY</Text><TextInput value={eCategory} onChangeText={setECategory} style={s.minput} placeholderTextColor={C.faint} /></View>
            </View>
            <View style={s.mbtns}>
              <Pressable onPress={saveEdit} style={s.save}><Text style={s.saveText}>Save</Text></Pressable>
              <Pressable onPress={() => { const e = editing; setEditing(null); if (e) remove(e); }} style={s.delBtn}><Text style={s.delBtnText}>Delete</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 20 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  minput: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 15 },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  save: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  saveText: { color: '#000', fontSize: 15, fontWeight: '700' },
  delBtn: { paddingVertical: 12, paddingHorizontal: 12 },
  delBtnText: { color: C.red, fontSize: 15, fontWeight: '600' },
});
