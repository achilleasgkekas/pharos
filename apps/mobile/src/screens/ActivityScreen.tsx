import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, RefreshControl, StyleSheet, Alert } from 'react-native';
import { C, alpha } from '../theme';
import { shortDate, Spinner, ErrorText, Empty, Card, Badge, contentWidth } from '../ui';
import {
  getTrash, restoreTrash, purgeTrash, currentUser,
  getJobs, getHistory, getNotifications, markNotificationRead,
  type TrashRow, type TrashType, type JobRow, type ConversationRow, type NotificationRow, type NotifKind,
} from '../api';

type Tab = 'alerts' | 'trash' | 'jobs' | 'history';
const TABS: { key: Tab; label: string }[] = [
  { key: 'alerts', label: 'Alerts' },
  { key: 'trash', label: 'Trash' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'history', label: 'History' },
];

const TRASH_ICON: Record<TrashType, string> = {
  item: '📦', receipt: '🧾', expense: '💸', subscription: '🔁', voucher: '🎟', task: '✓',
};
const NOTIF_ICON: Record<NotifKind, string> = {
  deal: '🏷', installment: '💳', warranty: '🛡', pricehike: '📈', trialend: '⏰', giftcard: '🎁', bill: '📄', system: '🔔',
};

function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return shortDate(iso);
}

export function ActivityScreen() {
  const [tab, setTab] = useState<Tab>('alerts');
  return (
    <View style={s.wrap}>
      <View style={s.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key && s.tabOn]}>
            <Text style={[s.tabText, tab === t.key && s.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'alerts' && <AlertsTab />}
      {tab === 'trash' && <TrashTab />}
      {tab === 'jobs' && <JobsTab />}
      {tab === 'history' && <HistoryTab />}
    </View>
  );
}

// ---- Alerts (in-app notification feed) ----
function AlertsTab() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setItems((await getNotifications()).items); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function readOne(it: NotificationRow) {
    if (it.read) return;
    setItems((p) => p.map((x) => (x._id === it._id ? { ...x, read: true } : x)));
    try { await markNotificationRead(it._id); } catch { await load(); }
  }
  async function readAll() {
    setItems((p) => p.map((x) => ({ ...x, read: true })));
    try { await markNotificationRead(); } catch { await load(); }
  }

  const unread = items.filter((i) => !i.read).length;
  if (loading) return <Spinner />;
  return (
    <>
      <View style={s.alertHead}>
        <Text style={[s.intro, { flex: 1, paddingRight: 0 }]}>Deals, installments due, and warranties expiring. Tap to mark read.</Text>
        {unread > 0 && <Pressable onPress={readAll} style={s.markAll}><Text style={s.markAllText}>Mark all ({unread})</Text></Pressable>}
      </View>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={items}
        keyExtractor={(r) => r._id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No alerts.</Empty>}
        renderItem={({ item }) => (
          <Card onPress={() => readOne(item)} style={!item.read && s.unreadCard}>
            <View style={s.head}>
              <Text style={s.icon}>{NOTIF_ICON[item.kind]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={2}>{item.title || item.kind}</Text>
                {!!item.body && <Text style={s.preview} numberOfLines={3}>{item.body}</Text>}
                <Text style={s.meta}>{relTime(item.createdAt)}</Text>
              </View>
              {!item.read && <View style={s.dot} />}
            </View>
          </Card>
        )}
      />
    </>
  );
}

// ---- Trash ----
function TrashTab() {
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
    <>
      <Text style={s.intro}>Soft-deleted records. Restore brings them back; items older than 30 days are purged automatically.</Text>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.type}:${r.id}`}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>Trash is empty.</Empty>}
        renderItem={({ item }) => (
          <Card>
            <View style={s.head}>
              <Text style={s.icon}>{TRASH_ICON[item.type]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={2}>{item.title}</Text>
                <Text style={s.meta}>{[item.type, item.subtitle, `deleted ${shortDate(item.deletedAt)}`].filter(Boolean).join('  ·  ')}</Text>
              </View>
            </View>
            <View style={s.actions}>
              <Pressable onPress={() => restore(item)} style={s.restore}><Text style={s.restoreText}>Restore</Text></Pressable>
              {isAdmin && <Pressable onPress={() => purge(item)} style={s.purge}><Text style={s.purgeText}>Delete forever</Text></Pressable>}
            </View>
          </Card>
        )}
      />
    </>
  );
}

// ---- Jobs ----
const JOB_STATUS: Record<JobRow['status'], { color: string; label: string }> = {
  running: { color: C.cyan, label: 'RUNNING' },
  done: { color: C.accent, label: 'DONE' },
  error: { color: C.red, label: 'ERROR' },
};

function JobsTab() {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getJobs()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  // Auto-refresh while a job is running so progress updates live.
  useEffect(() => {
    if (!rows.some((r) => r.status === 'running')) return;
    const t = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(t);
  }, [rows, load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (loading) return <Spinner />;
  return (
    <>
      <Text style={s.intro}>Background AI jobs (re-scan receipts, AI-fill items, OneDrive sync). Read-only.</Text>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => r._id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No jobs yet.</Empty>}
        renderItem={({ item }) => {
          const st = JOB_STATUS[item.status];
          const pct = item.total > 0 ? Math.round((item.done / item.total) * 100) : 0;
          const sub = item.status === 'running' && item.current ? item.current
            : item.status === 'error' && item.error ? item.error
            : item.lastDetail || item.lastLabel || '';
          return (
            <Card>
              <View style={s.jobHead}>
                <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                <Badge label={st.label} color={st.color} style={{ paddingHorizontal: 7, marginLeft: 'auto' }} textStyle={{ fontSize: 10 }} />
              </View>
              <Text style={s.meta}>{`${item.done}/${item.total} · ${item.ok} ok · ${relTime(item.finishedAt || item.createdAt)}`}</Text>
              {item.total > 0 && (
                <View style={s.track}><View style={[s.fill, { width: `${pct}%`, backgroundColor: st.color }]} /></View>
              )}
              {!!sub && <Text style={[s.meta, item.status === 'error' && { color: C.red }]} numberOfLines={2}>{sub}</Text>}
            </Card>
          );
        }}
      />
    </>
  );
}

// ---- History ----
function HistoryTab() {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getHistory()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (loading) return <Spinner />;
  return (
    <>
      <Text style={s.intro}>Saved AI command-bar conversations. Tap to expand.</Text>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No conversations yet.</Empty>}
        renderItem={({ item }) => {
          const expanded = open === item.id;
          return (
            <Card onPress={() => setOpen(expanded ? null : item.id)}>
              <Text style={s.title} numberOfLines={expanded ? undefined : 1}>{item.title}</Text>
              <Text style={s.meta}>{`${item.turns} turn${item.turns === 1 ? '' : 's'} · ${relTime(item.updatedAt)}`}</Text>
              {!expanded && !!item.preview && <Text style={s.preview} numberOfLines={2}>{item.preview}</Text>}
              {expanded && (
                <View style={s.thread}>
                  {item.messages.map((m, i) => (
                    <View key={i} style={[s.msg, m.role === 'user' ? s.msgUser : s.msgBot]}>
                      <Text style={s.role}>{m.role === 'user' ? 'You' : 'Pharos'}</Text>
                      <Text style={s.msgText}>{m.content}</Text>
                      {(m.actions ?? []).map((a, j) => (
                        <Text key={j} style={s.action}>{`✓ ${a.name}${a.summary ? ` · ${a.summary}` : ''}`}</Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </Card>
          );
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  tabOn: { borderColor: C.accent, backgroundColor: alpha(C.accent, 0.08) },
  tabText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: C.accent, fontWeight: '700' },
  intro: { color: C.faint, fontSize: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, lineHeight: 17 },
  alertHead: { flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  markAll: { borderWidth: 1, borderColor: C.accent, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 11 },
  markAllText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  list: { padding: 16, paddingTop: 4, ...contentWidth },
  unreadCard: { borderColor: alpha(C.cyan, 0.27), backgroundColor: alpha(C.cyan, 0.04) },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.cyan, marginTop: 4 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { fontSize: 20, marginTop: 1 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  meta: { color: C.faint, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  restore: { borderWidth: 1, borderColor: C.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  restoreText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  purge: { borderWidth: 1, borderColor: alpha(C.red, 0.25), backgroundColor: alpha(C.red, 0.07), borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  purgeText: { color: C.red, fontSize: 14, fontWeight: '600' },
  jobHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: C.surface2, marginTop: 8, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  preview: { color: C.dim, fontSize: 13, marginTop: 8, lineHeight: 18 },
  thread: { marginTop: 10, gap: 8 },
  msg: { borderRadius: 10, padding: 10 },
  msgUser: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  msgBot: { backgroundColor: alpha(C.cyan, 0.06), borderWidth: 1, borderColor: alpha(C.cyan, 0.2) },
  role: { color: C.faint, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 3, textTransform: 'uppercase' },
  msgText: { color: C.text, fontSize: 13, lineHeight: 19 },
  action: { color: C.accent, fontSize: 12, marginTop: 4 },
});
