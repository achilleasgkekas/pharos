import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { C, RADIUS } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty, Check, Input, Button, IconButton, Chip, Badge, ListItem, ModalSheet, contentWidth } from '../ui';
import { getSubscriptions, addSubscription, deleteSubscription, updateSubscription, suggestSub, type Subscription, type RecurringCandidate } from '../api';

const CYCLES = ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'];

export function SubscriptionsScreen() {
  const [rows, setRows] = useState<Subscription[]>([]);
  // Auto-discovered untracked recurring charges (P7 mobile parity). Dismiss is
  // session-only (mirrors the web's ephemeral hide list, no persisted ignore list).
  const [suggestions, setSuggestions] = useState<RecurringCandidate[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [trackingKey, setTrackingKey] = useState<string | null>(null);
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
  const [eTrialEndsAt, setETrialEndsAt] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { subscriptions, suggestions } = await getSubscriptions();
      setRows(subscriptions);
      setSuggestions(suggestions);
    } catch (e) { setErr((e as Error).message); }
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
    setETrialEndsAt(it.trialEndsAt ? it.trialEndsAt.slice(0, 10) : '');
  }
  async function saveEdit() {
    if (!editing) return;
    const a = parseFloat(eAmount.replace(',', '.'));
    const id = editing.id;
    // nextRenewal: valid YYYY-MM-DD → send; blank/malformed → omit (the API ignores falsy values)
    const r = eRenewal.trim();
    const renewal = /^\d{4}-\d{2}-\d{2}$/.test(r) && !Number.isNaN(new Date(r).getTime()) ? r : undefined;
    // trialEndsAt: blank → explicit null (clears it), valid YYYY-MM-DD → send, malformed → omit (no change)
    const t = eTrialEndsAt.trim();
    const trialEndsAt = t === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(t).getTime()) ? t : undefined;
    setEditing(null);
    try {
      await updateSubscription(id, {
        name: eName.trim(),
        amount: Number.isFinite(a) ? a : undefined,
        billingCycle: eCycle,
        nextRenewal: renewal,
        active: eActive,
        trialEndsAt,
      });
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  async function trackCandidate(c: RecurringCandidate) {
    setTrackingKey(c.vendorKey);
    try {
      await addSubscription({ name: c.vendor || c.vendorKey, amount: c.lastAmount, billingCycle: c.cycle });
      setHiddenKeys((prev) => new Set(prev).add(c.vendorKey));
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setTrackingKey(null); }
  }
  function dismissCandidate(key: string) {
    setHiddenKeys((prev) => new Set(prev).add(key));
  }

  if (loading) return <Spinner />;
  const active = rows.filter((r) => r.active);
  const visibleSuggestions = suggestions.filter((c) => !hiddenKeys.has(c.vendorKey));

  return (
    <View style={s.wrap}>
      {visibleSuggestions.length > 0 && (
        <View style={s.discoverBox}>
          <Text style={s.discoverTitle}>{visibleSuggestions.length} possible untracked subscription{visibleSuggestions.length === 1 ? '' : 's'}</Text>
          {visibleSuggestions.map((c) => (
            <View key={c.vendorKey} style={s.discoverRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.discoverVendor} numberOfLines={1}>{c.vendor || c.vendorKey}</Text>
                <Text style={s.discoverMeta}>~{money(c.avgAmount)} · {c.cycle} · {c.occurrences}×</Text>
              </View>
              <Button
                label="Track"
                onPress={() => trackCandidate(c)}
                busy={trackingKey === c.vendorKey}
                style={s.discoverTrackBtn}
                textStyle={s.discoverTrackText}
              />
              <Pressable onPress={() => dismissCandidate(c.vendorKey)} hitSlop={8} style={s.discoverDismiss}>
                <Text style={s.discoverDismissText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={s.addRow}>
        <Input value={name} onChangeText={setName} placeholder="name" style={{ flex: 2 }} />
        <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="€/mo" style={{ flex: 1 }} />
        <Pressable onPress={aiFill} disabled={!name.trim() || aiBusy} style={[s.aiBtn, (!name.trim() || aiBusy) && s.dim]}>
          {aiBusy ? <ActivityIndicator color={C.cyan} size="small" /> : <Text style={s.aiText}>✦</Text>}
        </Pressable>
        <IconButton glyph="＋" onPress={add} disabled={!name.trim() || !amount.trim()} />
      </View>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[{ padding: 16 }, contentWidth]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListHeaderComponent={rows.length ? <Text style={s.head}>{active.length} active</Text> : null}
        ListEmptyComponent={<Empty>No subscriptions.</Empty>}
        renderItem={({ item }) => (
          <ListItem onPress={() => openEdit(item)} onLongPress={() => remove(item)} style={!item.active && s.faded}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.meta}>{[item.billingCycle, item.nextRenewal ? `renews ${shortDate(item.nextRenewal)}` : '', !item.active ? 'cancelled' : ''].filter(Boolean).join('  ·  ')}</Text>
            </View>
            {!!item.trialEndsAt && new Date(item.trialEndsAt).getTime() > Date.now() && (
              <Badge label="Trial" color={C.gold} style={{ marginRight: 8 }} />
            )}
            <Text style={s.amount}>{money(item.amount, item.currency)}</Text>
          </ListItem>
        )}
      />

      <ModalSheet visible={!!editing} onClose={() => setEditing(null)}>
            <Text style={s.modalTitle}>Edit subscription</Text>
            <Text style={s.mlabel}>NAME</Text>
            <Input variant="modal" value={eName} onChangeText={setEName} />
            <Text style={s.mlabel}>AMOUNT</Text>
            <Input variant="modal" value={eAmount} onChangeText={setEAmount} keyboardType="decimal-pad" />
            <Text style={s.mlabel}>BILLING CYCLE</Text>
            <View style={s.chipRow}>
              {CYCLES.map((cy) => (
                <Chip key={cy} label={cy} on={eCycle === cy} onPress={() => setECycle(cy)} style={s.cycleChip} />
              ))}
            </View>
            <Text style={s.mlabel}>NEXT RENEWAL</Text>
            <Input variant="modal" value={eRenewal} onChangeText={setERenewal} autoCapitalize="none" autoCorrect={false} placeholder="YYYY-MM-DD" />
            <Text style={s.mlabel}>FREE TRIAL ENDS</Text>
            <Input variant="modal" value={eTrialEndsAt} onChangeText={setETrialEndsAt} autoCapitalize="none" autoCorrect={false} placeholder="YYYY-MM-DD (blank = no trial)" />
            <Pressable onPress={() => setEActive((v) => !v)} style={s.toggle}>
              <Check checked={!!eActive} />
              <Text style={s.tlabel}>Active</Text>
            </Pressable>
            <View style={s.mbtns}>
              <Button label="Save" onPress={saveEdit} />
              <Button label="Delete" onPress={() => { const e = editing; setEditing(null); if (e) remove(e); }} variant="danger" />
            </View>
      </ModalSheet>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  discoverBox: { marginHorizontal: 16, marginTop: 16, padding: 12, borderRadius: RADIUS.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  discoverTitle: { color: C.faint, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  discoverRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.sm, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6 },
  discoverVendor: { color: C.text, fontSize: 13, fontWeight: '600' },
  discoverMeta: { color: C.dim, fontSize: 11, marginTop: 2 },
  discoverTrackBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  discoverTrackText: { fontSize: 12 },
  discoverDismiss: { padding: 4 },
  discoverDismissText: { color: C.faint, fontSize: 14 },
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  aiBtn: { width: 40, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.cyan, alignItems: 'center', justifyContent: 'center' },
  aiText: { color: C.cyan, fontSize: 18, fontWeight: '700' },
  dim: { opacity: 0.4 },
  head: { color: C.faint, fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  faded: { opacity: 0.55 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 3 },
  amount: { color: C.text, fontSize: 16, fontWeight: '700' },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cycleChip: { paddingHorizontal: 11, borderRadius: 9 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  tlabel: { color: C.text, fontSize: 15 },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
});
