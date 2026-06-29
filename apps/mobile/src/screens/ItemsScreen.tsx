import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, Spinner, ErrorText, Empty } from '../ui';
import { getItems, createItem, type Item } from '../api';

const FILTERS: { key: 'all' | 'inventory' | 'shopping'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'inventory', label: 'Owned' },
  { key: 'shopping', label: 'Shopping' },
];

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

  async function add() {
    const t = title.trim();
    if (!t) return;
    setTitle('');
    try { await createItem({ title: t }); setFilter('all'); await load(); } catch (e) { setErr((e as Error).message); }
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
        <TextInput value={title} onChangeText={setTitle} onSubmitEditing={add} placeholder="Add an item…" placeholderTextColor={C.faint} style={s.input} />
        <Pressable onPress={add} disabled={!title.trim()} style={[s.addBtn, !title.trim() && s.dim]}><Text style={s.addBtnText}>＋</Text></Pressable>
      </View>
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
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  {!!item.category && <Text style={s.eyebrow}>{item.category.toUpperCase()}</Text>}
                  <Text style={s.title}>{item.title}</Text>
                  <Text style={s.meta}>{item.status}</Text>
                </View>
                {price > 0 && <Text style={s.price}>{money(price)}</Text>}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  addRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: C.text, fontSize: 15 },
  addBtn: { width: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#000', fontSize: 24, fontWeight: '700' },
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
});
