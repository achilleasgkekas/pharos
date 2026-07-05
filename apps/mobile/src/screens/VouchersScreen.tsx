import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, ScrollView, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../theme';
import { shortDate, Spinner, ErrorText, Empty, Check, Input, TextArea, Button, IconButton, Card, ModalSheet, contentWidth } from '../ui';
import { getVouchers, addVoucher, deleteVoucher, updateVoucher, scanVoucherText, scanVoucherImage, type Voucher, type ParsedVoucherData } from '../api';

type Draft = { title: string; code: string; store: string; discount: string; expiresAt: string; url: string; used: boolean };
const EMPTY: Draft = { title: '', code: '', store: '', discount: '', expiresAt: '', url: '', used: false };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function VouchersScreen() {
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
    <View style={s.wrap}>
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

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
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
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  rowFields: { flexDirection: 'row', gap: 10 },
  photoBtn: { marginTop: 16, borderWidth: 1, borderColor: C.cyan, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  photoText: { color: C.cyan, fontSize: 15, fontWeight: '700' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  tlabel: { color: C.text, fontSize: 15 },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
});
