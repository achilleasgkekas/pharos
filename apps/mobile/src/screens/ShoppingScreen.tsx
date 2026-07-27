import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, ActivityIndicator, RefreshControl, StyleSheet, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C, RADIUS } from '../theme';
import {
  getShoppingList, addListItem, toggleListItem, deleteListItem, scanProduct, lookupBarcode,
  type ListItem, type ScannedProduct,
} from '../api';
import { Button, Check, Empty, IconButton, Input, ModalSheet, Spinner, contentWidth } from '../ui';
import { BarcodeScanner } from '../BarcodeScanner';

export function ShoppingScreen() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScannedProduct | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [looking, setLooking] = useState(false);
  const [scanHint, setScanHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setItems(await getShoppingList()); }
    catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function add(n: string, extra?: Partial<ScannedProduct>) {
    const trimmed = n.trim();
    if (!trimmed) return;
    setName('');
    try {
      await addListItem({ name: trimmed, quantity: extra?.quantity, category: extra?.category, brand: extra?.brand });
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  async function toggle(it: ListItem) {
    const next = !it.checked;
    setItems((p) => p.map((x) => (x._id === it._id ? { ...x, checked: next } : x)));
    try { await toggleListItem(it._id, next); } catch { await load(); }
  }

  function remove(it: ListItem) {
    Alert.alert('Remove', `Remove "${it.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setItems((p) => p.filter((x) => x._id !== it._id));
        try { await deleteListItem(it._id); } catch { await load(); }
      } },
    ]);
  }

  async function scan() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera needed', 'Allow camera access to scan a product.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    setScanning(true);
    setErr(null);
    try { setDraft(await scanProduct(res.assets[0].uri)); }
    catch (e) { setErr((e as Error).message); }
    finally { setScanning(false); }
  }

  /**
   * A scanned barcode resolves to the same draft the AI photo scan produces, so both paths
   * end at the same confirm sheet. An unknown barcode is not an error: the databases are
   * incomplete, so the code stays on screen as a hint and the user can keep scanning or
   * fall back to typing (and the code goes in the note, which is what makes it findable
   * later).
   */
  async function onBarcode(code: string) {
    setLooking(true);
    setScanHint(null);
    setErr(null);
    try {
      const r = await lookupBarcode(code);
      if (!r.product) {
        setScanHint(`No product found for ${code}. Scan another, or add it by name.`);
        return;
      }
      setBarcodeOpen(false);
      setDraft(r.product);
    } catch (e) {
      setScanHint((e as Error).message);
    } finally {
      setLooking(false);
    }
  }

  if (loading) return <Spinner />;

  const sorted = [...items].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));

  return (
    <View style={s.wrap}>
      <View style={s.addRow}>
        <Input
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => add(name)}
          placeholder="Add an item…"
          style={{ flex: 1, paddingHorizontal: 14 }}
        />
        <IconButton glyph="＋" onPress={() => add(name)} disabled={!name.trim()} textStyle={{ lineHeight: 26 }} />
      </View>

      <View style={s.scanRow}>
        <Pressable
          onPress={() => { setScanHint(null); setBarcodeOpen(true); }}
          style={[s.scanBtn, { flex: 1 }]}
        >
          <Text style={s.scanText}>▥  Scan a barcode</Text>
        </Pressable>
        <Pressable onPress={scan} disabled={scanning} style={[s.scanBtn, { flex: 1 }]}>
          {scanning ? <ActivityIndicator color={C.cyan} /> : <Text style={s.scanText}>📷  Photo scan</Text>}
        </Pressable>
      </View>

      {err && <Text style={s.error}>{err}</Text>}

      <FlatList
        data={sorted}
        keyExtractor={(i) => i._id}
        contentContainerStyle={[{ paddingBottom: 40 }, contentWidth]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>Your list is empty — add an item or scan a product.</Empty>}
        renderItem={({ item }) => (
          <Pressable onPress={() => toggle(item)} onLongPress={() => remove(item)} style={s.row}>
            <Check checked={!!item.checked} />
            <View style={{ flex: 1 }}>
              {!!item.category && <Text style={s.eyebrow}>{item.category.toUpperCase()}</Text>}
              <Text style={[s.name, item.checked && s.struck]}>{item.name}{item.brand ? `  ·  ${item.brand}` : ''}</Text>
              {!!item.quantity && <Text style={s.qty}>{item.quantity}</Text>}
            </View>
            <Pressable onPress={() => remove(item)} hitSlop={10}><Text style={s.del}>✕</Text></Pressable>
          </Pressable>
        )}
      />

      {/* Confirm a scanned product before adding */}
      <ModalSheet visible={!!draft} onClose={() => setDraft(null)}>
        <Text style={s.modalTitle}>Add scanned product</Text>
        {draft && (
          <>
            <Text style={s.label}>NAME</Text>
            <Input value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} style={{ flex: 1, paddingHorizontal: 14 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>QTY</Text>
                <Input value={draft.quantity} onChangeText={(v) => setDraft({ ...draft, quantity: v })} style={{ flex: 1, paddingHorizontal: 14 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>CATEGORY</Text>
                <Input value={draft.category} onChangeText={(v) => setDraft({ ...draft, category: v })} style={{ flex: 1, paddingHorizontal: 14 }} />
              </View>
            </View>
            <View style={s.modalBtns}>
              <Button
                label="Add to list"
                onPress={() => { const d = draft; setDraft(null); add(d.name, d); }}
                disabled={!draft.name.trim()}
                style={{ paddingHorizontal: 18 }}
              />
              <Pressable onPress={() => setDraft(null)} style={s.cancelBtn}><Text style={s.cancelText}>Cancel</Text></Pressable>
            </View>
          </>
        )}
      </ModalSheet>

      <BarcodeScanner
        visible={barcodeOpen}
        busy={looking}
        hint={scanHint}
        onScanned={onBarcode}
        onClose={() => { setBarcodeOpen(false); setScanHint(null); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, padding: 16 },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', marginBottom: 14 },
  addRow: { flexDirection: 'row', gap: 8 },
  scanRow: { flexDirection: 'row', gap: 8 },
  scanBtn: { marginTop: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, paddingVertical: 12, alignItems: 'center' },
  scanText: { color: C.cyan, fontSize: 15, fontWeight: '600' },
  error: { color: C.red, fontSize: 13, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.lg, padding: 14, marginTop: 10 },
  eyebrow: { color: C.faint, fontSize: 10, letterSpacing: 1 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through', color: C.dim },
  qty: { color: C.dim, fontSize: 12, marginTop: 2 },
  del: { color: C.faint, fontSize: 16, paddingHorizontal: 4 },
  label: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginBottom: 6, marginTop: 12 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  modalBtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  cancelText: { color: C.dim, fontSize: 15 },
});
