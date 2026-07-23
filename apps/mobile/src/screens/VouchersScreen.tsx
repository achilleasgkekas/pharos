import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ScrollView, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../theme';
import { shortDate, money, Spinner, ErrorText, Empty, Check, Input, TextArea, Button, IconButton, Card, Badge, Chip, ModalSheet, contentWidth } from '../ui';
import {
  getVouchers, addVoucher, deleteVoucher, updateVoucher, scanVoucherText, scanVoucherImage, type Voucher, type ParsedVoucherData,
  getGiftCards, addGiftCard, updateGiftCard, deleteGiftCard, addGiftCardUse, removeGiftCardUse, type GiftCard,
} from '../api';

type Draft = { title: string; code: string; store: string; discount: string; expiresAt: string; url: string; used: boolean };
const EMPTY: Draft = { title: '', code: '', store: '', discount: '', expiresAt: '', url: '', used: false };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function VouchersScreen() {
  const [tab, setTab] = useState<'coupons' | 'giftcards'>('coupons');
  return (
    <View style={s.wrap}>
      <View style={s.tabRow}>
        <Chip label="Coupons" on={tab === 'coupons'} onPress={() => setTab('coupons')} />
        <Chip label="Gift cards" on={tab === 'giftcards'} onPress={() => setTab('giftcards')} />
      </View>
      {tab === 'coupons' ? <CouponsTab /> : <GiftCardsTab />}
    </View>
  );
}

function CouponsTab() {
  const [rows, setRows] = useState<Voucher[]>([]);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 'new' = creating a draft (no Used toggle, no Delete); a Voucher = editing.
  const [editing, setEditing] = useState<Voucher | 'new' | null>(null);
  const [form, setForm] = useState<Draft>(EMPTY);
  const setF = (k: keyof Draft, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getVouchers()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const [showScan, setShowScan] = useState(false);
  const [scanText, setScanText] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  // Open a draft prefilled with everything the AI found, for review before saving.
  function draftFromParsed(d: ParsedVoucherData) {
    setForm({
      title: d.title ?? title.trim(), code: d.code ?? code.trim(), store: d.store ?? '',
      discount: d.discount ?? '', expiresAt: ymd(d.expiresAt ?? null), url: d.url ?? '', used: false,
    });
    setEditing('new');
    setShowScan(false); setScanText('');
  }
  async function doScanText() {
    const txt = scanText.trim();
    if (!txt) return;
    setScanBusy(true); setErr(null);
    try { draftFromParsed(await scanVoucherText(txt)); }
    catch (e) { setErr((e as Error).message); }
    finally { setScanBusy(false); }
  }
  async function doScanPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera needed', 'Allow camera access to scan a voucher.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    setScanBusy(true); setErr(null);
    try { draftFromParsed(await scanVoucherImage(res.assets[0].uri)); }
    catch (e) { setErr((e as Error).message); }
    finally { setScanBusy(false); }
  }

  // Inline quick-add: title (+code) only.
  async function quickAdd() {
    const t = title.trim();
    if (!t) return;
    setTitle(''); setCode('');
    try { await addVoucher({ title: t, code: code.trim() }); await load(); } catch (e) { setErr((e as Error).message); }
  }

  function remove(it: Voucher) {
    Alert.alert('Delete', `Delete "${it.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteVoucher(it.id); } catch { await load(); } } },
    ]);
  }

  function openEdit(it: Voucher) {
    setForm({ title: it.title, code: it.code, store: it.store, discount: it.discount, expiresAt: ymd(it.expiresAt), url: it.url, used: it.used });
    setEditing(it);
  }

  async function saveForm() {
    if (!editing || !form.title.trim()) return;
    const exp = DATE_RE.test(form.expiresAt.trim()) ? form.expiresAt.trim() : null;
    const target = editing;
    setEditing(null);
    try {
      if (target === 'new') {
        await addVoucher({ title: form.title.trim(), code: form.code.trim(), store: form.store.trim(), discount: form.discount.trim(), expiresAt: exp, url: form.url.trim() });
      } else {
        await updateVoucher(target.id, { title: form.title.trim(), code: form.code.trim(), store: form.store.trim(), discount: form.discount.trim(), expiresAt: exp, url: form.url.trim(), used: form.used });
      }
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  if (loading) return <Spinner />;
  const isNew = editing === 'new';

  return (
    <View style={s.tabWrap}>
      <View style={s.addRow}>
        <Input value={title} onChangeText={setTitle} placeholder="title" style={{ flex: 2 }} />
        <Input value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="code" style={{ flex: 1 }} />
        <Pressable onPress={() => setShowScan(true)} style={s.aiBtn}><Text style={s.aiText}>✦</Text></Pressable>
        <IconButton glyph="＋" onPress={quickAdd} disabled={!title.trim()} />
      </View>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(v) => v.id}
        contentContainerStyle={[{ padding: 16 }, contentWidth]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No vouchers.</Empty>}
        renderItem={({ item }) => (
          <Card onPress={() => openEdit(item)} onLongPress={() => remove(item)} style={item.used && s.faded}>
            <View style={s.top}>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              {!!item.discount && <Text style={s.discount}>{item.discount}</Text>}
            </View>
            <Text style={s.meta}>{[item.store, item.expiresAt ? `exp ${shortDate(item.expiresAt)}` : '', item.used ? 'used' : ''].filter(Boolean).join('  ·  ')}</Text>
            {!!item.code && <View style={s.codeBox}><Text style={s.code}>{item.code}</Text></View>}
          </Card>
        )}
      />

      <ModalSheet visible={!!editing} onClose={() => setEditing(null)}>
            <Text style={s.modalTitle}>{isNew ? '✦ New voucher' : 'Edit voucher'}</Text>
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <Text style={s.mlabel}>TITLE</Text>
              <Input variant="modal" value={form.title} onChangeText={(v) => setF('title', v)} />
              <Text style={s.mlabel}>CODE</Text>
              <Input variant="modal" value={form.code} onChangeText={(v) => setF('code', v)} autoCapitalize="characters" />
              <Text style={s.mlabel}>STORE</Text>
              <Input variant="modal" value={form.store} onChangeText={(v) => setF('store', v)} />
              <View style={s.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>DISCOUNT</Text>
                  <Input variant="modal" value={form.discount} onChangeText={(v) => setF('discount', v)} placeholder="e.g. 15%" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>EXPIRES (YYYY-MM-DD)</Text>
                  <Input variant="modal" value={form.expiresAt} onChangeText={(v) => setF('expiresAt', v)} placeholder="2026-12-31" autoCapitalize="none" />
                </View>
              </View>
              <Text style={s.mlabel}>URL</Text>
              <Input variant="modal" value={form.url} onChangeText={(v) => setF('url', v)} autoCapitalize="none" keyboardType="url" />
              {!isNew && (
                <Pressable onPress={() => setF('used', !form.used)} style={s.toggle}>
                  <Check checked={!!form.used} />
                  <Text style={s.tlabel}>Used</Text>
                </Pressable>
              )}
            </ScrollView>
            <View style={s.mbtns}>
              <Button label={isNew ? 'Add' : 'Save'} onPress={saveForm} disabled={!form.title.trim()} />
              {!isNew && editing && (
                <Button label="Delete" onPress={() => { const e = editing; setEditing(null); if (e && typeof e !== 'string') remove(e); }} variant="danger" />
              )}
            </View>
      </ModalSheet>

      <ModalSheet visible={showScan} onClose={() => setShowScan(false)}>
            <Text style={s.modalTitle}>✦ Scan a voucher</Text>
            <Pressable onPress={doScanPhoto} disabled={scanBusy} style={[s.photoBtn, scanBusy && s.dim]}>
              <Text style={s.photoText}>📷  Take a photo</Text>
            </Pressable>
            <Text style={s.mlabel}>OR PASTE THE COUPON TEXT</Text>
            <TextArea variant="modal" value={scanText} onChangeText={setScanText} placeholder="e.g. 15% off at Skroutz, code SAVE15, until 31/12" style={{ minHeight: 90 }} />
            <View style={s.mbtns}>
              <Button label="Fill" onPress={doScanText} disabled={!scanText.trim()} busy={scanBusy} />
              <Button label="Cancel" onPress={() => setShowScan(false)} variant="ghost" />
            </View>
      </ModalSheet>
    </View>
  );
}

// P32 mobile parity — gift card / store-credit balance tracker. `balance`/`spentPct`/
// `daysLeft` are computed server-side (api/v1/giftcards trim()), never here, mirroring
// the web GiftCardsClient's client-side lib/giftcard.ts helpers.
type GcDraft = { title: string; store: string; code: string; initialAmount: string; expiresAt: string; notes: string };
const GC_EMPTY: GcDraft = { title: '', store: '', code: '', initialAmount: '', expiresAt: '', notes: '' };

function GiftCardsTab() {
  const [rows, setRows] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [editing, setEditing] = useState<GiftCard | 'new' | null>(null);
  const [form, setForm] = useState<GcDraft>(GC_EMPTY);
  const setF = (k: keyof GcDraft, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const [spendAmt, setSpendAmt] = useState('');
  const [spendNote, setSpendNote] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getGiftCards()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  function openNew() { setForm(GC_EMPTY); setSpendAmt(''); setSpendNote(''); setEditing('new'); }
  function openEdit(it: GiftCard) {
    setForm({ title: it.title, store: it.store, code: it.code, initialAmount: it.initialAmount ? String(it.initialAmount) : '', expiresAt: ymd(it.expiresAt), notes: it.notes });
    setSpendAmt(''); setSpendNote('');
    setEditing(it);
  }

  function remove(it: GiftCard) {
    Alert.alert('Delete', `Delete "${it.title}"? It moves to Trash.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteGiftCard(it.id); } catch { await load(); } } },
    ]);
  }

  async function saveForm() {
    if (!editing || !form.title.trim()) return;
    const exp = DATE_RE.test(form.expiresAt.trim()) ? form.expiresAt.trim() : null;
    const target = editing;
    const payload = {
      title: form.title.trim(), store: form.store.trim(), code: form.code.trim(),
      initialAmount: parseFloat(form.initialAmount) || 0, expiresAt: exp, notes: form.notes.trim(),
    };
    setEditing(null);
    try {
      if (target === 'new') await addGiftCard(payload);
      else await updateGiftCard(target.id, payload);
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  // Positive amount = spend, negative = reload/top-up. Reloads the list so the
  // balance/uses shown in the (now-closed) modal reflect the write immediately next open.
  async function spend(sign: 1 | -1) {
    if (!editing || editing === 'new' || !spendAmt) return;
    const amt = parseFloat(spendAmt) * sign;
    if (!Number.isFinite(amt) || amt === 0) return;
    const id = editing.id;
    const note = spendNote.trim();
    setSpendAmt(''); setSpendNote('');
    try {
      await addGiftCardUse(id, amt, note);
      const fresh = await getGiftCards();
      setRows(fresh);
      const updated = fresh.find((g) => g.id === id);
      if (updated) setEditing(updated);
    } catch (e) { setErr((e as Error).message); }
  }

  async function removeUse(cardId: string, useId: string) {
    try {
      await removeGiftCardUse(cardId, useId);
      const fresh = await getGiftCards();
      setRows(fresh);
      const updated = fresh.find((g) => g.id === cardId);
      if (updated) setEditing(updated);
    } catch (e) { setErr((e as Error).message); }
  }

  if (loading) return <Spinner />;
  const isNew = editing === 'new';
  const current = !isNew && editing ? rows.find((g) => g.id === editing.id) ?? editing : null;

  return (
    <View style={s.tabWrap}>
      <View style={s.headRow}>
        <Text style={s.headHint}>{rows.filter((g) => !g.archived && g.balance > 0.009).length} active</Text>
        <IconButton glyph="＋" onPress={openNew} />
      </View>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(g) => g.id}
        contentContainerStyle={[{ padding: 16, paddingTop: 8 }, contentWidth]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No gift cards. Track a gift card, store credit, or prepaid balance that decreases as you spend it.</Empty>}
        renderItem={({ item }) => (
          <Card onPress={() => openEdit(item)} onLongPress={() => remove(item)} style={(item.archived || item.balance <= 0.009) && s.faded}>
            <View style={s.top}>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              {item.archived ? <Badge label="archived" color={C.faint} /> : item.daysLeft !== null && (
                <Badge label={item.daysLeft < 0 ? 'expired' : item.daysLeft === 0 ? 'today' : `${item.daysLeft}d left`} color={item.daysLeft < 0 ? C.faint : item.daysLeft <= 30 ? C.gold : C.faint} />
              )}
            </View>
            <Text style={s.meta}>{item.store || 'gift card'}</Text>
            <Text style={s.gcBalance}>{money(Math.max(0, item.balance))}{item.initialAmount > 0 && <Text style={s.gcOf}> of {money(item.initialAmount)}</Text>}</Text>
            {item.initialAmount > 0 && (
              <View style={s.barTrack}><View style={[s.barFill, { width: `${100 - item.spentPct}%` }]} /></View>
            )}
          </Card>
        )}
      />

      <ModalSheet visible={!!editing} onClose={() => setEditing(null)}>
        <Text style={s.modalTitle}>{isNew ? 'New gift card' : 'Edit gift card'}</Text>
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          <Text style={s.mlabel}>TITLE</Text>
          <Input variant="modal" value={form.title} onChangeText={(v) => setF('title', v)} placeholder="IKEA gift card" />
          <View style={s.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={s.mlabel}>STORE</Text>
              <Input variant="modal" value={form.store} onChangeText={(v) => setF('store', v)} placeholder="IKEA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mlabel}>FACE VALUE</Text>
              <Input variant="modal" value={form.initialAmount} onChangeText={(v) => setF('initialAmount', v)} keyboardType="decimal-pad" placeholder="50" />
            </View>
          </View>
          <View style={s.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={s.mlabel}>CODE</Text>
              <Input variant="modal" value={form.code} onChangeText={(v) => setF('code', v)} placeholder="optional" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mlabel}>EXPIRES (YYYY-MM-DD)</Text>
              <Input variant="modal" value={form.expiresAt} onChangeText={(v) => setF('expiresAt', v)} placeholder="2026-12-31" autoCapitalize="none" />
            </View>
          </View>
          <Text style={s.mlabel}>NOTES</Text>
          <Input variant="modal" value={form.notes} onChangeText={(v) => setF('notes', v)} placeholder="optional" />

          {current && (
            <View style={s.gcHistory}>
              <View style={s.top}>
                <Text style={s.mlabel}>BALANCE</Text>
                <Text style={s.gcBalanceLg}>{money(current.balance)}</Text>
              </View>
              <View style={s.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>AMOUNT</Text>
                  <Input variant="modal" value={spendAmt} onChangeText={setSpendAmt} keyboardType="decimal-pad" placeholder="0.00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>NOTE</Text>
                  <Input variant="modal" value={spendNote} onChangeText={setSpendNote} placeholder="optional" />
                </View>
              </View>
              <View style={s.rowFields}>
                <Button label="− Spend" onPress={() => spend(1)} disabled={!spendAmt} variant="ghost" style={{ flex: 1 }} />
                <Button label="+ Reload" onPress={() => spend(-1)} disabled={!spendAmt} variant="ghost" style={{ flex: 1 }} />
              </View>
              {current.uses.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  {[...current.uses].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).map((u) => (
                    <View key={u.id} style={s.useRow}>
                      <Text style={[s.useAmount, u.amount < 0 && s.useAmountReload]}>{u.amount >= 0 ? '−' : '+'}{money(Math.abs(u.amount))}</Text>
                      {!!u.note && <Text style={s.useNote} numberOfLines={1}>{u.note}</Text>}
                      <Text style={s.useDate}>{shortDate(u.date)}</Text>
                      <Pressable onPress={() => removeUse(current.id, u.id)} hitSlop={8}><Text style={s.useRemove}>×</Text></Pressable>
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
  tabWrap: { flex: 1 },
  tabRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  headHint: { color: C.faint, fontSize: 12 },
  aiBtn: { width: 40, borderRadius: 12, borderWidth: 1, borderColor: C.cyan, alignItems: 'center', justifyContent: 'center' },
  aiText: { color: C.cyan, fontSize: 18, fontWeight: '700' },
  dim: { opacity: 0.4 },
  faded: { opacity: 0.55 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { color: C.text, fontSize: 15, fontWeight: '600', flex: 1 },
  discount: { color: C.gold, fontSize: 15, fontWeight: '800' },
  meta: { color: C.faint, fontSize: 12, marginTop: 4 },
  codeBox: { marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.borderLight, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  code: { color: C.cyan, fontSize: 15, letterSpacing: 1.5, fontWeight: '700' },
  gcBalance: { color: C.accent, fontSize: 20, fontWeight: '800', marginTop: 8 },
  gcOf: { color: C.faint, fontSize: 12, fontWeight: '400' },
  gcBalanceLg: { color: C.accent, fontSize: 18, fontWeight: '800' },
  barTrack: { marginTop: 8, height: 5, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: C.accent },
  gcHistory: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border },
  useRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  useAmount: { color: C.text, fontSize: 13, fontWeight: '700' },
  useAmountReload: { color: C.accent },
  useNote: { color: C.faint, fontSize: 12, flex: 1 },
  useDate: { color: C.faint, fontSize: 11 },
  useRemove: { color: C.faint, fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  rowFields: { flexDirection: 'row', gap: 10 },
  photoBtn: { marginTop: 16, borderWidth: 1, borderColor: C.cyan, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  photoText: { color: C.cyan, fontSize: 15, fontWeight: '700' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  tlabel: { color: C.text, fontSize: 15 },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
});
