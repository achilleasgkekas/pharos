import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Image, Pressable, FlatList, RefreshControl, ActivityIndicator, Modal, ScrollView, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty, Check } from '../ui';
import { getReceipts, getReceipt, scanReceipt, updateReceipt, addReceiptToLibrary, fileSource, type ReceiptSummary, type ReceiptDetail } from '../api';

type LineEdit = { name: string; qty: string; price: string; vatRate: string };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (s: string) => parseFloat(String(s).replace(',', '.')) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ReceiptsScreen() {
  const [rows, setRows] = useState<ReceiptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [eStore, setEStore] = useState('');
  const [eTotal, setETotal] = useState('');
  const [eDate, setEDate] = useState('');
  const [ePay, setEPay] = useState('');
  const [eNotes, setENotes] = useState('');
  const [eVerified, setEVerified] = useState(false);
  const [eLines, setELines] = useState<LineEdit[]>([]);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getReceipts()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  // Prefill editable fields whenever a detail opens (tap or after a scan).
  useEffect(() => {
    if (detail) {
      setEStore(detail.store); setETotal(String(detail.total ?? 0));
      setEDate(detail.date ? detail.date.slice(0, 10) : ''); setEPay(detail.paymentMethod ?? '');
      setENotes(detail.notes ?? ''); setEVerified(detail.verified);
      setELines(detail.lineItems.map((l) => ({ name: l.name, qty: String(l.qty ?? 1), price: String(l.price ?? 0), vatRate: String(l.vatRate ?? 0) })));
    }
  }, [detail]);

  async function open(id: string) {
    setDetailLoading(true);
    try { setDetail(await getReceipt(id)); } catch (e) { setErr((e as Error).message); }
    finally { setDetailLoading(false); }
  }

  const setLine = (i: number, k: keyof LineEdit, v: string) => setELines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const addLine = () => setELines((p) => [...p, { name: '', qty: '1', price: '0', vatRate: '24' }]);
  const removeLine = (i: number) => setELines((p) => p.filter((_, j) => j !== i));
  const lineGross = (l: LineEdit) => num(l.price) * (num(l.qty) || 1) * (1 + num(l.vatRate) / 100);
  // ∑ items → fill the Total field with the gross sum of the lines.
  function fillTotal() {
    const gross = eLines.reduce((s, l) => s + lineGross(l), 0);
    setETotal(gross.toFixed(2));
  }

  async function saveReceipt() {
    if (!detail) return;
    const id = detail.id;
    const t = num(eTotal);
    let net = 0, vat = 0;
    const lines = eLines
      .filter((l) => l.name.trim() || num(l.price) > 0)
      .map((l) => { const q = num(l.qty) || 1, p = num(l.price), r = num(l.vatRate); net += p * q; vat += p * q * r / 100; return { name: l.name.trim(), qty: q, price: p, vatRate: r }; });
    setDetail(null);
    try {
      await updateReceipt(id, {
        store: eStore.trim(),
        total: Number.isFinite(t) ? t : undefined,
        date: DATE_RE.test(eDate.trim()) ? eDate.trim() : undefined,
        paymentMethod: ePay.trim(),
        notes: eNotes,
        verified: eVerified,
        lineItems: lines,
        ...(lines.length ? { subtotal: round2(net), vatAmount: round2(vat) } : {}),
      });
      await load();
    } catch (e) { setErr((e as Error).message); }
  }
  async function archiveReceipt() {
    if (!detail) return;
    const id = detail.id;
    setDetail(null);
    try { await updateReceipt(id, { archived: true }); await load(); } catch (e) { setErr((e as Error).message); }
  }
  const [addingLib, setAddingLib] = useState(false);
  async function addToLibrary() {
    if (!detail) return;
    setAddingLib(true);
    try {
      const r = await addReceiptToLibrary(detail.id);
      Alert.alert('Added to inventory', `${r.created} created, ${r.linked} already existed.`);
    } catch (e) { Alert.alert('Failed', (e as Error).message); }
    finally { setAddingLib(false); }
  }

  async function scan() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera needed', 'Allow camera access to scan a receipt.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    setScanning(true);
    setErr(null);
    try {
      const r = await scanReceipt(res.assets[0].uri);
      await load();
      setDetail(r);
    } catch (e) { setErr((e as Error).message); }
    finally { setScanning(false); }
  }

  if (loading) return <Spinner />;

  return (
    <View style={s.wrap}>
      <Pressable onPress={scan} disabled={scanning} style={s.scan}>
        {scanning ? <ActivityIndicator color={C.cyan} /> : <Text style={s.scanText}>📷  Scan a receipt</Text>}
      </Pressable>
      <ErrorText>{err}</ErrorText>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No receipts. Tap “Scan a receipt”.</Empty>}
        renderItem={({ item }) => {
          const src = fileSource(item.thumb || item.file);
          return (
            <Pressable onPress={() => open(item.id)} style={s.row}>
              {src ? <Image source={src} style={s.thumb} resizeMode="cover" /> : <View style={[s.thumb, s.thumbEmpty]}><Text style={s.thumbTxt}>🧾</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.store} numberOfLines={1}>{item.store}</Text>
                <Text style={s.meta}>{[shortDate(item.date), `${item.itemCount} item${item.itemCount === 1 ? '' : 's'}`].filter(Boolean).join('  ·  ')}</Text>
              </View>
              <Text style={s.total}>{money(item.total, item.currency)}</Text>
            </Pressable>
          );
        }}
      />

      <Modal visible={!!detail || detailLoading} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle} numberOfLines={1}>{detail?.store || 'Receipt'}</Text>
              <Pressable onPress={() => setDetail(null)} hitSlop={10}><Text style={s.close}>✕</Text></Pressable>
            </View>
            {detailLoading && !detail ? <ActivityIndicator color={C.accent} style={{ margin: 30 }} /> : detail ? (
              <ScrollView contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
                {fileSource(detail.file) && <Image source={fileSource(detail.file)} style={s.bigImg} resizeMode="contain" />}
                <Text style={s.elabel}>STORE</Text>
                <TextInput value={eStore} onChangeText={setEStore} style={s.einput} placeholderTextColor={C.faint} />
                <View style={s.rowFields}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.elabel}>DATE (YYYY-MM-DD)</Text>
                    <TextInput value={eDate} onChangeText={setEDate} placeholder="2026-06-30" autoCapitalize="none" style={s.einput} placeholderTextColor={C.faint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.elabel}>PAYMENT</Text>
                    <TextInput value={ePay} onChangeText={setEPay} placeholder="card / cash" style={s.einput} placeholderTextColor={C.faint} />
                  </View>
                </View>
                <View style={s.totalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.elabel}>TOTAL ({detail.currency})</Text>
                    <TextInput value={eTotal} onChangeText={setETotal} keyboardType="decimal-pad" style={s.einput} placeholderTextColor={C.faint} />
                  </View>
                  <Pressable onPress={fillTotal} disabled={!eLines.length} style={[s.sumBtn, !eLines.length && s.dim]}><Text style={s.sumText}>∑ items</Text></Pressable>
                </View>

                <View style={s.linesHead}>
                  <Text style={s.elabel}>LINE ITEMS</Text>
                  <Pressable onPress={addLine} hitSlop={8}><Text style={s.addLine}>+ add</Text></Pressable>
                </View>
                {eLines.map((l, i) => (
                  <View key={i} style={s.lineEdit}>
                    <View style={s.lineTop}>
                      <TextInput value={l.name} onChangeText={(v) => setLine(i, 'name', v)} placeholder="item name" placeholderTextColor={C.faint} style={[s.einput, { flex: 1 }]} />
                      <Pressable onPress={() => removeLine(i)} hitSlop={8} style={s.lineDel}><Text style={s.lineDelTxt}>✕</Text></Pressable>
                    </View>
                    <View style={s.lineSub}>
                      <View style={s.lineCell}><Text style={s.cellLab}>QTY</Text><TextInput value={l.qty} onChangeText={(v) => setLine(i, 'qty', v)} keyboardType="decimal-pad" style={s.cellInput} placeholderTextColor={C.faint} /></View>
                      <View style={s.lineCell}><Text style={s.cellLab}>NET {detail.currency}</Text><TextInput value={l.price} onChangeText={(v) => setLine(i, 'price', v)} keyboardType="decimal-pad" style={s.cellInput} placeholderTextColor={C.faint} /></View>
                      <View style={s.lineCell}><Text style={s.cellLab}>VAT %</Text><TextInput value={l.vatRate} onChangeText={(v) => setLine(i, 'vatRate', v)} keyboardType="decimal-pad" style={s.cellInput} placeholderTextColor={C.faint} /></View>
                      <Text style={s.lineGross}>{money(lineGross(l), detail.currency)}</Text>
                    </View>
                  </View>
                ))}

                <Text style={s.elabel}>NOTES</Text>
                <TextInput value={eNotes} onChangeText={setENotes} multiline placeholder="optional" placeholderTextColor={C.faint} style={[s.einput, { minHeight: 56, textAlignVertical: 'top' }]} />

                <Pressable onPress={() => setEVerified((v) => !v)} style={s.toggle}>
                  <Check checked={!!eVerified} />
                  <Text style={s.tlabel}>Verified</Text>
                </Pressable>

                {detail.lineItems.length > 0 && (
                  <Pressable onPress={addToLibrary} disabled={addingLib} style={[s.libBtn, addingLib && s.dim]}>
                    {addingLib ? <ActivityIndicator color={C.accent} size="small" /> : <Text style={s.libText}>＋ Add items to inventory</Text>}
                  </Pressable>
                )}
                <View style={s.mbtns}>
                  <Pressable onPress={saveReceipt} style={s.save}><Text style={s.saveText}>Save</Text></Pressable>
                  <Pressable onPress={archiveReceipt} style={s.del}><Text style={s.delText}>Not a receipt</Text></Pressable>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  scan: { margin: 16, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, paddingVertical: 12, alignItems: 'center' },
  scanText: { color: C.cyan, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12, marginBottom: 10 },
  thumb: { width: 46, height: 46, borderRadius: 8, backgroundColor: C.surface2 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbTxt: { fontSize: 20 },
  store: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 3 },
  total: { color: C.text, fontSize: 16, fontWeight: '700' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '92%', borderWidth: 1, borderColor: C.border },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800', flex: 1 },
  close: { color: C.dim, fontSize: 18, paddingHorizontal: 6 },
  bigImg: { width: '100%', height: 260, borderRadius: 12, backgroundColor: C.surface, marginBottom: 14 },
  dim: { opacity: 0.4 },
  elabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  einput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 15 },
  rowFields: { flexDirection: 'row', gap: 10 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  sumBtn: { borderWidth: 1, borderColor: C.cyan, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 0 },
  sumText: { color: C.cyan, fontSize: 14, fontWeight: '700' },
  linesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addLine: { color: C.cyan, fontSize: 13, fontWeight: '700', marginTop: 12 },
  lineEdit: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10, marginTop: 8, backgroundColor: C.surface },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineDel: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  lineDelTxt: { color: C.red, fontSize: 16, fontWeight: '700' },
  lineSub: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  lineCell: { flex: 1 },
  cellLab: { color: C.faint, fontSize: 9, letterSpacing: 0.8, marginBottom: 4 },
  cellInput: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, color: C.text, fontSize: 14 },
  lineGross: { color: C.dim, fontSize: 13, fontWeight: '600', paddingBottom: 9, minWidth: 56, textAlign: 'right' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  tlabel: { color: C.text, fontSize: 15 },
  libBtn: { marginTop: 18, borderWidth: 1, borderColor: C.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  libText: { color: C.accent, fontSize: 15, fontWeight: '700' },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  save: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  saveText: { color: '#000', fontSize: 15, fontWeight: '700' },
  del: { paddingVertical: 12, paddingHorizontal: 12 },
  delText: { color: C.gold, fontSize: 15, fontWeight: '600' },
});
