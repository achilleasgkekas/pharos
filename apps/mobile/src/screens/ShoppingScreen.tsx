import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, ActivityIndicator, RefreshControl, Modal, StyleSheet, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../theme';
import {
  getShoppingList, addListItem, toggleListItem, deleteListItem, scanProduct, type ListItem, type ScannedProduct,
} from '../api';
import { Check } from '../ui';

export function ShoppingScreen() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScannedProduct | null>(null);

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

  if (loading) return <View style={s.center}><ActivityIndicator color={C.accent} /></View>;

  const sorted = [...items].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));

  return (
    <View style={s.wrap}>
      <View style={s.addRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => add(name)}
          placeholder="Add an item…"
          placeholderTextColor={C.faint}
          style={s.input}
        />
        <Pressable onPress={() => add(name)} disabled={!name.trim()} style={[s.addBtn, !name.trim() && s.dim]}>
          <Text style={s.addBtnText}>＋</Text>
        </Pressable>
      </View>

      <Pressable onPress={scan} disabled={scanning} style={s.scanBtn}>
        {scanning ? <ActivityIndicator color={C.cyan} /> : <Text style={s.scanText}>📷  Scan a product</Text>}
      </Pressable>

      {err && <Text style={s.error}>{err}</Text>}

      <FlatList
        data={sorted}
        keyExtractor={(i) => i._id}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Text style={s.empty}>Your list is empty — add an item or scan a product.</Text>}
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
      <Modal visible={!!draft} transparent animationType="fade" onRequestClose={() => setDraft(null)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Add scanned product</Text>
            {draft && (
              <>
                <Text style={s.label}>NAME</Text>
                <TextInput value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} style={s.input} placeholderTextColor={C.faint} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>QTY</Text>
                    <TextInput value={draft.quantity} onChangeText={(v) => setDraft({ ...draft, quantity: v })} style={s.input} placeholderTextColor={C.faint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>CATEGORY</Text>
                    <TextInput value={draft.category} onChangeText={(v) => setDraft({ ...draft, category: v })} style={s.input} placeholderTextColor={C.faint} />
                  </View>
                </View>
                <View style={s.modalBtns}>
                  <Pressable
                    onPress={() => { const d = draft; setDraft(null); add(d.name, d); }}
                    disabled={!draft.name.trim()}
                    style={[s.addBtnWide, !draft.name.trim() && s.dim]}
                  >
                    <Text style={s.addBtnText2}>Add to list</Text>
                  </Pressable>
                  <Pressable onPress={() => setDraft(null)} style={s.cancelBtn}><Text style={s.cancelText}>Cancel</Text></Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, padding: 16 },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', marginBottom: 14 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: C.text, fontSize: 15 },
  addBtn: { width: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#000', fontSize: 24, fontWeight: '700', lineHeight: 26 },
  dim: { opacity: 0.4 },
  scanBtn: { marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, paddingVertical: 12, alignItems: 'center' },
  scanText: { color: C.cyan, fontSize: 15, fontWeight: '600' },
  error: { color: C.red, fontSize: 13, marginTop: 10 },
  empty: { color: C.faint, fontSize: 14, textAlign: 'center', marginTop: 50 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginTop: 10 },
  eyebrow: { color: C.faint, fontSize: 10, letterSpacing: 1 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through', color: C.dim },
  qty: { color: C.dim, fontSize: 12, marginTop: 2 },
  del: { color: C.faint, fontSize: 16, paddingHorizontal: 4 },
  label: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginBottom: 6, marginTop: 12 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 20 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  modalBtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  addBtnWide: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18 },
  addBtnText2: { color: '#000', fontSize: 15, fontWeight: '700' },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  cancelText: { color: C.dim, fontSize: 15 },
});
