import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, FlatList, Pressable, RefreshControl, ActivityIndicator, Modal, ScrollView, StyleSheet, Alert } from 'react-native';
import { C } from '../theme';
import { money, Spinner, ErrorText, Empty } from '../ui';
import { getItems, createItem, deleteItemRecord, importItemUrl, updateItem, type Item } from '../api';

const FILTERS: { key: 'all' | 'inventory' | 'shopping'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'inventory', label: 'Owned' },
  { key: 'shopping', label: 'Shopping' },
];

const STATUSES = ['researching', 'decided', 'ordered', 'received', 'installed', 'sold', 'broken', 'deferred'];

export function ItemsScreen() {
  const [rows, setRows] = useState<Item[]>([]);
  const [filter, setFilter] = useState<'all' | 'inventory' | 'shopping'>('all');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getItems(filter)); } catch (e) { setErr((e as Error).message); }
  }, [filter]);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const [importing, setImporting] = useState(false);
  const isUrl = /^https?:\/\//i.test(title.trim());

  async function add() {
    const t = title.trim();
    if (!t) return;
    if (isUrl) return importUrl(t);
    setTitle('');
    try { await createItem({ title: t }); setFilter('all'); await load(); } catch (e) { setErr((e as Error).message); }
  }

  async function importUrl(url: string) {
    setImporting(true); setErr(null);
    try {
      const r = await importItemUrl(url, 'shopping');
      setTitle(''); setFilter('shopping'); await load();
      Alert.alert(r.updated ? 'Updated existing' : 'Added to shopping', `${r.title}${r.price ? `  ·  ${money(r.price)}` : ''}  ·  ${r.store}`);
    } catch (e) { setErr((e as Error).message); }
    finally { setImporting(false); }
  }

  function remove(it: Item) {
    Alert.alert('Delete', `Delete "${it.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteItemRecord(it.id); } catch { await load(); } } },
    ]);
  }

  const [editing, setEditing] = useState<Item | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eStatus, setEStatus] = useState('researching');
  const [eCategory, setECategory] = useState('');
  const [ePrice, setEPrice] = useState('');
  const [eTarget, setETarget] = useState('');
  const [eSpecs, setESpecs] = useState('');
  const [saving, setSaving] = useState(false);

  function openEdit(it: Item) {
    setEditing(it);
    setETitle(it.title);
    setEStatus(it.status || 'researching');
    setECategory(it.category || '');
    setEPrice(it.currentPrice ? String(it.currentPrice) : '');
    setETarget(it.targetPrice != null ? String(it.targetPrice) : '');
    setESpecs(it.specs || '');
  }
  async function saveEdit() {
    if (!editing) return;
    const id = editing.id;
    const price = parseFloat(ePrice.replace(',', '.'));
    const target = eTarget.trim() ? parseFloat(eTarget.replace(',', '.')) : null;
    setSaving(true); setErr(null);
    try {
      await updateItem(id, {
        title: eTitle.trim(),
        status: eStatus,
        category: eCategory.trim(),
        currentPrice: Number.isFinite(price) ? price : undefined,
        targetPrice: target != null && Number.isFinite(target) ? target : null,
        specs: eSpecs.trim(),
      });
      setEditing(null);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <View style={s.wrap}>
      <View style={s.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[s.chip, filter === f.key && s.chipOn]}>
            <Text style={[s.chipText, filter === f.key && s.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.addRow}>
        <TextInput value={title} onChangeText={setTitle} onSubmitEditing={add} autoCapitalize="none" autoCorrect={false} placeholder="Add an item or paste a link…" placeholderTextColor={C.faint} style={s.input} />
        <Pressable onPress={add} disabled={!title.trim() || importing} style={[s.addBtn, isUrl && s.importBtn, (!title.trim() || importing) && s.dim]}>
          {importing ? <ActivityIndicator color="#000" /> : <Text style={s.addBtnText}>{isUrl ? '✦' : '＋'}</Text>}
        </Pressable>
      </View>
      {isUrl && <Text style={s.hint}>✦ AI will fetch this link and add it to Shopping</Text>}
      <ErrorText>{err}</ErrorText>
      {loading ? <Spinner /> : (
        <FlatList
          data={rows}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          ListEmptyComponent={<Empty>No items.</Empty>}
          renderItem={({ item }) => {
            const price = item.purchasedPrice ?? item.currentPrice;
            return (
              <Pressable onPress={() => openEdit(item)} onLongPress={() => remove(item)} style={s.row}>
                <View style={{ flex: 1 }}>
                  {!!item.category && <Text style={s.eyebrow}>{item.category.toUpperCase()}</Text>}
                  <Text style={s.title}>{item.title}</Text>
                  <Text style={s.meta}>{item.status}</Text>
                </View>
                {price > 0 && <Text style={s.price}>{money(price)}</Text>}
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={s.modalWrap} onPress={() => setEditing(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>Edit item</Text>
              <Text style={s.mlabel}>TITLE</Text>
              <TextInput value={eTitle} onChangeText={setETitle} style={s.minput} placeholderTextColor={C.faint} />
              <Text style={s.mlabel}>STATUS</Text>
              <View style={s.statusWrap}>
                {STATUSES.map((st) => (
                  <Pressable key={st} onPress={() => setEStatus(st)} style={[s.sChip, eStatus === st && s.sChipOn]}>
                    <Text style={[s.sChipText, eStatus === st && s.sChipTextOn]}>{st}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.mlabel}>CATEGORY</Text>
              <TextInput value={eCategory} onChangeText={setECategory} autoCapitalize="none" style={s.minput} placeholder="e.g. networking" placeholderTextColor={C.faint} />
              <View style={s.priceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>PRICE</Text>
                  <TextInput value={ePrice} onChangeText={setEPrice} keyboardType="decimal-pad" style={s.minput} placeholder="0" placeholderTextColor={C.faint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.mlabel}>TARGET</Text>
                  <TextInput value={eTarget} onChangeText={setETarget} keyboardType="decimal-pad" style={s.minput} placeholder="—" placeholderTextColor={C.faint} />
                </View>
              </View>
              <Text style={s.mlabel}>SPECS</Text>
              <TextInput value={eSpecs} onChangeText={setESpecs} multiline style={[s.minput, s.specs]} placeholder="notes / specs" placeholderTextColor={C.faint} />
              <View style={s.mbtns}>
                <Pressable onPress={saveEdit} disabled={saving || !eTitle.trim()} style={[s.save, (saving || !eTitle.trim()) && s.dim]}>
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveText}>Save</Text>}
                </Pressable>
                <Pressable onPress={() => { const e = editing; setEditing(null); if (e) remove(e); }} style={s.delBtn}><Text style={s.delBtnText}>Delete</Text></Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  addRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: C.text, fontSize: 15 },
  addBtn: { width: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  importBtn: { backgroundColor: C.cyan },
  addBtnText: { color: '#000', fontSize: 24, fontWeight: '700' },
  hint: { color: C.cyan, fontSize: 11, paddingHorizontal: 16, paddingBottom: 8, marginTop: -2 },
  dim: { opacity: 0.4 },
  filters: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#000' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  eyebrow: { color: C.faint, fontSize: 10, letterSpacing: 1 },
  title: { color: C.text, fontSize: 15, fontWeight: '600', marginTop: 2 },
  meta: { color: C.faint, fontSize: 12, marginTop: 2 },
  price: { color: C.accent, fontSize: 16, fontWeight: '700' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 20, maxHeight: '88%' },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  minput: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 15 },
  specs: { minHeight: 64, textAlignVertical: 'top' },
  priceRow: { flexDirection: 'row', gap: 12 },
  statusWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  sChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  sChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  sChipText: { color: C.dim, fontSize: 12, fontWeight: '600' },
  sChipTextOn: { color: '#000' },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
  save: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 26, minWidth: 96, alignItems: 'center' },
  saveText: { color: '#000', fontSize: 15, fontWeight: '700' },
  delBtn: { paddingVertical: 12, paddingHorizontal: 12 },
  delBtnText: { color: C.red, fontSize: 15, fontWeight: '600' },
});
