import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, Spinner, ErrorText } from '../ui';
import { getReports, type Reports } from '../api';

function Bar({ label, value, max, cur, color }: { label: string; value: number; max: number; cur: string; color: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <View style={s.barRow}>
      <Text style={s.barLabel} numberOfLines={1}>{label}</Text>
      <View style={s.track}><View style={[s.fill, { width: `${pct}%`, backgroundColor: color }]} /></View>
      <Text style={s.barVal}>{money(value, cur)}</Text>
    </View>
  );
}

export function ReportsScreen() {
  const [d, setD] = useState<Reports | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setD(await getReports()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (!d && !err) return <Spinner />;

  const cur = d?.currency || 'EUR';
  const monthMax = d ? Math.max(...d.monthly.map((m) => m.expense), 1) : 1;
  const catMax = d ? Math.max(...d.byCategory.map((c) => c.total), 1) : 1;
  const mLabel = (p: string) => { const [, m] = p.split('-'); return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10)] || p; };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>
      <ErrorText>{err}</ErrorText>
      {d && (
        <>
          <View style={s.netCard}>
            <Text style={s.cardLabel}>NET POSITION</Text>
            <Text style={[s.netVal, { color: d.netPosition.net >= 0 ? C.accent : C.red }]}>{money(d.netPosition.net, cur)}</Text>
            <Text style={s.cardSub}>{money(d.netPosition.inventoryValue, cur)} owned − {money(d.netPosition.installmentsOwed, cur)} owed{d.netPosition.activePlans > 0 ? ` · ${d.netPosition.activePlans} plan${d.netPosition.activePlans === 1 ? '' : 's'}` : ''}</Text>
          </View>

          <View style={s.cards}>
            <View style={s.card}>
              <Text style={s.cardLabel}>THIS MONTH · NET</Text>
              <Text style={[s.cardVal, { color: d.thisMonth.net >= 0 ? C.accent : C.red }]}>{money(d.thisMonth.net, cur)}</Text>
              <Text style={s.cardSub}>{money(d.thisMonth.income, cur)} in · {money(d.thisMonth.expense, cur)} out</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>THIS YEAR · NET</Text>
              <Text style={[s.cardVal, { color: d.thisYear.net >= 0 ? C.accent : C.red }]}>{money(d.thisYear.net, cur)}</Text>
              <Text style={s.cardSub}>{money(d.thisYear.income, cur)} in · {money(d.thisYear.expense, cur)} out</Text>
            </View>
          </View>

          <Text style={s.section}>SPEND · LAST 6 MONTHS</Text>
          {d.monthly.map((m) => <Bar key={m.period} label={mLabel(m.period)} value={m.expense} max={monthMax} cur={cur} color={C.gold} />)}

          {d.byCategory.length > 0 && (
            <>
              <Text style={s.section}>BY CATEGORY · THIS YEAR</Text>
              {d.byCategory.map((c) => <Bar key={c.category} label={c.category} value={c.total} max={catMax} cur={cur} color={C.cyan} />)}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  netCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderLight, borderRadius: 16, padding: 16, marginBottom: 12 },
  netVal: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  cards: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14 },
  cardLabel: { color: C.faint, fontSize: 9, letterSpacing: 1 },
  cardVal: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  cardSub: { color: C.dim, fontSize: 11, marginTop: 2 },
  section: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 24, marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { color: C.dim, fontSize: 12, width: 64 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.surface2, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  barVal: { color: C.text, fontSize: 12, width: 72, textAlign: 'right' },
});
