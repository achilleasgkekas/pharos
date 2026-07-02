import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, Spinner, ErrorText, contentWidth } from '../ui';
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

function BudgetBar({ category, spent, limit, cur }: { category: string; spent: number; limit: number; cur: string }) {
  const ratio = limit > 0 ? spent / limit : 0;
  const over = ratio > 1;
  const pct = Math.max(2, Math.min(100, Math.round(ratio * 100)));
  const color = over ? C.red : ratio >= 0.8 ? C.gold : C.accent;
  return (
    <View style={s.budgetRow}>
      <View style={s.budgetHead}>
        <Text style={s.budgetCat} numberOfLines={1}>{category}</Text>
        <Text style={[s.budgetAmt, over && { color: C.red }]}>{money(spent, cur)} / {money(limit, cur)}</Text>
      </View>
      <View style={s.track}><View style={[s.fill, { width: `${pct}%`, backgroundColor: color }]} /></View>
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
  const instMax = d ? Math.max(...d.upcomingInstallments.map((u) => u.amount), 1) : 1;
  const storeMax = d ? Math.max(...(d.spendByStore ?? []).map((st) => st.total), 1) : 1;
  const mLabel = (p: string) => { const [, m] = p.split('-'); return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10)] || p; };
  const fmtDate = (v: string) => { const dt = new Date(v); return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, contentWidth]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>
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

          {d.budgets.length > 0 && (
            <>
              <Text style={s.section}>BUDGET · THIS MONTH</Text>
              {d.budgets.map((b) => <BudgetBar key={b.category} category={b.category} spent={b.spent} limit={b.limit} cur={cur} />)}
            </>
          )}

          {d.upcomingInstallments.some((u) => u.amount > 0) && (
            <>
              <Text style={s.section}>UPCOMING INSTALLMENTS · NEXT 6 MONTHS</Text>
              {d.upcomingInstallments.map((u) => <Bar key={u.period} label={mLabel(u.period)} value={u.amount} max={instMax} cur={cur} color={C.purple} />)}
            </>
          )}

          <Text style={s.section}>SPEND · LAST 6 MONTHS</Text>
          {d.monthly.map((m) => <Bar key={m.period} label={mLabel(m.period)} value={m.expense} max={monthMax} cur={cur} color={C.gold} />)}

          {d.byCategory.length > 0 && (
            <>
              <Text style={s.section}>BY CATEGORY · THIS YEAR</Text>
              {d.byCategory.map((c) => <Bar key={c.category} label={c.category} value={c.total} max={catMax} cur={cur} color={C.cyan} />)}
            </>
          )}

          {(d.spendByStore?.length ?? 0) > 0 && (
            <>
              <Text style={s.section}>SPEND BY STORE · TOP 8</Text>
              {d.spendByStore.map((st) => <Bar key={st.name} label={st.name} value={st.total} max={storeMax} cur={cur} color={C.accent} />)}
            </>
          )}

          {(d.biggestPurchases?.length ?? 0) > 0 && (
            <>
              <Text style={s.section}>BIGGEST PURCHASES</Text>
              {d.biggestPurchases.map((b, i) => (
                <View key={`${b.store}-${b.date}-${i}`} style={s.listRow}>
                  <View style={s.listMain}>
                    <Text style={s.listTitle} numberOfLines={1}>{b.store}</Text>
                    {b.date ? <Text style={s.listSub}>{fmtDate(b.date)}</Text> : null}
                  </View>
                  <Text style={s.listAmt}>{money(b.total, cur)}</Text>
                </View>
              ))}
            </>
          )}

          {(d.warrantiesExpiring?.length ?? 0) > 0 && (
            <>
              <Text style={s.section}>WARRANTIES EXPIRING · NEXT 150 DAYS</Text>
              {d.warrantiesExpiring.map((w, i) => (
                <View key={`${w.title}-${i}`} style={s.listRow}>
                  <Text style={[s.listTitle, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{w.title}</Text>
                  <Text style={[s.listAmt, { color: w.days <= 30 ? C.red : w.days <= 90 ? C.gold : C.dim }]}>{w.days}d left</Text>
                </View>
              ))}
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
  budgetRow: { marginBottom: 12 },
  budgetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  budgetCat: { color: C.dim, fontSize: 12, flex: 1, marginRight: 8 },
  budgetAmt: { color: C.text, fontSize: 12 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  listMain: { flex: 1, marginRight: 8 },
  listTitle: { color: C.text, fontSize: 13 },
  listSub: { color: C.faint, fontSize: 11, marginTop: 2 },
  listAmt: { color: C.text, fontSize: 13, fontWeight: '600' },
});
