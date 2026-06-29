import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, StyleSheet, Alert } from 'react-native';
import { C } from '../theme';
import { shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getTrash, restoreTrash, purgeTrash, currentUser, type TrashRow, type TrashType } from '../api';

const ICON: Record<TrashType, string> = {
  item: '📦', receipt: '🧾', expense: '💸', subscription: '🔁', voucher: '🎟', task: '✓',
};

export function ActivityScreen() {
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isAdmin = currentUser()?.role === 'admin';

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getTrash()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function restore(it: TrashRow) {
    setRows((p) => p.filter((x) => !(x.id === it.id && x.type === it.type)));
    try { await restoreTrash(it.type, it.id); } catch (e) { setErr((e as Error).message); await load(); }
  }
  function purge(it: TrashRow) {
    Alert.alert('Delete forever', `Permanently delete "${it.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete forever', style: 'destructive', onPress: async () => {
        setRows((p) => p.filter((x) => !(x.id === it.id && x.type === it.type)));
        try { await purgeTrash(it.type, it.id); } catch (e) { setErr((e as Error).message); await load(); }
      } },
    ]);
  }

  if (loading) return <Spinner />;

  return (
    <View style={s.wrap}>
      <Text style={s.intro}>Soft-deleted records. Restore brings them back; items older than 30 days are purged automatically.</Text>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.type}:${r.id}`}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>Trash is empty.</Empty>}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.head}>
              <Text style={s.icon}>{ICON[item.type]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={2}>{item.title}</Text>
                <Text style={s.meta}>{[item.type, item.subtitle, `deleted ${shortDate(item.deletedAt)}`].filter(Boolean).join('  ·  ')}</Text>
              </View>
            </View>
            <View style={s.actions}>
              <Pressable onPress={() => restore(item)} style={s.restore}><Text style={s.restoreText}>Restore</Text></Pressable>
              {isAdmin && <Pressable onPress={() => purge(item)} style={s.purge}><Text style={s.purgeText}>Delete forever</Text></Pressable>}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  intro: { color: C.faint, fontSize: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, lineHeight: 17 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { fontSize: 20, marginTop: 1 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  restore: { borderWidth: 1, borderColor: C.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  restoreText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  purge: { borderWidth: 1, borderColor: '#ff475740', backgroundColor: '#ff475712', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  purgeText: { color: C.red, fontSize: 14, fontWeight: '600' },
});
