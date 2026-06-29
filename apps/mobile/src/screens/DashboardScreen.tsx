import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { C } from '../theme';
import { getOverview, type Overview } from '../api';

const CUR: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };

export function DashboardScreen() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await getOverview()); }
    catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (!data && !err) return <View style={s.center}><ActivityIndicator color={C.accent} /></View>;

  const sym = data ? (CUR[data.currency] || data.currency + ' ') : '';
  const cards = data ? [
    { label: 'Inventory', value: data.counts.items, color: C.accent },
    { label: 'Shopping list', value: data.counts.shoppingList, color: C.cyan },
    { label: 'Receipts', value: data.counts.receipts, color: C.purple },
    { label: 'Expenses', value: data.counts.expenses, color: C.gold },
    { label: 'Subscriptions', value: data.counts.subscriptions, color: C.cyan },
    { label: 'Open tasks', value: data.counts.openTasks, color: C.accent },
  ] : [];

  return (
    <ScrollView
      style={s.wrap}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
    >
      <Text style={s.h1}>Overview</Text>
      {err && <Text style={s.error}>{err}</Text>}

      {data && (
        <>
          <View style={s.owed}>
            <Text style={s.owedLabel}>OWED IN INSTALLMENTS</Text>
            <Text style={s.owedValue}>{sym}{data.installmentsOwed.toLocaleString()}</Text>
            <Text style={s.owedSub}>{data.activeInstallmentPlans} active plan{data.activeInstallmentPlans === 1 ? '' : 's'}</Text>
          </View>

          <View style={s.grid}>
            {cards.map((c) => (
              <View key={c.label} style={s.card}>
                <Text style={[s.cardValue, { color: c.color }]}>{c.value}</Text>
                <Text style={s.cardLabel}>{c.label}</Text>
              </View>
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
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', marginBottom: 16 },
  error: { color: C.red, fontSize: 14, marginBottom: 12 },
  owed: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 18, marginBottom: 16 },
  owedLabel: { color: C.faint, fontSize: 10, letterSpacing: 1.2 },
  owedValue: { color: C.text, fontSize: 32, fontWeight: '800', marginTop: 4 },
  owedSub: { color: C.dim, fontSize: 13, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', flexGrow: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16 },
  cardValue: { fontSize: 28, fontWeight: '800' },
  cardLabel: { color: C.dim, fontSize: 13, marginTop: 2 },
});
