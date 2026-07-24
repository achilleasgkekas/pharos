import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ScrollView, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty, Input, TextArea, Button, IconButton, ListItem, Chip, ModalSheet, contentWidth } from '../ui';
import { getExpenses, addExpense, deleteExpense, updateExpense, rescanExpense, scanExpenseImage, fileSource, type Expense, type ParsedExpenseData, type SplitEntry } from '../api';

const CYCLES = ['monthly', 'quarterly', 'yearly', 'weekly'] as const;
// Same GR presets as the web tax-category picker (lib/taxonomies.ts TAX_CATEGORY_PRESETS) — free-form field, these are just suggestion chips.
const TAX_CATEGORY_PRESETS = ['Ιατρικά έξοδα', 'Δωρεές', 'Τόκοι στεγαστικού δανείου', 'Ενοίκιο (φοιτητές/παιδιά)', 'Ασφάλιστρα ζωής', 'Δαπάνες αναπηρίας', 'Επαγγελματικά έξοδα', 'Άλλο'];

// P35 mobile parity — mirrors apps/web/src/lib/split.ts (kept tiny + local, no shared
// package between web/mobile). YOU paid the total; each SplitEntry is another person
// who owes you their `share` (settled = paid back).
function splitTotals(split: SplitEntry[] = []): { owed: number; settled: number } {
  let owed = 0;
  let settled = 0;
  for (const s of split) {
    if (s?.settled) settled += Number(s.share) || 0;
    else owed += Number(s?.share) || 0;
  }
  return { owed: Math.round(owed * 100) / 100, settled: Math.round(settled * 100) / 100 };
}
function equalSplit(total: number, names: string[], includeSelf: boolean): SplitEntry[] {
  const clean = (names || []).map((n) => (n || '').trim()).filter(Boolean);
  if (clean.length === 0) return [];
  const gross = Math.max(0, Math.round((Number(total) || 0) * 100));
  const parts = includeSelf ? clean.length + 1 : clean.length;
  const baseCents = Math.floor(gross / parts);
  if (includeSelf) {
    const share = baseCents / 100;
    return clean.map((name) => ({ name, share, settled: false }));
  }
  let remainder = gross - baseCents * parts;
  return clean.map((name) => {
    const cents = baseCents + (remainder-- > 0 ? 1 : 0);
    return { name, share: cents / 100, settled: false };
  });
}

// Balances (P35 follow-up, mobile parity): aggregate split entries across ALL expenses
// into a per-person balance sheet. Mirrors apps/web/src/lib/split.ts computeBalances().
type PersonBalance = { name: string; owed: number; settled: number; entries: number };
function computeBalances(expenses: Array<{ split?: SplitEntry[] | null }>): PersonBalance[] {
  const m = new Map<string, PersonBalance>();
  for (const e of expenses) {
    for (const s of e.split ?? []) {
      const name = (s?.name || '').trim();
      const key = name.toLowerCase();
      if (!key) continue;
      const cur = m.get(key) ?? { name, owed: 0, settled: 0, entries: 0 };
      if (s.settled) cur.settled += Number(s.share) || 0;
      else cur.owed += Number(s.share) || 0;
      cur.entries += 1;
      m.set(key, cur);
    }
  }
  return [...m.values()]
    .map((b) => ({ ...b, owed: Math.round(b.owed * 100) / 100, settled: Math.round(b.settled * 100) / 100 }))
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
}

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
  const [eTaxDeductible, setETaxDeductible] = useState(false);
  const [eTaxCategory, setETaxCategory] = useState('');
  const [eSplit, setESplit] = useState<SplitEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<ParsedExpenseData | null>(null);
  const [dVendor, setDVendor] = useState('');
  const [dAmount, setDAmount] = useState('');
  const [dCategory, setDCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [settling, setSettling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getExpenses(kind)); } catch (e) { setErr((e as Error).message); }
  }, [kind]);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  // Distinct vendors already seen (case-insensitive dedup, keeps first casing), for add-form autocomplete.
  const vendorList = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.vendor) m.set(r.vendor.toLowerCase(), r.vendor);
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const vq = vendor.trim().toLowerCase();
  const vendorSuggestions = vq
    ? vendorList.filter((v) => v.toLowerCase().includes(vq) && v.toLowerCase() !== vq).slice(0, 6)
    : [];

  // Balances (P35 follow-up): only expenses carry a split, income never does.
  const balances = useMemo(() => (kind === 'expense' ? computeBalances(rows) : []), [rows, kind]);
  const totalOwedToYou = useMemo(() => Math.round(balances.reduce((s, b) => s + b.owed, 0) * 100) / 100, [balances]);

  // Settle up with one person: mark every unsettled split entry with this name (case-
  // insensitive) as settled, across every expense that has one. No dedicated v1 endpoint
  // for this yet, so it patches each affected expense's split via the existing PATCH.
  async function settlePerson(name: string) {
    const target = name.trim().toLowerCase();
    const affected = rows.filter((r) => (r.split || []).some((sp) => !sp.settled && sp.name.trim().toLowerCase() === target));
    if (affected.length === 0) return;
    setSettling(name);
    try {
      for (const r of affected) {
        const next = (r.split || []).map((sp) => (sp.name.trim().toLowerCase() === target ? { ...sp, settled: true } : sp));
        await updateExpense(r.id, { split: next });
      }
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSettling(null); }
  }

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
  // Fill the edit-form fields from an Expense (shared by open + re-scan re-prefill).
  function prefill(it: Expense) {
    setEVendor(it.vendor); setEAmount(String(it.amount)); setECategory(it.category);
    setEDate(it.date ? it.date.slice(0, 10) : ''); setEPeriod(it.period || '');
    setERecurring(!!it.recurring); setECycle(it.recurringCycle || '');
    setEPayment(it.paymentMethod || ''); setENotes(it.notes || '');
    setETaxDeductible(!!it.taxDeductible); setETaxCategory(it.taxCategory || '');
    setESplit(it.split || []);
  }
  function openEdit(it: Expense) { setEditing(it); prefill(it); }

  // Re-run the AI on the stored bill: ocr=true forces OCR, false uses embedded text / vision.
  const [rescanning, setRescanning] = useState<null | 'ocr' | 'text'>(null);
  async function rescan(ocr: boolean) {
    if (!editing || rescanning) return;
    setRescanning(ocr ? 'ocr' : 'text');
    try {
      const updated = await rescanExpense(editing.id, ocr);
      setEditing(updated);
      prefill(updated); // store/amount/date/category/etc refresh in place
      await load();
    } catch (e) { Alert.alert('Re-scan failed', (e as Error).message); }
    finally { setRescanning(null); }
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
        taxDeductible: eTaxDeductible,
        taxCategory: eTaxCategory.trim(),
        split: eSplit,
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
      {balances.length > 0 && (
        <Pressable onPress={() => setShowBalances(true)} style={s.balancesRow} hitSlop={6}>
          <Text style={s.balancesBtn}>⇄ Balances{totalOwedToYou > 0.009 ? ` · ${money(totalOwedToYou, cur)} owed` : ''}</Text>
        </Pressable>
      )}
      <View style={s.addRow}>
        <Input value={vendor} onChangeText={setVendor} placeholder={label} style={{ flex: 2 }} />
        <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" style={{ flex: 1 }} />
        <Pressable onPress={scan} disabled={scanning} style={[s.scanBtn, scanning && s.dim]}>
          {scanning ? <ActivityIndicator color={C.cyan} size="small" /> : <Text style={s.scanText}>✦</Text>}
        </Pressable>
        <IconButton glyph="＋" onPress={add} disabled={!vendor.trim() || !amount.trim()} />
      </View>
      {vendorSuggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.suggestRow}>
          {vendorSuggestions.map((v) => (
            <Chip key={v} label={v} onPress={() => setVendor(v)} />
          ))}
        </ScrollView>
      )}
      <Text style={s.hint}>✦ scan a {kind === 'income' ? 'payslip' : 'bill'} with AI</Text>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[{ padding: 16, paddingTop: 4 }, contentWidth]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>Nothing here yet.</Empty>}
        renderItem={({ item }) => (
          <ListItem onPress={() => openEdit(item)} onLongPress={() => remove(item)}>
            <View style={{ flex: 1 }}>
              <Text style={s.vendor}>{item.vendor || '—'}</Text>
              <Text style={s.meta}>{[item.category, shortDate(item.date), item.recurring ? 'recurring' : ''].filter(Boolean).join('  ·  ')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[s.amount, { color: kind === 'income' ? C.accent : C.text }]}>{money(item.amount, item.currency)}</Text>
              {item.split && item.split.length > 0 && (
                <Text style={s.splitBadge}>
                  {splitTotals(item.split).owed > 0.009 ? `⇄ ${money(splitTotals(item.split).owed, item.currency)}` : '⇄ ✓'}
                </Text>
              )}
              {item.taxDeductible && <Text style={s.taxBadge}>🏛 tax</Text>}
              {item.anomaly != null && (
                <Text style={s.anomaly}>⚠ {item.anomaly > 0 ? '+' : ''}{item.anomaly}%</Text>
              )}
            </View>
          </ListItem>
        )}
      />

      <ModalSheet visible={!!draft} onClose={() => setDraft(null)} cardStyle={s.modalMax}>
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
              <Button label={saving ? 'Adding…' : 'Add'} onPress={saveDraft} disabled={saving} />
              <Button label="Discard" onPress={() => setDraft(null)} variant="danger" />
            </View>
      </ModalSheet>

      <ModalSheet visible={!!editing} onClose={() => setEditing(null)} cardStyle={s.modalMax}>
            <Text style={s.modalTitle}>Edit</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {editing && fileSource(editing.file) && <Image source={fileSource(editing.file)} style={s.bigImg} resizeMode="contain" />}
              {editing?.file && (
                <View style={s.rescanBar}>
                  <Text style={s.rescanLabel}>Re-scan</Text>
                  <Pressable onPress={() => rescan(false)} disabled={!!rescanning} style={[s.rescanBtn, !!rescanning && s.dim]}>
                    {rescanning === 'text' ? <ActivityIndicator color={C.cyan} size="small" /> : <Text style={s.rescanText}>text</Text>}
                  </Pressable>
                  <Pressable onPress={() => rescan(true)} disabled={!!rescanning} style={[s.rescanBtn, !!rescanning && s.dim]}>
                    {rescanning === 'ocr' ? <ActivityIndicator color={C.cyan} size="small" /> : <Text style={s.rescanText}>OCR</Text>}
                  </Pressable>
                </View>
              )}
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
                <Text style={s.recLabel}>🏛 Tax deductible</Text>
                <Pressable onPress={() => setETaxDeductible((v) => !v)} style={[s.toggle, eTaxDeductible && s.toggleOn]}>
                  <Text style={[s.toggleText, eTaxDeductible && s.toggleTextOn]}>{eTaxDeductible ? 'ON' : 'OFF'}</Text>
                </Pressable>
              </View>
              {eTaxDeductible && (
                <>
                  <Text style={s.mlabel}>TAX CATEGORY</Text>
                  <Input variant="modal" value={eTaxCategory} onChangeText={setETaxCategory} placeholder="e.g. Ιατρικά έξοδα" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.suggestRow}>
                    {TAX_CATEGORY_PRESETS.map((c) => (
                      <Chip key={c} label={c} onPress={() => setETaxCategory(c)} />
                    ))}
                  </ScrollView>
                </>
              )}
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
              <SplitEditor split={eSplit} amount={Number(eAmount.replace(',', '.')) || 0} onChange={setESplit} />
            </ScrollView>
            <View style={s.mbtns}>
              <Button label="Save" onPress={saveEdit} />
              <Button label="Delete" onPress={() => { const e = editing; setEditing(null); if (e) remove(e); }} variant="danger" />
            </View>
      </ModalSheet>

      <ModalSheet visible={showBalances} onClose={() => setShowBalances(false)} cardStyle={s.modalMax}>
            <Text style={s.modalTitle}>Balances</Text>
            <Text style={s.scanNote}>Who owes you, across all expenses.</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ marginTop: 12 }}>
              {balances.filter((b) => b.owed > 0.009).map((b) => (
                <View key={b.name} style={s.balanceRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.balanceName} numberOfLines={1}>{b.name}</Text>
                    <Text style={s.splitHint}>{b.entries} entr{b.entries === 1 ? 'y' : 'ies'}{b.settled > 0.009 ? ` · ${money(b.settled, cur)} settled` : ''}</Text>
                  </View>
                  <Text style={s.balanceAmount}>{money(b.owed, cur)}</Text>
                  <Pressable
                    onPress={() => Alert.alert('Settle up', `Mark ${b.name}'s ${money(b.owed, cur)} as paid back?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Mark paid', onPress: () => settlePerson(b.name) },
                    ])}
                    disabled={settling === b.name}
                    style={[s.settleBtn, settling === b.name && s.dim]}
                  >
                    {settling === b.name ? <ActivityIndicator color={C.accent} size="small" /> : <Text style={s.settleBtnText}>settle</Text>}
                  </Pressable>
                </View>
              ))}
              {balances.filter((b) => b.owed <= 0.009).length > 0 && (
                <>
                  <Text style={s.mlabel}>SETTLED UP</Text>
                  {balances.filter((b) => b.owed <= 0.009).map((b) => (
                    <View key={b.name} style={s.balanceRowSettled}>
                      <Text style={s.splitHint} numberOfLines={1}>{b.name}</Text>
                      <Text style={s.balanceCheck}>✓</Text>
                    </View>
                  ))}
                </>
              )}
              {balances.length === 0 && <Empty>No one owes you anything yet.</Empty>}
            </ScrollView>
      </ModalSheet>
    </View>
  );
}

/** Expense splitting (P35 mobile parity): list the people who owe you a share of this
 *  expense. You paid the total; each row is another person and what they owe.
 *  "Split equally" divides the amount among the named people (optionally counting
 *  yourself). Mirrors the web SplitEditor in apps/web/src/app/expenses/ExpensesClient.tsx. */
function SplitEditor({ split, amount, onChange }: { split: SplitEntry[]; amount: number; onChange: (s: SplitEntry[]) => void }) {
  const [includeSelf, setIncludeSelf] = useState(true);
  const totals = splitTotals(split);
  const yourShare = Math.round((amount - split.reduce((sum, e) => sum + (e.share || 0), 0)) * 100) / 100;

  function setRow(i: number, p: Partial<SplitEntry>) {
    onChange(split.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addRow() { onChange([...split, { name: '', share: 0, settled: false }]); }
  function removeRow(i: number) { onChange(split.filter((_, idx) => idx !== i)); }
  function splitEqually() {
    const names = split.map((r) => r.name);
    if (names.filter((n) => n.trim()).length === 0) return;
    const fresh = equalSplit(amount, names, includeSelf);
    onChange(fresh.map((f) => ({ ...f, settled: split.find((r) => r.name.trim().toLowerCase() === f.name.toLowerCase())?.settled ?? false })));
  }

  return (
    <View style={s.splitBox}>
      <View style={s.splitHeader}>
        <Text style={s.splitTitle}>⇄ Split</Text>
        {split.length > 0 && (
          <Text style={s.splitHint}>
            {money(totals.owed)} owed to you{totals.settled > 0 ? ` · ${money(totals.settled)} settled` : ''}
          </Text>
        )}
      </View>
      {split.length === 0 ? (
        <Text style={s.splitHint}>No split yet — everyone pays their own way.</Text>
      ) : (
        split.map((r, i) => (
          <View key={i} style={s.splitRow}>
            <Input variant="modal" value={r.name} onChangeText={(t) => setRow(i, { name: t })} placeholder="Name" style={{ flex: 1 }} />
            <Input variant="modal" value={r.share ? String(r.share) : ''} onChangeText={(t) => setRow(i, { share: parseFloat(t.replace(',', '.')) || 0 })} keyboardType="decimal-pad" placeholder="0.00" style={{ width: 72 }} />
            <Pressable onPress={() => setRow(i, { settled: !r.settled })} hitSlop={8} style={[s.splitMark, r.settled && s.splitMarkOn]}>
              <Text style={[s.splitMarkText, r.settled && s.splitMarkTextOn]}>✓</Text>
            </Pressable>
            <Pressable onPress={() => removeRow(i)} hitSlop={8} style={s.splitDel}>
              <Text style={s.splitDelText}>✕</Text>
            </Pressable>
          </View>
        ))
      )}
      <View style={s.splitActions}>
        <Pressable onPress={addRow}><Text style={s.splitAction}>+ add person</Text></Pressable>
        {split.some((r) => r.name.trim()) && (
          <>
            <Pressable onPress={splitEqually}><Text style={[s.splitAction, { color: C.cyan }]}>⇄ split equally</Text></Pressable>
            <Pressable onPress={() => setIncludeSelf((v) => !v)} style={s.splitSelf}>
              <View style={[s.checkboxSm, includeSelf && s.checkboxSmOn]}>{includeSelf ? <Text style={s.checkboxSmMark}>✓</Text> : null}</View>
              <Text style={s.splitHint}>count me in</Text>
            </Pressable>
          </>
        )}
      </View>
      {split.length > 0 && <Text style={s.splitYourShare}>your share: {money(yourShare)}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14 },
  totalLabel: { color: C.faint, fontSize: 11, letterSpacing: 1 },
  total: { fontSize: 22, fontWeight: '800' },
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  scanBtn: { width: 46, borderRadius: 12, borderWidth: 1, borderColor: C.cyan, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  scanText: { color: C.cyan, fontSize: 20, fontWeight: '700' },
  suggestRow: { gap: 6, paddingHorizontal: 16, paddingBottom: 6 },
  hint: { color: C.faint, fontSize: 11, paddingHorizontal: 16, marginTop: -2, marginBottom: 4 },
  scanNote: { color: C.dim, fontSize: 12, marginTop: 4 },
  scanMeta: { color: C.faint, fontSize: 12, marginTop: 10 },
  dim: { opacity: 0.4 },
  vendor: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 3 },
  amount: { fontSize: 16, fontWeight: '700' },
  anomaly: { color: C.gold, fontSize: 10, fontWeight: '700', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.gold, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  taxBadge: { color: C.gold, fontSize: 10, fontWeight: '700', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.gold, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  modalMax: { maxHeight: '88%' },
  bigImg: { width: '100%', height: 220, borderRadius: 12, backgroundColor: C.surface2, marginTop: 12 },
  rescanBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  rescanLabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, flex: 1 },
  rescanBtn: { borderWidth: 1, borderColor: C.cyan, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, minWidth: 56, alignItems: 'center' },
  rescanText: { color: C.cyan, fontSize: 13, fontWeight: '700' },
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
  splitBadge: { color: C.cyan, fontSize: 10, fontWeight: '700', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.cyan, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  splitBox: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginTop: 14 },
  splitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  splitTitle: { color: C.cyan, fontSize: 13, fontWeight: '700' },
  splitHint: { color: C.faint, fontSize: 11 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  splitMark: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  splitMarkOn: { borderColor: C.accent, backgroundColor: C.surface2 },
  splitMarkText: { color: C.faint, fontSize: 13, fontWeight: '700' },
  splitMarkTextOn: { color: C.accent },
  splitDel: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  splitDelText: { color: C.faint, fontSize: 13 },
  splitActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 4 },
  splitAction: { color: C.accent, fontSize: 12, fontWeight: '600' },
  splitSelf: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkboxSm: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkboxSmOn: { borderColor: C.cyan, backgroundColor: C.cyan },
  checkboxSmMark: { color: C.onAccent, fontSize: 10, fontWeight: '800' },
  splitYourShare: { color: C.faint, fontSize: 11, marginTop: 8, textAlign: 'right' },
  balancesRow: { paddingHorizontal: 16, marginTop: 6 },
  balancesBtn: { color: C.cyan, fontSize: 12, fontWeight: '700' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, backgroundColor: C.surface },
  balanceName: { color: C.text, fontSize: 15, fontWeight: '700' },
  balanceAmount: { color: C.gold, fontSize: 16, fontWeight: '800' },
  settleBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: C.surface2, minWidth: 58, alignItems: 'center' },
  settleBtnText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  balanceRowSettled: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 6 },
  balanceCheck: { color: C.accent, fontSize: 13, fontWeight: '800' },
});
