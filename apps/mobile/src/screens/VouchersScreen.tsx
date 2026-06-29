import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getVouchers, addVoucher, type Voucher } from '../api';

export function VouchersScreen() {
  const [rows, setRows] = useState<Voucher[]>([]);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getVouchers()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function add() {
    const t = title.trim();
    if (!t) return;
    setTitle(''); setCode('');
    try { await addVoucher({ title: t, code: code.trim() }); await load(); } catch (e) { setErr((e as Error).message); }
  }

  if (loading) return <Spinner />;

  return (
    <View style={s.wrap}>
      <View style={s.addRow}>
        <TextInput value={title} onChangeText={setTitle} placeholder="title" placeholderTextColor={C.faint} style={[s.input, { flex: 2 }]} />
        <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="code" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} />
        <Pressable onPress={add} disabled={!title.trim()} style={[s.addBtn, !title.trim() && s.dim]}><Text style={s.addBtnText}>＋</Text></Pressable>
      </View>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No vouchers.</Empty>}
        renderItem={({ item }) => (
          <View style={[s.card, item.used && s.faded]}>
            <View style={s.top}>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              {!!item.discount && <Text style={s.discount}>{item.discount}</Text>}
            </View>
            <Text style={s.meta}>{[item.store, item.expiresAt ? `exp ${shortDate(item.expiresAt)}` : '', item.used ? 'used' : ''].filter(Boolean).join('  ·  ')}</Text>
            {!!item.code && <View style={s.codeBox}><Text style={s.code}>{item.code}</Text></View>}
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: C.text, fontSize: 15 },
  addBtn: { width: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#000', fontSize: 24, fontWeight: '700' },
  dim: { opacity: 0.4 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  faded: { opacity: 0.55 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { color: C.text, fontSize: 15, fontWeight: '600', flex: 1 },
  discount: { color: C.gold, fontSize: 15, fontWeight: '800' },
  meta: { color: C.faint, fontSize: 12, marginTop: 4 },
  codeBox: { marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.borderLight, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  code: { color: C.cyan, fontSize: 15, letterSpacing: 1.5, fontWeight: '700' },
});
