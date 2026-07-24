import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ScrollView, StyleSheet, Alert } from 'react-native';
import { C } from '../theme';
import { shortDate, money, Spinner, ErrorText, Empty, Input, Button, IconButton, Card, ModalSheet, contentWidth } from '../ui';
import {
  getGoals, addGoal, updateGoal, deleteGoal, addGoalContribution, removeGoalContribution, type Goal,
} from '../api';

// P12 mobile parity — savings / financial goal tracker. `current`/`remaining`/`pct`/`done`/
// `monthsLeft`/`perMonth` are computed server-side (api/v1/goals trim()), never here, mirroring
// the web ReportsClient's client-side lib/goals.ts helpers. Structured like the GiftCardsTab
// contribution ledger (VouchersScreen.tsx), but a goal only ever GAINS money — no spend/reload
// sign toggle, just add / undo.
type Draft = { title: string; targetAmount: string; targetDate: string; category: string; notes: string };
const EMPTY: Draft = { title: '', targetAmount: '', targetDate: '', category: '', notes: '' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function GoalsScreen() {
  const [rows, setRows] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [form, setForm] = useState<Draft>(EMPTY);
  const setF = (k: keyof Draft, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const [contribAmt, setContribAmt] = useState('');
  const [contribNote, setContribNote] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getGoals()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  function openNew() { setForm(EMPTY); setContribAmt(''); setContribNote(''); setEditing('new'); }
  function openEdit(it: Goal) {
    setForm({ title: it.title, targetAmount: it.targetAmount ? String(it.targetAmount) : '', targetDate: ymd(it.targetDate), category: it.category, notes: it.notes });
    setContribAmt(''); setContribNote('');
    setEditing(it);
  }

  function remove(it: Goal) {
    Alert.alert('Delete', `Delete "${it.title}"? It moves to Trash.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteGoal(it.id); } catch { await load(); } } },
    ]);
  }

  async function saveForm() {
    if (!editing || !form.title.trim()) return;
    const target = editing;
    const payload = {
      title: form.title.trim(), targetAmount: parseFloat(form.targetAmount) || 0,
      targetDate: DATE_RE.test(form.targetDate.trim()) ? form.targetDate.trim() : null,
      category: form.category.trim(), notes: form.notes.trim(),
    };
    setEditing(null);
    try {
      if (target === 'new') await addGoal(payload);
      else await updateGoal(target.id, payload);
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  // Reloads the list so the current/pct/contributions shown in the (now-closed) modal
  // reflect the write immediately next open, same idiom as GiftCards spend/reload.
  async function contribute() {
    if (!editing || editing === 'new' || !contribAmt) return;
    const amt = parseFloat(contribAmt);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const id = editing.id;
    const note = contribNote.trim();
    setContribAmt(''); setContribNote('');
    try {
      await addGoalContribution(id, amt, note);
      const fresh = await getGoals();
      setRows(fresh);
      const updated = fresh.find((g) => g.id === id);
      if (updated) setEditing(updated);
    } catch (e) { setErr((e as Error).message); }
  }

  async function removeContribution(goalId: string, contribId: string) {
    try {
      await removeGoalContribution(goalId, contribId);
      const fresh = await getGoals();
      setRows(fresh);
      const updated = fresh.find((g) => g.id === goalId);
      if (updated) setEditing(updated);
    } catch (e) { setErr((e as Error).message); }
  }

  if (loading) return <Spinner />;
  const isNew = editing === 'new';
  const current = !isNew && editing ? rows.find((g) => g.id === editing.id) ?? editing : null;

  return (
    <View style={s.wrap}>
      <View style={s.headRow}>
        <Text style={s.headHint}>{rows.filter((g) => !g.done).length} in progress</Text>
        <IconButton glyph="＋" onPress={openNew} />
      </View>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(g) => g.id}
        contentContainerStyle={[{ padding: 16, paddingTop: 8 }, contentWidth]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No goals yet. Track a savings target — emergency fund, a trip, a big purchase.</Empty>}
        renderItem={({ item }) => (
          <Card onPress={() => openEdit(item)} onLongPress={() => remove(item)} style={item.archived && s.faded}>
            <View style={s.top}>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              {item.done && <Text style={s.doneBadge}>✓ done</Text>}
            </View>
            <Text style={s.meta}>
              {[item.category, item.targetDate ? `by ${shortDate(item.targetDate)}` : ''].filter(Boolean).join('  ·  ')}
            </Text>
            <Text style={s.amount}>
              {money(item.current)}<Text style={s.of}> of {money(item.targetAmount)}</Text>
            </Text>
            <View style={s.barTrack}><View style={[s.barFill, { width: `${item.pct}%`, backgroundColor: item.done ? C.accent : C.cyan }]} /></View>
            {!item.done && item.perMonth != null && (
              <Text style={s.perMonth}>{money(item.perMonth)}/mo needed</Text>
            )}
          </Card>
        )}
      />

      <ModalSheet visible={!!editing} onClose={() => setEditing(null)}>
        <Text style={s.modalTitle}>{isNew ? 'New goal' : 'Edit goal'}</Text>
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          <Text style={s.mlabel}>TITLE</Text>
          <Input variant="modal" value={form.title} onChangeText={(v) => setF('title', v)} placeholder="Emergency fund" />
          <View style={s.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={s.mlabel}>TARGET AMOUNT</Text>
              <Input variant="modal" value={form.targetAmount} onChangeText={(v) => setF('targetAmount', v)} keyboardType="decimal-pad" placeholder="1000" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mlabel}>TARGET DATE (YYYY-MM-DD)</Text>
              <Input variant="modal" value={form.targetDate} onChangeText={(v) => setF('targetDate', v)} placeholder="optional" autoCapitalize="none" />
            </View>
          </View>
          <Text style={s.mlabel}>CATEGORY</Text>
          <Input variant="modal" value={form.category} onChangeText={(v) => setF('category', v)} placeholder="optional" />
          <Text style={s.mlabel}>NOTES</Text>
          <Input variant="modal" value={form.notes} onChangeText={(v) => setF('notes', v)} placeholder="optional" />

          {current && (
            <View style={s.history}>
              <View style={s.top}>
                <Text style={s.mlabel}>SAVED SO FAR</Text>
                <Text style={s.balanceLg}>{money(current.current)}</Text>
              </View>
              <View style={s.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>AMOUNT</Text>
                  <Input variant="modal" value={contribAmt} onChangeText={setContribAmt} keyboardType="decimal-pad" placeholder="0.00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>NOTE</Text>
                  <Input variant="modal" value={contribNote} onChangeText={setContribNote} placeholder="optional" />
                </View>
              </View>
              <Button label="+ Add contribution" onPress={contribute} disabled={!contribAmt} variant="ghost" />
              {current.contributions.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  {[...current.contributions].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).map((c) => (
                    <View key={c.id} style={s.contribRow}>
                      <Text style={s.contribAmount}>+{money(c.amount)}</Text>
                      {!!c.note && <Text style={s.contribNote} numberOfLines={1}>{c.note}</Text>}
                      <Text style={s.contribDate}>{shortDate(c.date)}</Text>
                      <Pressable onPress={() => removeContribution(current.id, c.id)} hitSlop={8}><Text style={s.contribRemove}>×</Text></Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
        <View style={s.mbtns}>
          <Button label={isNew ? 'Add' : 'Save'} onPress={saveForm} disabled={!form.title.trim()} />
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
  headHint: { color: C.faint, fontSize: 12 },
  faded: { opacity: 0.55 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { color: C.text, fontSize: 15, fontWeight: '600', flex: 1 },
  doneBadge: { color: C.accent, fontSize: 12, fontWeight: '700' },
  meta: { color: C.faint, fontSize: 12, marginTop: 4 },
  amount: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 8 },
  of: { color: C.faint, fontSize: 12, fontWeight: '400' },
  barTrack: { marginTop: 8, height: 5, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  perMonth: { color: C.faint, fontSize: 11, marginTop: 6 },
  balanceLg: { color: C.accent, fontSize: 18, fontWeight: '800' },
  history: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border },
  contribRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  contribAmount: { color: C.accent, fontSize: 13, fontWeight: '700' },
  contribNote: { color: C.faint, fontSize: 12, flex: 1 },
  contribDate: { color: C.faint, fontSize: 11 },
  contribRemove: { color: C.faint, fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  rowFields: { flexDirection: 'row', gap: 10 },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
});
