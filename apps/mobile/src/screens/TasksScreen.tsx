import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, RefreshControl, StyleSheet, Alert } from 'react-native';
import { C } from '../theme';
import { Spinner, ErrorText, Empty } from '../ui';
import { getTasks, addTask, setTaskStatus, deleteTask, type Task } from '../api';

export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setTasks(await getTasks()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function add() {
    const t = title.trim();
    if (!t) return;
    setTitle('');
    try { await addTask(t); await load(); } catch (e) { setErr((e as Error).message); }
  }
  async function toggle(it: Task) {
    const next = it.status === 'done' ? 'todo' : 'done';
    setTasks((p) => p.map((x) => (x.id === it.id ? { ...x, status: next } : x)));
    try { await setTaskStatus(it.id, next); } catch { await load(); }
  }
  function remove(it: Task) {
    Alert.alert('Delete', `Delete "${it.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setTasks((p) => p.filter((x) => x.id !== it.id)); try { await deleteTask(it.id); } catch { await load(); } } },
    ]);
  }

  if (loading) return <Spinner />;
  const sorted = [...tasks].sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));

  return (
    <View style={s.wrap}>
      <View style={s.addRow}>
        <TextInput value={title} onChangeText={setTitle} onSubmitEditing={add} placeholder="Add a task…" placeholderTextColor={C.faint} style={s.input} />
        <Pressable onPress={add} disabled={!title.trim()} style={[s.add, !title.trim() && s.dim]}><Text style={s.addText}>＋</Text></Pressable>
      </View>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={sorted}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No tasks. Add one above.</Empty>}
        renderItem={({ item }) => {
          const done = item.status === 'done';
          return (
            <Pressable onPress={() => toggle(item)} onLongPress={() => remove(item)} style={s.row}>
              <View style={[s.check, done && s.checkOn]}>{done && <Text style={s.mark}>✓</Text>}</View>
              <View style={{ flex: 1 }}>
                <Text style={[s.title, done && s.struck]}>{item.title}</Text>
                <Text style={s.meta}>{item.status.toUpperCase()}{item.priority !== 'normal' ? `  ·  ${item.priority}` : ''}{item.tags.length ? `  ·  ${item.tags.join(', ')}` : ''}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  addRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: C.text, fontSize: 15 },
  add: { width: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#000', fontSize: 24, fontWeight: '700' },
  dim: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.accent, borderColor: C.accent },
  mark: { color: '#000', fontSize: 15, fontWeight: '800' },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through', color: C.dim },
  meta: { color: C.faint, fontSize: 11, marginTop: 3, letterSpacing: 0.5 },
});
