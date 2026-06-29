import { useEffect, useState, useCallback } from 'react';
import { View, Text, Image, Pressable, FlatList, RefreshControl, ActivityIndicator, Modal, ScrollView, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getReceipts, getReceipt, scanReceipt, fileSource, type ReceiptSummary, type ReceiptDetail } from '../api';

export function ReceiptsScreen() {
  const [rows, setRows] = useState<ReceiptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getReceipts()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function open(id: string) {
    setDetailLoading(true);
    try { setDetail(await getReceipt(id)); } catch (e) { setErr((e as Error).message); }
    finally { setDetailLoading(false); }
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
              <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                {fileSource(detail.file) && <Image source={fileSource(detail.file)} style={s.bigImg} resizeMode="contain" />}
                <View style={s.sumRow}><Text style={s.sumLabel}>Total</Text><Text style={s.sumVal}>{money(detail.total, detail.currency)}</Text></View>
                <Text style={s.dim}>{shortDate(detail.date)}{detail.paymentMethod ? `  ·  ${detail.paymentMethod}` : ''}</Text>
                {detail.lineItems.length > 0 && (
                  <View style={s.lines}>
                    {detail.lineItems.map((l, i) => (
                      <View key={i} style={s.lineRow}>
                        <Text style={s.lineName} numberOfLines={1}>{l.qty > 1 ? `${l.qty}× ` : ''}{l.name || '—'}</Text>
                        <Text style={s.linePrice}>{money(l.price * (l.qty || 1), detail.currency)}</Text>
                      </View>
                    ))}
                  </View>
                )}
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
  modal: { backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '88%', borderWidth: 1, borderColor: C.border },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800', flex: 1 },
  close: { color: C.dim, fontSize: 18, paddingHorizontal: 6 },
  bigImg: { width: '100%', height: 300, borderRadius: 12, backgroundColor: C.surface, marginBottom: 14 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sumLabel: { color: C.dim, fontSize: 14 },
  sumVal: { color: C.text, fontSize: 22, fontWeight: '800' },
  dim: { color: C.faint, fontSize: 12, marginTop: 2 },
  lines: { marginTop: 16, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  lineName: { color: C.text, fontSize: 14, flex: 1 },
  linePrice: { color: C.dim, fontSize: 14 },
});
