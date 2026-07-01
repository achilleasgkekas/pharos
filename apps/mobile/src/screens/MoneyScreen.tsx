import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty, Input, TextArea } from '../ui';
import { getExpenses, addExpense, deleteExpense, updateExpense, scanExpenseImage, type Expense, type ParsedExpenseData } from '../api';

const CYCLES = ['monthly', 'quarterly', 'yearly', 'weekly'] as const;

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
  const [eDate, setEDate] = useState('');
  const [ePeriod, setEPeriod] = useState('');
  const [eRecurring, setERecurring] = useState(false);
  const [eCycle, setECycle] = useState('');
  const [ePayment, setEPayment] = useState('');
  const [eNotes, setENotes] = useState('');
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<ParsedExpenseData | null>(null);
  const [dVendor, setDVendor] = useState('');
  const [dAmount, setDAmount] = useState('');
  const [dCategory, setDCategory] = useState('');
  const [saving, setSaving] = useState(false);

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

  async function scan() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera needed', 'Allow camera access to scan a bill.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    setScanning(true);
    setErr(null);
    try {
      const d = await scanExpenseImage(res.assets[0].uri);
      setDraft(d);
      setDVendor(d.vendor);
      setDAmount(d.amount ? String(d.amount) : '');
      setDCategory(d.category);
    } catch (e) { setErr((e as Error).message); }
    finally { setScanning(false); }
  }
  async function saveDraft() {
    if (!draft) return;
    const v = dVendor.trim();
    const n = parseFloat(dAmount.replace(',', '.'));
    if (!v || !Number.isFinite(n)) { setErr('Vendor and amount are required'); return; }
    setSaving(true);
    try {
      await addExpense({
        vendor: v, amount: n, kind: draft.kind || kind,
        category: dCategory.trim() || undefined,
        date: draft.date || undefined,
        period: draft.period || undefined,
        recurringCycle: draft.recurringCycle || undefined,
        paymentMethod: draft.paymentMethod || undefined,
      });
      setDraft(null);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  function remove(it: Expense) {
    Alert.alert('Delete', `Delete "${it.vendor}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteExpense(it.id); } catch { await load(); } } },
    ]);
  }
  function openEdit(it: Expense) {
    setEditing(it);
    setEVendor(it.vendor); setEAmount(String(it.amount)); setECategory(it.category);
    setEDate(it.date ? it.date.slice(0, 10) : ''); setEPeriod(it.period || '');
    setERecurring(!!it.recurring); setECycle(it.recurringCycle || '');
    setEPayment(it.paymentMethod || ''); setENotes(it.notes || '');
  }
  async function saveEdit() {
    if (!editing) return;
    const a = parseFloat(eAmount.replace(',', '.'));
    const id = editing.id;
    setEditing(null);
    try {
      await updateExpense(id, {
        vendor: eVendor.trim(),
        amount: Number.isFinite(a) ? a : undefined,
        category: eCategory.trim(),
        date: eDate.trim() || undefined,
        period: ePeriod.trim(),
        recurring: eRecurring,
        recurringCycle: eRecurring ? eCycle : '',
        paymentMethod: ePayment.trim(),
        notes: eNotes.trim(),
      });
      await load();
    } catch (e) { setErr((e as Error).message); }
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
        <Input value={vendor} onChangeText={setVendor} placeholder={label} style={{ flex: 2 }} />
        <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" style={{ flex: 1 }} />
        <Pressable onPress={scan} disabled={scanning} style={[s.scanBtn, scanning && s.dim]}>
          {scanning ? <ActivityIndicator color={C.cyan} size="small" /> : <Text style={s.scanText}>✦</Text>}
        </Pressable>
        <Pressable onPress={add} disabled={!vendor.trim() || !amount.trim()} style={[s.add, (!vendor.trim() || !amount.trim()) && s.dim]}><Text style={s.addText}>＋</Text></Pressable>
      </View>
      <Text style={s.hint}>✦ scan a {kind === 'income' ? 'payslip' : 'bill'} with AI</Text>
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

      <Modal visible={!!draft} transparent animationType="fade" onRequestClose={() => setDraft(null)}>
        <Pressable style={s.modalWrap} onPress={() => setDraft(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Scanned {draft?.kind === 'income' ? 'income' : 'bill'}</Text>
            <Text style={s.scanNote}>Check the fields, then add it.</Text>
            <Text style={s.mlabel}>{label.toUpperCase()}</Text>
            <Input variant="modal" value={dVendor} onChangeText={setDVendor} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Text style={s.mlabel}>AMOUNT</Text><Input variant="modal" value={dAmount} onChangeText={setDAmount} keyboardType="decimal-pad" /></View>
              <View style={{ flex: 1 }}><Text style={s.mlabel}>CATEGORY</Text><Input variant="modal" value={dCategory} onChangeText={setDCategory} /></View>
            </View>
            {!!(draft?.date || draft?.recurringCycle) && (
              <Text style={s.scanMeta}>{[draft?.date ? shortDate(draft.date) : '', draft?.recurringCycle ? `recurring ${draft.recurringCycle}` : ''].filter(Boolean).join('  ·  ')}</Text>
            )}
            <View style={s.mbtns}>
              <Pressable onPress={saveDraft} disabled={saving} style={[s.save, saving && s.dim]}><Text style={s.saveText}>{saving ? 'Adding…' : 'Add'}</Text></Pressable>
              <Pressable onPress={() => setDraft(null)} style={s.delBtn}><Text style={s.delBtnText}>Discard</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={s.modalWrap} onPress={() => setEditing(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Edit</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.mlabel}>{label.toUpperCase()}</Text>
              <Input variant="modal" value={eVendor} onChangeText={setEVendor} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Text style={s.mlabel}>AMOUNT</Text><Input variant="modal" value={eAmount} onChangeText={setEAmount} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Text style={s.mlabel}>CATEGORY</Text><Input variant="modal" value={eCategory} onChangeText={setECategory} /></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Text style={s.mlabel}>DATE</Text><Input variant="modal" value={eDate} onChangeText={setEDate} placeholder="YYYY-MM-DD" autoCapitalize="none" /></View>
                <View style={{ flex: 1 }}><Text style={s.mlabel}>PERIOD</Text><Input variant="modal" value={ePeriod} onChangeText={setEPeriod} placeholder="YYYY-MM" autoCapitalize="none" /></View>
              </View>
              <Text style={s.mlabel}>PAYMENT</Text>
              <Input variant="modal" value={ePayment} onChangeText={setEPayment} placeholder="card, cash…" />
              <View style={s.recRow}>
                <Text style={s.recLabel}>Recurring</Text>
                <Pressable onPress={() => setERecurring((v) => !v)} style={[s.toggle, eRecurring && s.toggleOn]}>
                  <Text style={[s.toggleText, eRecurring && s.toggleTextOn]}>{eRecurring ? 'ON' : 'OFF'}</Text>
                </Pressable>
              </View>
              {eRecurring && (
                <View style={s.cycleRow}>
                  {CYCLES.map((c) => (
                    <Pressable key={c} onPress={() => setECycle(c)} style={[s.cycle, eCycle === c && s.cycleOn]}>
                      <Text style={[s.cycleText, eCycle === c && s.cycleTextOn]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <Text style={s.mlabel}>NOTES</Text>
              <TextArea variant="modal" value={eNotes} onChangeText={setENotes} style={{ minHeight: 60 }} />
            </ScrollView>
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
  add: { width: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addText: { color: C.onAccent, fontSize: 24, fontWeight: '700' },
  scanBtn: { width: 46, borderRadius: 12, borderWidth: 1, borderColor: C.cyan, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  scanText: { color: C.cyan, fontSize: 20, fontWeight: '700' },
  hint: { color: C.faint, fontSize: 11, paddingHorizontal: 16, marginTop: -2, marginBottom: 4 },
  scanNote: { color: C.dim, fontSize: 12, marginTop: 4 },
  scanMeta: { color: C.faint, fontSize: 12, marginTop: 10 },
  dim: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  vendor: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 3 },
  amount: { fontSize: 16, fontWeight: '700' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 20, maxHeight: '88%' },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  recRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  recLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  toggle: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12, backgroundColor: C.surface2 },
  toggleOn: { borderColor: C.accent, backgroundColor: C.accent },
  toggleText: { color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  toggleTextOn: { color: C.onAccent },
  cycleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  cycle: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: C.surface2 },
  cycleOn: { borderColor: C.cyan, backgroundColor: C.surface3 },
  cycleText: { color: C.dim, fontSize: 12, fontWeight: '600' },
  cycleTextOn: { color: C.cyan },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  save: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  saveText: { color: C.onAccent, fontSize: 15, fontWeight: '700' },
  delBtn: { paddingVertical: 12, paddingHorizontal: 12 },
  delBtnText: { color: C.red, fontSize: 15, fontWeight: '600' },
});
