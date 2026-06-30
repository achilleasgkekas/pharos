import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl, Modal, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getSubscriptions, addSubscription, deleteSubscription, updateSubscription, suggestSub, type Subscription } from '../api';

const CYCLES = ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'];

export function SubscriptionsScreen() {
  const [rows, setRows] = useState<Subscription[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [eName, setEName] = useState('');
  const [eAmount, setEAmount] = useState('');
  const [eCycle, setECycle] = useState('monthly');
  const [eRenewal, setERenewal] = useState('');
  const [eActive, setEActive] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getSubscriptions()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const [aiBusy, setAiBusy] = useState(false);
  async function aiFill() {
    const n = name.trim();
    if (!n) return;
    setAiBusy(true); setErr(null);
    try { const d = await suggestSub(n); if (d.amount != null) setAmount(String(d.amount)); } catch (e) { setErr((e as Error).message); }
    finally { setAiBusy(false); }
  }

  async function add() {
    const n = name.trim();
    const a = parseFloat(amount.replace(',', '.'));
    if (!n || !Number.isFinite(a)) return;
    setName(''); setAmount('');
    try { await addSubscription({ name: n, amount: a, billingCycle: 'monthly' }); await load(); } catch (e) { setErr((e as Error).message); }
  }

  function remove(it: Subscription) {
    Alert.alert('Delete', `Delete "${it.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteSubscription(it.id); } catch { await load(); } } },
    ]);
  }
  function openEdit(it: Subscription) {
    setEditing(it); setEName(it.name); setEAmount(String(it.amount));
    setECycle(it.billingCycle || 'monthly');
    setERenewal(it.nextRenewal ? it.nextRenewal.slice(0, 10) : '');
    setEActive(it.active);
  }
  async function saveEdit() {
    if (!editing) return;
    const a = parseFloat(eAmount.replace(',', '.'));
    const id = editing.id;
    // nextRenewal: valid YYYY-MM-DD → send; blank/malformed → omit (the API ignores falsy values)
    const r = eRenewal.trim();
    const renewal = /^\d{4}-\d{2}-\d{2}$/.test(r) && !Number.isNaN(new Date(r).getTime()) ? r : undefined;
    setEditing(null);
    try {
      await updateSubscription(id, {
        name: eName.trim(),
        amount: Number.isFinite(a) ? a : undefined,
        billingCycle: eCycle,
        nextRenewal: renewal,
        active: eActive,
      });
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  if (loading) return <Spinner />;
  const active = rows.filter((r) => r.active);

  return (
    <View style={s.wrap}>
      <View style={s.addRow}>
        <TextInput value={name} onChangeText={setName} placeholder="name" placeholderTextColor={C.faint} style={[s.input, { flex: 2 }]} />
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="€/mo" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} />
        <Pressable onPress={aiFill} disabled={!name.trim() || aiBusy} style={[s.aiBtn, (!name.trim() || aiBusy) && s.dim]}>
          {aiBusy ? <ActivityIndicator color={C.cyan} size="small" /> : <Text style={s.aiText}>✦</Text>}
        </Pressable>
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
          <Pressable onPress={() => openEdit(item)} onLongPress={() => remove(item)} style={[s.row, !item.active && s.faded]}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.meta}>{[item.billingCycle, item.nextRenewal ? `renews ${shortDate(item.nextRenewal)}` : '', !item.active ? 'cancelled' : ''].filter(Boolean).join('  ·  ')}</Text>
            </View>
            <Text style={s.amount}>{money(item.amount, item.currency)}</Text>
          </Pressable>
        )}
      />

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={s.modalWrap} onPress={() => setEditing(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Edit subscription</Text>
            <Text style={s.mlabel}>NAME</Text>
            <TextInput value={eName} onChangeText={setEName} style={s.minput} placeholderTextColor={C.faint} />
            <Text style={s.mlabel}>AMOUNT</Text>
            <TextInput value={eAmount} onChangeText={setEAmount} keyboardType="decimal-pad" style={s.minput} placeholderTextColor={C.faint} />
            <Text style={s.mlabel}>BILLING CYCLE</Text>
            <View style={s.chipRow}>
              {CYCLES.map((cy) => (
                <Pressable key={cy} onPress={() => setECycle(cy)} style={[s.cChip, eCycle === cy && s.cChipOn]}>
                  <Text style={[s.cChipText, eCycle === cy && s.cChipTextOn]}>{cy}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.mlabel}>NEXT RENEWAL</Text>
            <TextInput value={eRenewal} onChangeText={setERenewal} autoCapitalize="none" autoCorrect={false} placeholder="YYYY-MM-DD" style={s.minput} placeholderTextColor={C.faint} />
            <Pressable onPress={() => setEActive((v) => !v)} style={s.toggle}>
              <View style={[s.tbox, eActive && s.tboxOn]}>{eActive && <Text style={s.tmark}>✓</Text>}</View>
              <Text style={s.tlabel}>Active</Text>
            </Pressable>
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
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: C.text, fontSize: 15 },
  addBtn: { width: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#000', fontSize: 24, fontWeight: '700' },
  aiBtn: { width: 40, borderRadius: 12, borderWidth: 1, borderColor: C.cyan, alignItems: 'center', justifyContent: 'center' },
  aiText: { color: C.cyan, fontSize: 18, fontWeight: '700' },
  dim: { opacity: 0.4 },
  head: { color: C.faint, fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  faded: { opacity: 0.55 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 3 },
  amount: { color: C.text, fontSize: 16, fontWeight: '700' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 20 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  minput: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  cChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  cChipText: { color: C.dim, fontSize: 12, fontWeight: '600' },
  cChipTextOn: { color: '#000' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  tbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  tboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  tmark: { color: '#000', fontSize: 15, fontWeight: '800' },
  tlabel: { color: C.text, fontSize: 15 },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  save: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  saveText: { color: '#000', fontSize: 15, fontWeight: '700' },
  delBtn: { paddingVertical: 12, paddingHorizontal: 12 },
  delBtnText: { color: C.red, fontSize: 15, fontWeight: '600' },
});
