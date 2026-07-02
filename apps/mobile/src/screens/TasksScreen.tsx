import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, Modal, ScrollView, StyleSheet, Alert } from 'react-native';
import { C, scrim } from '../theme';
import { Spinner, ErrorText, Empty, Check, Input, Button, IconButton, Badge, ListItem, contentWidth } from '../ui';
import { getTasks, addTask, setTaskStatus, updateTask, deleteTask, type Task, type TaskStep } from '../api';

const STATUSES = ['todo', 'in-progress', 'blocked', 'done'] as const;
const SC: Record<string, string> = { todo: C.faint, 'in-progress': C.cyan, blocked: C.red, done: C.accent };
const PRIORITIES = ['low', 'normal', 'high'] as const;
const PC: Record<string, string> = { low: C.faint, normal: C.dim, high: C.gold };
const slabel = (st: string) => st.replace('-', ' ').toUpperCase();

/** Normalize a free-text tag list ("#net order, build") → ['net','order','build']. */
function parseTags(input: string): string[] {
  return Array.from(new Set(input.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean)));
}
/** Pull #tags out of a quick-add title → { title, tags }. Keeps Greek letters via \p{L}. */
function splitTitleTags(raw: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  const title = raw.replace(/#([\p{L}0-9_-]+)/gu, (_m, t: string) => { tags.push(t.toLowerCase()); return ''; }).replace(/\s+/g, ' ').trim();
  return { title, tags: Array.from(new Set(tags)) };
}

export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState<string>('todo');
  const [editPriority, setEditPriority] = useState<string>('normal');
  const [editTags, setEditTags] = useState('');
  const [editSteps, setEditSteps] = useState<TaskStep[]>([]);
  const [stepInput, setStepInput] = useState('');
  // A selected tag behaves like a project/phase (mirror of the web Tasks project-progress).
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setTasks(await getTasks()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function add() {
    const raw = title.trim();
    if (!raw) return;
    setTitle('');
    const { title: parsed, tags } = splitTitleTags(raw);
    const useTitle = parsed || raw; // all-tags input → keep raw so title stays non-empty
    const useTags = parsed ? tags : [];
    try { await addTask(useTitle, useTags.length ? { tags: useTags } : undefined); await load(); } catch (e) { setErr((e as Error).message); }
  }
  async function toggle(it: Task) {
    const next = it.status === 'done' ? 'todo' : 'done';
    setTasks((p) => p.map((x) => (x.id === it.id ? { ...x, status: next } : x)));
    try { await setTaskStatus(it.id, next); } catch { await load(); }
  }
  // Quick-move along the STATUSES flow (mirror of the web Kanban ←/→ quick-move).
  async function move(it: Task, dir: -1 | 1) {
    const idx = STATUSES.indexOf(it.status as (typeof STATUSES)[number]);
    const ni = idx + dir;
    if (idx < 0 || ni < 0 || ni >= STATUSES.length) return;
    const next = STATUSES[ni];
    setTasks((p) => p.map((x) => (x.id === it.id ? { ...x, status: next } : x)));
    try { await setTaskStatus(it.id, next); } catch { await load(); }
  }
  function openEdit(it: Task) { setEditing(it); setEditTitle(it.title); setEditStatus(it.status); setEditPriority(it.priority || 'normal'); setEditTags(it.tags.join(' ')); setEditSteps(it.steps ?? []); setStepInput(''); }
  // Steps persist immediately (add/toggle/remove all send the full updated array), independent of the Save button.
  async function persistSteps(next: TaskStep[]) {
    if (!editing) return;
    const id = editing.id;
    setEditSteps(next);
    setEditing((p) => (p ? { ...p, steps: next } : p));
    setTasks((p) => p.map((x) => (x.id === id ? { ...x, steps: next } : x)));
    try { await updateTask(id, { steps: next }); } catch { await load(); }
  }
  function addStep() { const text = stepInput.trim(); if (!text) return; setStepInput(''); persistSteps([...editSteps, { text, done: false }]); }
  function toggleStep(idx: number) { persistSteps(editSteps.map((st, i) => (i === idx ? { ...st, done: !st.done } : st))); }
  function removeStep(idx: number) { persistSteps(editSteps.filter((_, i) => i !== idx)); }
  async function saveEdit() {
    if (!editing || !editTitle.trim()) return;
    const id = editing.id;
    setEditing(null);
    try { await updateTask(id, { title: editTitle.trim(), status: editStatus, priority: editPriority, tags: parseTags(editTags) }); await load(); } catch (e) { setErr((e as Error).message); }
  }
  function removeEditing() {
    if (!editing) return;
    const id = editing.id;
    Alert.alert('Delete', `Delete "${editing.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { setEditing(null); setTasks((p) => p.filter((x) => x.id !== id)); try { await deleteTask(id); } catch { await load(); } } },
    ]);
  }

  if (loading) return <Spinner />;
  const allTags = Array.from(new Set(tasks.flatMap((t) => t.tags))).sort();
  // Drop a stale filter (e.g. the last task with that tag was deleted/edited) so nothing shows empty.
  const activeTag = tagFilter && allTags.includes(tagFilter) ? tagFilter : null;
  const shown = activeTag ? tasks.filter((t) => t.tags.includes(activeTag)) : tasks;
  const sorted = [...shown].sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));
  const projDone = activeTag ? shown.filter((t) => t.status === 'done').length : 0;
  const projPct = activeTag && shown.length ? Math.round((projDone / shown.length) * 100) : 0;

  return (
    <View style={s.wrap}>
      <View style={s.addRow}>
        <Input value={title} onChangeText={setTitle} onSubmitEditing={add} placeholder="Add a task…  #tag" style={{ flex: 1 }} />
        <IconButton glyph="＋" onPress={add} disabled={!title.trim()} />
      </View>
      <ErrorText>{err}</ErrorText>
      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tagRow}>
          {allTags.map((tag) => (
            <Pressable key={tag} onPress={() => setTagFilter((cur) => (cur === tag ? null : tag))} style={[s.tagChip, activeTag === tag && s.tagChipOn]}>
              <Text style={[s.tagChipText, activeTag === tag && s.tagChipTextOn]}>#{tag}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {activeTag && shown.length > 0 && (
        <View style={[s.progWrap, contentWidth]}>
          <View style={s.progHead}>
            <Text style={s.progLabel}>#{activeTag} · PROJECT PROGRESS</Text>
            <Text style={s.progPct}>{`${projDone}/${shown.length} · ${projPct}%`}</Text>
          </View>
          <View style={s.progTrack}><View style={[s.progFill, { width: `${projPct}%` }]} /></View>
        </View>
      )}
      <FlatList
        data={sorted}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[{ padding: 16, paddingTop: 4 }, contentWidth]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No tasks. Add one above.</Empty>}
        renderItem={({ item }) => {
          const done = item.status === 'done';
          const steps = item.steps ?? [];
          const doneSteps = steps.filter((st) => st.done).length;
          const idx = STATUSES.indexOf(item.status as (typeof STATUSES)[number]);
          const hasPrev = idx > 0;
          const hasNext = idx >= 0 && idx < STATUSES.length - 1;
          return (
            <ListItem>
              <Pressable onPress={() => toggle(item)} hitSlop={10}><Check checked={!!done} /></Pressable>
              <Pressable onPress={() => openEdit(item)} style={{ flex: 1 }}>
                <Text style={[s.title, done && s.struck]}>{item.title}</Text>
                <View style={s.metaRow}>
                  <Badge label={slabel(item.status)} color={SC[item.status]} />
                  {steps.length > 0 && <Text style={[s.steps, doneSteps === steps.length && { color: C.accent }]}>{`☑ ${doneSteps}/${steps.length}`}</Text>}
                  {item.priority !== 'normal' && <Text style={s.pri}>{item.priority}</Text>}
                  {item.tags.length > 0 && <Text style={s.tags} numberOfLines={1}>#{item.tags.join(' #')}</Text>}
                </View>
              </Pressable>
              <View style={s.moveBtns}>
                <Pressable onPress={() => move(item, -1)} disabled={!hasPrev} hitSlop={8} style={[s.moveBtn, !hasPrev && s.moveDim]}><Text style={s.moveText}>←</Text></Pressable>
                <Pressable onPress={() => move(item, 1)} disabled={!hasNext} hitSlop={8} style={[s.moveBtn, !hasNext && s.moveDim]}><Text style={s.moveText}>→</Text></Pressable>
              </View>
            </ListItem>
          );
        }}
      />

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={s.modalWrap} onPress={() => setEditing(null)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.modalTitle}>Edit task</Text>
            <Text style={s.label}>TITLE</Text>
            <Input variant="modal" value={editTitle} onChangeText={setEditTitle} />
            <Text style={s.label}>STATUS</Text>
            <View style={s.statuses}>
              {STATUSES.map((st) => (
                <Pressable key={st} onPress={() => setEditStatus(st)} style={[s.statusBtn, editStatus === st && { backgroundColor: SC[st], borderColor: SC[st] }]}>
                  <Text style={[s.statusText, editStatus === st && { color: C.onAccent }]}>{slabel(st)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.label}>PRIORITY</Text>
            <View style={s.statuses}>
              {PRIORITIES.map((pr) => (
                <Pressable key={pr} onPress={() => setEditPriority(pr)} style={[s.statusBtn, editPriority === pr && { backgroundColor: PC[pr], borderColor: PC[pr] }]}>
                  <Text style={[s.statusText, editPriority === pr && { color: C.onAccent }]}>{pr.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.label}>TAGS</Text>
            <Input variant="modal" value={editTags} onChangeText={setEditTags} placeholder="network order  (space or comma)" autoCapitalize="none" />
            <Text style={s.label}>STEPS</Text>
            {editSteps.map((st, i) => (
              <View key={i} style={s.stepRow}>
                <Pressable onPress={() => toggleStep(i)} hitSlop={8}><Check checked={st.done} /></Pressable>
                <Text style={[s.stepText, st.done && s.struck]} numberOfLines={2}>{st.text}</Text>
                <Pressable onPress={() => removeStep(i)} hitSlop={8}><Text style={s.stepDel}>×</Text></Pressable>
              </View>
            ))}
            <View style={s.stepAddRow}>
              <Input variant="modal" value={stepInput} onChangeText={setStepInput} onSubmitEditing={addStep} placeholder="Add a step…" style={{ flex: 1 }} />
              <IconButton glyph="＋" onPress={addStep} disabled={!stepInput.trim()} style={{ paddingVertical: 10 }} />
            </View>
            <View style={s.modalBtns}>
              <Button label="Save" onPress={saveEdit} disabled={!editTitle.trim()} />
              <Pressable onPress={removeEditing} style={s.del}><Text style={s.delText}>Delete</Text></Pressable>
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
  dim: { opacity: 0.4 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  struck: { textDecorationLine: 'line-through', color: C.dim },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  steps: { color: C.dim, fontSize: 11, fontWeight: '600' },
  pri: { color: C.gold, fontSize: 11 },
  tags: { color: C.faint, fontSize: 11, flex: 1 },
  tagRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  tagChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  tagChipText: { color: C.dim, fontSize: 12, fontWeight: '600' },
  tagChipTextOn: { color: C.onAccent },
  progWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  progHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  progLabel: { color: C.dim, fontSize: 10, letterSpacing: 1 },
  progPct: { color: C.accent, fontSize: 11, fontWeight: '700' },
  progTrack: { height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 3, backgroundColor: C.accent },
  moveBtns: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moveBtn: { paddingHorizontal: 6, paddingVertical: 6 },
  moveDim: { opacity: 0.2 },
  moveText: { color: C.dim, fontSize: 18, fontWeight: '700' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  stepText: { color: C.text, fontSize: 14, flex: 1 },
  stepDel: { color: C.faint, fontSize: 20, paddingHorizontal: 4 },
  stepAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  modalWrap: { flex: 1, backgroundColor: scrim, justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 20 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  label: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 14, marginBottom: 6 },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  statusText: { color: C.dim, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  modalBtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  del: { paddingVertical: 12, paddingHorizontal: 12 },
  delText: { color: C.red, fontSize: 15, fontWeight: '600' },
});
