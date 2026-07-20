import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ScrollView, StyleSheet, Alert } from 'react-native';
import { C, RADIUS } from '../theme';
import { shortDate, money, Spinner, ErrorText, Empty, Input, TextArea, Button, IconButton, Card, Badge, Chip, ModalSheet, contentWidth } from '../ui';
import { getBills, addBill, updateBill, deleteBill, setBillPaid, type Bill, type BillStatus } from '../api';

type Draft = { title: string; vendor: string; amount: string; dueDate: string; category: string; cycle: '' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'; notes: string };
const EMPTY: Draft = { title: '', vendor: '', amount: '', dueDate: '', category: '', cycle: '', notes: '' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const CYCLES: { key: Draft['cycle']; label: string }[] = [
  { key: '', label: 'one-off' }, { key: 'weekly', label: 'weekly' }, { key: 'monthly', label: 'monthly' },
  { key: 'quarterly', label: 'quarterly' }, { key: 'yearly', label: 'yearly' },
];

// Mirrors the web BillsClient status colors (apps/web/src/app/bills/BillsClient.tsx:18-21).
const STATUS_LABEL: Record<BillStatus, string> = { paid: 'paid', overdue: 'overdue', 'due-soon': 'due soon', upcoming: 'upcoming' };
const STATUS_COLOR: Record<BillStatus, string> = { paid: C.accent, overdue: C.red, 'due-soon': C.gold, upcoming: C.faint };

export function BillsScreen() {
  const [rows, setRows] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const [editing, setEditing] = useState<Bill | 'new' | null>(null);
  const [form, setForm] = useState<Draft>(EMPTY);
  const setF = (k: keyof Draft, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getBills()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  function openNew() { setForm(EMPTY); setEditing('new'); }
  function openEdit(it: Bill) {
    setForm({ title: it.title, vendor: it.vendor, amount: it.amount ? String(it.amount) : '', dueDate: ymd(it.dueDate), category: it.category, cycle: it.cycle, notes: it.notes });
    setEditing(it);
  }

  function remove(it: Bill) {
    Alert.alert('Delete', `Delete "${it.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteBill(it.id); } catch { await load(); } } },
    ]);
  }

  async function saveForm() {
    if (!editing || !form.title.trim() || !DATE_RE.test(form.dueDate.trim())) return;
    const target = editing;
    const payload = {
      title: form.title.trim(), vendor: form.vendor.trim(), amount: parseFloat(form.amount) || 0,
      dueDate: form.dueDate.trim(), category: form.category.trim() || 'other', cycle: form.cycle, notes: form.notes.trim(),
    };
    setEditing(null);
    try {
      if (target === 'new') await addBill(payload);
      else await updateBill(target.id, payload);
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  async function togglePaid(it: Bill) {
    const wasPaid = it.status === 'paid';
    setRows((p) => p.map((x) => (x.id === it.id ? { ...x, status: wasPaid ? 'upcoming' : 'paid', paidAt: wasPaid ? null : new Date().toISOString() } : x)));
    try { await setBillPaid(it.id, !wasPaid); await load(); } catch (e) { setErr((e as Error).message); await load(); }
  }

  if (loading) return <Spinner />;
  const isNew = editing === 'new';
  const visible = filter === 'open' ? rows.filter((b) => b.status !== 'paid') : rows;
  const overdueCount = rows.filter((b) => b.status === 'overdue').length;

  return (
    <View style={s.wrap}>
      <View style={s.headRow}>
        <View style={s.filterRow}>
          <Chip label="Open" on={filter === 'open'} onPress={() => setFilter('open')} />
          <Chip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
          {overdueCount > 0 && <Text style={s.overdueHint}>{overdueCount} overdue</Text>}
        </View>
        <IconButton glyph="＋" onPress={openNew} />
      </View>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={visible}
        keyExtractor={(b) => b.id}
        contentContainerStyle={[{ padding: 16, paddingTop: 8 }, contentWidth]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No bills.</Empty>}
        renderItem={({ item }) => (
          <Card style={item.status === 'paid' && s.faded}>
            <Pressable onPress={() => openEdit(item)}>
              <View style={s.top}>
                <Text style={s.title} numberOfLines={2}>{item.title}</Text>
                <Badge label={STATUS_LABEL[item.status]} color={STATUS_COLOR[item.status]} />
              </View>
              <Text style={s.meta}>
                {[item.vendor, item.dueDate ? `due ${shortDate(item.dueDate)}` : '', item.cycle].filter(Boolean).join('  ·  ')}
              </Text>
              <Text style={s.amount}>{money(item.amount)}</Text>
            </Pressable>
            <Pressable onPress={() => togglePaid(item)} style={s.payBtn} hitSlop={8}>
              <Text style={[s.payText, item.status === 'paid' && s.payTextUndo]}>{item.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}</Text>
            </Pressable>
          </Card>
        )}
      />

      <ModalSheet visible={!!editing} onClose={() => setEditing(null)}>
        <Text style={s.modalTitle}>{isNew ? 'New bill' : 'Edit bill'}</Text>
        <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
          <Text style={s.mlabel}>TITLE</Text>
          <Input variant="modal" value={form.title} onChangeText={(v) => setF('title', v)} placeholder="ΔΕΗ ρεύμα" />
          <Text style={s.mlabel}>VENDOR</Text>
          <Input variant="modal" value={form.vendor} onChangeText={(v) => setF('vendor', v)} />
          <View style={s.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={s.mlabel}>AMOUNT</Text>
              <Input variant="modal" value={form.amount} onChangeText={(v) => setF('amount', v)} keyboardType="decimal-pad" placeholder="0" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mlabel}>DUE (YYYY-MM-DD)</Text>
              <Input variant="modal" value={form.dueDate} onChangeText={(v) => setF('dueDate', v)} placeholder="2026-08-01" autoCapitalize="none" />
            </View>
          </View>
          <Text style={s.mlabel}>CATEGORY</Text>
          <Input variant="modal" value={form.category} onChangeText={(v) => setF('category', v)} placeholder="other" />
          <Text style={s.mlabel}>REPEAT</Text>
          <View style={s.cycleRow}>
            {CYCLES.map((c) => <Chip key={c.key} label={c.label} on={form.cycle === c.key} onPress={() => setF('cycle', c.key)} />)}
          </View>
          <Text style={s.mlabel}>NOTES</Text>
          <TextArea variant="modal" value={form.notes} onChangeText={(v) => setF('notes', v)} style={{ minHeight: 70 }} />
        </ScrollView>
        <View style={s.mbtns}>
          <Button label={isNew ? 'Add' : 'Save'} onPress={saveForm} disabled={!form.title.trim() || !DATE_RE.test(form.dueDate.trim())} />
          {!isNew && editing && (
            <Button label="Delete" onPress={() => { const e = editing; setEditing(null); if (e && typeof e !== 'string') remove(e); }} variant="danger" />
          )}
        </View>
      </ModalSheet>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 16, paddingBottom: 8 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  overdueHint: { color: C.red, fontSize: 12, fontWeight: '700' },
  faded: { opacity: 0.55 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { color: C.text, fontSize: 15, fontWeight: '600', flex: 1 },
  meta: { color: C.faint, fontSize: 12, marginTop: 4 },
  amount: { color: C.text, fontSize: 16, fontWeight: '800', marginTop: 8 },
  payBtn: { marginTop: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.borderLight, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 6 },
  payText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  payTextUndo: { color: C.faint },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  rowFields: { flexDirection: 'row', gap: 10 },
  cycleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
});
