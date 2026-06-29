import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl, Modal, StyleSheet, Alert } from 'react-native';
import { C } from '../theme';
import { shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getVouchers, addVoucher, deleteVoucher, updateVoucher, type Voucher } from '../api';

export function VouchersScreen() {
  const [rows, setRows] = useState<Voucher[]>([]);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eCode, setECode] = useState('');
  const [eUsed, setEUsed] = useState(false);

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

  function remove(it: Voucher) {
    Alert.alert('Delete', `Delete "${it.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setRows((p) => p.filter((x) => x.id !== it.id)); try { await deleteVoucher(it.id); } catch { await load(); } } },
    ]);
  }
  function openEdit(it: Voucher) { setEditing(it); setETitle(it.title); setECode(it.code); setEUsed(it.used); }
  async function saveEdit() {
    if (!editing || !eTitle.trim()) return;
    const id = editing.id;
    setEditing(null);
    try { await updateVoucher(id, { title: eTitle.trim(), code: eCode.trim(), used: eUsed }); await load(); } catch (e) { setErr((e as Error).message); }
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
          <Pressable onPress={() => openEdit(item)} onLongPress={() => remove(item)} style={[s.card, item.used && s.faded]}>
            <View style={s.top}>
              <Text style={s.title} numberOfLines={2}>{item.title}</Text>
              {!!item.discount && <Text style={s.discount}>{item.discount}</Text>}
            </View>
            <Text style={s.meta}>{[item.store, item.expiresAt ? `exp ${shortDate(item.expiresAt)}` : '', item.used ? 'used' : ''].filter(Boolean).join('  ·  ')}</Text>
            {!!item.code && <View style={s.codeBox}><Text style={s.code}>{item.code}</Text></View>}
          </Pressable>
        )}
      />

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={s.modalWrap} onPress={() => setEditing(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Edit voucher</Text>
            <Text style={s.mlabel}>TITLE</Text>
            <TextInput value={eTitle} onChangeText={setETitle} style={s.minput} placeholderTextColor={C.faint} />
            <Text style={s.mlabel}>CODE</Text>
            <TextInput value={eCode} onChangeText={setECode} autoCapitalize="characters" style={s.minput} placeholderTextColor={C.faint} />
            <Pressable onPress={() => setEUsed((v) => !v)} style={s.toggle}>
              <View style={[s.tbox, eUsed && s.tboxOn]}>{eUsed && <Text style={s.tmark}>✓</Text>}</View>
              <Text style={s.tlabel}>Used</Text>
            </Pressable>
            <View style={s.mbtns}>
              <Pressable onPress={saveEdit} disabled={!eTitle.trim()} style={[s.save, !eTitle.trim() && s.dim]}><Text style={s.saveText}>Save</Text></Pressable>
              <Pressable onPress={() => { const e = editing; setEditing(null); if (e) remove(e); }} style={s.delBtn}><Text style={s.delBtnText}>Delete</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 20 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  mlabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  minput: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 15 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  tbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  tboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  tmark: { color: '#000', fontSize: 15, fontWeight: '800' },
  tlabel: { color: C.text, fontSize: 15 },
  mbtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  save: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  saveText: { color: '#000', fontSize: 15, fontWeight: '700' },
  delBtn: { paddingVertical: 12, paddingHorizontal: 12 },
  delBtnText: { color: C.red, fontSize: 15, fontWeight: '600' },
});
