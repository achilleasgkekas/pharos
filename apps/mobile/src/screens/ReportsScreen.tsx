import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, Spinner, ErrorText, Chip, contentWidth } from '../ui';
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

/** One month of the cash-flow chart: two stacked mini-bars (income green, expense red). */
function FlowRow({ label, income, expense, max, cur }: { label: string; income: number; expense: number; max: number; cur: string }) {
  const ipct = max > 0 ? Math.max(income > 0 ? 2 : 0, Math.round((income / max) * 100)) : 0;
  const epct = max > 0 ? Math.max(expense > 0 ? 2 : 0, Math.round((expense / max) * 100)) : 0;
  return (
    <View style={s.flowRow}>
      <Text style={s.flowLabel} numberOfLines={1}>{label}</Text>
      <View style={s.flowBars}>
        <View style={s.flowLine}>
          <View style={s.track}><View style={[s.fill, { width: `${ipct}%`, backgroundColor: C.accent }]} /></View>
          <Text style={s.flowVal}>{money(income, cur)}</Text>
        </View>
        <View style={s.flowLine}>
          <View style={s.track}><View style={[s.fill, { width: `${epct}%`, backgroundColor: C.red }]} /></View>
          <Text style={s.flowVal}>{money(expense, cur)}</Text>
        </View>
      </View>
    </View>
  );
}

/** One installment plan: label + paid/total counter, progress bar, per-month + remaining. Mirrors web /reports payoff card. */
function PayoffRow({ p, cur }: { p: NonNullable<Reports['installmentPayoff']>[number]; cur: string }) {
  const pct = p.totalInstallments > 0 ? Math.max(2, Math.min(100, Math.round((p.paidInstallments / p.totalInstallments) * 100))) : 0;
  return (
    <View style={s.payoffRow}>
      <View style={s.payoffHead}>
        <View style={s.payoffLabelWrap}>
          {p.linked && <View style={s.payoffDot} />}
          <Text style={s.payoffLabel} numberOfLines={1}>{p.label}</Text>
        </View>
        <Text style={s.payoffCount}>{p.paidInstallments}/{p.totalInstallments}</Text>
      </View>
      <View style={s.track}><View style={[s.fill, { width: `${pct}%`, backgroundColor: p.done ? C.accent : C.purple }]} /></View>
      <View style={s.payoffFoot}>
        <Text style={s.payoffFootText}>{money(p.perAmount, cur)}/mo</Text>
        <Text style={s.payoffFootText}>{p.done ? 'paid off ✓' : `${money(p.remainingAmount, cur)} left`}</Text>
      </View>
    </View>
  );
}

const RANGES = [6, 12, 24] as const;

export function ReportsScreen() {
  const [d, setD] = useState<Reports | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [months, setMonths] = useState<number>(12); // trend window (spend + cash-flow)

  const load = useCallback(async (m: number) => {
    setErr(null);
    try { setD(await getReports(m)); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(months); }, [months, load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(months); setRefreshing(false); }, [load, months]);

  if (!d && !err) return <Spinner />;

  const cur = d?.currency || 'EUR';
  const monthMax = d ? Math.max(...d.monthly.map((m) => m.expense), 1) : 1;
  const catMax = d ? Math.max(...d.byCategory.map((c) => c.total), 1) : 1;
  const instMax = d ? Math.max(...d.upcomingInstallments.map((u) => u.amount), 1) : 1;
  const storeMax = d ? Math.max(...(d.spendByStore ?? []).map((st) => st.total), 1) : 1;
  const subsMax = d ? Math.max(...(d.subsByCategory ?? []).map((sc) => sc.value), 1) : 1;
  const invMax = d ? Math.max(...(d.inventoryByCategory ?? []).map((ic) => ic.value), 1) : 1;
  const ieMax = d ? Math.max(...(d.incomeExpense ?? []).flatMap((m) => [m.income, m.expense]), 1) : 1;
  const mLabel = (p: string) => { const [, m] = p.split('-'); return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10)] || p; };
  const fmtDate = (v: string) => { const dt = new Date(v); return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, contentWidth]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>
      <ErrorText>{err}</ErrorText>
      {d && (
        <>
          {d.monthReview && (
            <View style={s.reviewCard}>
              <Text style={s.cardLabel}>MONTH IN REVIEW · {d.monthReview.monthLabel}</Text>
              <Text style={s.reviewNarrative}>{d.monthReview.narrative}</Text>
              {(d.monthReview.overBudget.length > 0 || d.monthReview.priceChanges.length > 0 || d.monthReview.warrantiesExpiringSoon.length > 0) && (
                <View style={s.reviewChips}>
                  {d.monthReview.overBudget.map((b) => (
                    <View key={`b-${b.category}`} style={[s.reviewChip, { borderColor: C.red }]}>
                      <Text style={[s.reviewChipText, { color: C.red }]}>{b.category} {money(b.actual, cur)}/{money(b.budget, cur)}</Text>
                    </View>
                  ))}
                  {d.monthReview.priceChanges.slice(0, 5).map((p) => (
                    <View key={`p-${p.vendorKey}`} style={[s.reviewChip, { borderColor: C.gold }]}>
                      <Text style={[s.reviewChipText, { color: C.gold }]}>{p.vendor} {p.direction === 'up' ? '+' : ''}{p.deltaPct}%</Text>
                    </View>
                  ))}
                  {d.monthReview.warrantiesExpiringSoon.slice(0, 5).map((w) => (
                    <View key={`w-${w.title}`} style={[s.reviewChip, { borderColor: C.cyan }]}>
                      <Text style={[s.reviewChipText, { color: C.cyan }]}>{w.title} · {w.days}d</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={s.netCard}>
            <Text style={s.cardLabel}>{d.netWorth ? 'NET WORTH' : 'NET POSITION'}</Text>
            <Text style={[s.netVal, { color: (d.netWorth ? d.netWorth.net : d.netPosition.net) >= 0 ? C.accent : C.red }]}>
              {money(d.netWorth ? d.netWorth.net : d.netPosition.net, cur)}
            </Text>
            {d.netWorth ? (
              <View style={s.reviewChips}>
                <View style={[s.reviewChip, { borderColor: C.dim }]}>
                  <Text style={[s.reviewChipText, { color: C.text }]}>Inventory {money(d.netWorth.assetsInventory, cur)}</Text>
                </View>
                <View style={[s.reviewChip, { borderColor: C.cyan }]}>
                  <Text style={[s.reviewChipText, { color: C.cyan }]}>Accounts {money(d.netWorth.assetsAccounts, cur)}</Text>
                </View>
                <View style={[s.reviewChip, { borderColor: C.red }]}>
                  <Text style={[s.reviewChipText, { color: C.red }]}>Installments -{money(d.netWorth.liabInstallments, cur)}</Text>
                </View>
                <View style={[s.reviewChip, { borderColor: C.gold }]}>
                  <Text style={[s.reviewChipText, { color: C.gold }]}>Cards -{money(d.netWorth.liabCards, cur)}</Text>
                </View>
              </View>
            ) : (
              <Text style={s.cardSub}>{money(d.netPosition.inventoryValue, cur)} owned − {money(d.netPosition.installmentsOwed, cur)} owed{d.netPosition.activePlans > 0 ? ` · ${d.netPosition.activePlans} plan${d.netPosition.activePlans === 1 ? '' : 's'}` : ''}</Text>
            )}
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

          <View style={s.rangeHead}>
            <Text style={[s.section, { marginBottom: 0 }]}>TRENDS</Text>
            <View style={s.rangeRow}>
              {RANGES.map((r) => (
                <Chip key={r} label={`${r}m`} on={months === r} onPress={() => setMonths(r)} style={s.rangeChip} />
              ))}
            </View>
          </View>

          <Text style={s.section}>SPEND · LAST {d.monthly.length} MONTHS</Text>
          {d.monthly.map((m) => <Bar key={m.period} label={mLabel(m.period)} value={m.expense} max={monthMax} cur={cur} color={C.gold} />)}

          {(d.incomeExpense ?? []).some((m) => m.income > 0 || m.expense > 0) && (
            <>
              <View style={s.flowHead}>
                <Text style={s.section}>CASH FLOW · {(d.incomeExpense ?? []).length} MONTHS</Text>
                <View style={s.legend}>
                  <View style={[s.dot, { backgroundColor: C.accent }]} /><Text style={s.legendText}>in</Text>
                  <View style={[s.dot, { backgroundColor: C.red, marginLeft: 10 }]} /><Text style={s.legendText}>out</Text>
                </View>
              </View>
              {d.incomeExpense.map((m) => <FlowRow key={m.period} label={mLabel(m.period)} income={m.income} expense={m.expense} max={ieMax} cur={cur} />)}
            </>
          )}

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

          {(d.subsByCategory?.length ?? 0) > 0 && (
            <>
              <Text style={s.section}>SUBSCRIPTIONS · MONTHLY BY CATEGORY</Text>
              {d.subsByCategory.map((sc) => <Bar key={sc.name} label={sc.name} value={sc.value} max={subsMax} cur={cur} color={C.purple} />)}
            </>
          )}

          {(d.inventoryByCategory?.length ?? 0) > 0 && (
            <>
              <Text style={s.section}>INVENTORY VALUE · BY CATEGORY</Text>
              {d.inventoryByCategory.map((ic) => <Bar key={ic.name} label={ic.name} value={ic.value} max={invMax} cur={cur} color={C.cyan} />)}
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

          {(d.installmentPayoff?.length ?? 0) > 0 && (
            <>
              <Text style={s.section}>INSTALLMENT PAYOFF</Text>
              {d.installmentPayoff!.map((p) => <PayoffRow key={p.key} p={p} cur={cur} />)}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  reviewCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 12 },
  reviewNarrative: { color: C.text, fontSize: 13, lineHeight: 19, marginTop: 6 },
  reviewChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  reviewChip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1 },
  reviewChipText: { fontSize: 11 },
  netCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderLight, borderRadius: 16, padding: 16, marginBottom: 12 },
  netVal: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  cards: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14 },
  cardLabel: { color: C.faint, fontSize: 9, letterSpacing: 1 },
  cardVal: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  cardSub: { color: C.dim, fontSize: 11, marginTop: 2 },
  section: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 24, marginBottom: 10 },
  rangeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  rangeRow: { flexDirection: 'row', gap: 6 },
  rangeChip: { paddingVertical: 5, borderRadius: 9 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { color: C.dim, fontSize: 12, width: 64 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.surface2, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  barVal: { color: C.text, fontSize: 12, width: 72, textAlign: 'right' },
  flowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { color: C.dim, fontSize: 11 },
  flowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  flowLabel: { color: C.dim, fontSize: 12, width: 40 },
  flowBars: { flex: 1, gap: 4 },
  flowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flowVal: { color: C.text, fontSize: 11, width: 72, textAlign: 'right' },
  budgetRow: { marginBottom: 12 },
  budgetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  budgetCat: { color: C.dim, fontSize: 12, flex: 1, marginRight: 8 },
  budgetAmt: { color: C.text, fontSize: 12 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  listMain: { flex: 1, marginRight: 8 },
  listTitle: { color: C.text, fontSize: 13 },
  listSub: { color: C.faint, fontSize: 11, marginTop: 2 },
  listAmt: { color: C.text, fontSize: 13, fontWeight: '600' },
  payoffRow: { marginBottom: 14 },
  payoffHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  payoffLabelWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  payoffDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginRight: 6 },
  payoffLabel: { color: C.text, fontSize: 12, fontWeight: '500', flexShrink: 1 },
  payoffCount: { color: C.faint, fontSize: 11 },
  payoffFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  payoffFootText: { color: C.faint, fontSize: 10 },
});
