import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, Spinner, ErrorText } from '../ui';
import { getOverview, type Overview } from '../api';

export type ScreenKey = 'home' | 'shopping' | 'receipts' | 'tasks' | 'expenses' | 'income' | 'subscriptions' | 'items' | 'assistant' | 'vouchers' | 'statements' | 'calendar' | 'reports' | 'settings' | 'search';

type Tile = { key: ScreenKey; label: string; count?: (o: Overview) => number; color: string };
const TILES: Tile[] = [
  { key: 'assistant', label: 'AI assistant', color: C.cyan },
  { key: 'shopping', label: 'Shopping list', count: (o) => o.counts.shoppingList, color: C.accent },
  { key: 'receipts', label: 'Receipts', count: (o) => o.counts.receipts, color: C.purple },
  { key: 'items', label: 'Inventory', count: (o) => o.counts.items, color: C.cyan },
  { key: 'tasks', label: 'Tasks', count: (o) => o.counts.openTasks, color: C.accent },
  { key: 'expenses', label: 'Expenses', count: (o) => o.counts.expenses, color: C.gold },
  { key: 'income', label: 'Income', color: C.accent },
  { key: 'subscriptions', label: 'Subscriptions', count: (o) => o.counts.subscriptions, color: C.cyan },
  { key: 'vouchers', label: 'Vouchers', color: C.gold },
  { key: 'statements', label: 'Statements', color: C.purple },
  { key: 'calendar', label: 'Calendar', color: C.cyan },
  { key: 'reports', label: 'Reports', color: C.accent },
];

export function HomeScreen({ onOpen }: { onOpen: (k: ScreenKey) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await getOverview()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (!data && !err) return <Spinner />;

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>
      <ErrorText>{err}</ErrorText>

      {data && (
        <>
          <View style={s.owed}>
            <Text style={s.owedLabel}>OWED IN INSTALLMENTS</Text>
            <Text style={s.owedValue}>{money(data.installmentsOwed, data.currency)}</Text>
            <Text style={s.owedSub}>{data.activeInstallmentPlans} active plan{data.activeInstallmentPlans === 1 ? '' : 's'}</Text>
          </View>

          <View style={s.grid}>
            {TILES.map((t) => (
              <Pressable key={t.key} onPress={() => onOpen(t.key)} style={s.tile}>
                {t.count && <Text style={[s.tileCount, { color: t.color }]}>{t.count(data)}</Text>}
                <Text style={s.tileLabel}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  brand: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: 3 },
  sub: { color: C.dim, fontSize: 12, marginTop: 2 },
  signout: { color: C.dim, fontSize: 13, paddingTop: 6 },
  owed: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 18, marginBottom: 16 },
  owedLabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2 },
  owedValue: { color: C.text, fontSize: 32, fontWeight: '800', marginTop: 4 },
  owedSub: { color: C.dim, fontSize: 13, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47%', flexGrow: 1, minHeight: 84, justifyContent: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16 },
  tileCount: { fontSize: 26, fontWeight: '800' },
  tileLabel: { color: C.dim, fontSize: 14, marginTop: 2 },
});
