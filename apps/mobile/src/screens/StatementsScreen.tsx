import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, Modal, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { C, RADIUS, scrim } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty, Card, Badge, Input, contentWidth } from '../ui';
import { getStatements, getStatementTxns, getInstallmentPlans, mergePlans, unmergePlan, type Statement, type StatementTxn, type InstallmentPlan } from '../api';
import { FxBadge } from '../FxControls';
import { fxBadgeLabel, normalizeCurrency } from '../fx';

// "2028-10-01" → "Oct 2028" for payoff dates.
const payoff = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

/** One installment plan in the overview, with a merge/unmerge control. Merging binds
 *  a differently-worded plan ("QUEST ONLINE" vs "QUEST ONLINE KALLITHEA") into this one
 *  so their payoff collapses. Mirror of the web PlanMergeControl. */
function PlanRow({ plan, allPlans, cur, onChanged }: {
  plan: InstallmentPlan; allPlans: InstallmentPlan[]; cur: string; onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const targets = useMemo(() => {
    const others = allPlans.filter((p) => p.key !== plan.key);
    const query = q.trim().toLowerCase();
    return (query ? others.filter((p) => p.label.toLowerCase().includes(query)) : others).slice(0, 8);
  }, [allPlans, plan.key, q]);

  async function merge(targetKey: string) {
    setBusy(true);
    try { await mergePlans(plan.key, targetKey); setOpen(false); setQ(''); await onChanged(); }
    finally { setBusy(false); }
  }
  async function unmerge() {
    setBusy(true);
    try { await unmergePlan(plan.key); await onChanged(); }
    finally { setBusy(false); }
  }

  return (
    <View style={[s.plan, plan.done && s.planDone]}>
      <View style={s.planTop}>
        <Text style={s.planLabel} numberOfLines={1}>{plan.label}{plan.itemCount > 1 ? ` · ${plan.itemCount} items` : ''}</Text>
        <Text style={[s.planAmt, plan.done && s.planAmtDone]}>
          {plan.done ? 'paid off' : `${money(plan.remainingAmount, cur)} left`}
        </Text>
      </View>
      <Text style={s.planMeta}>
        {[
          plan.card,
          `${money(plan.perAmount, cur)}/mo`,
          `${plan.paidInstallments}/${plan.totalInstallments}`,
          plan.done ? `${money(plan.totalAmount, cur)} total` : `ends ${payoff(plan.projectedEndDate)}`,
        ].filter(Boolean).join('  ·  ')}
      </Text>

      {open ? (
        <View style={s.mergeBox}>
          <Text style={s.mergeHint}>MERGE INTO ANOTHER PLAN</Text>
          <Input variant="modal" value={q} onChangeText={setQ} placeholder="Search plans…" autoFocus style={s.mergeSearch} />
          {targets.map((t) => (
            <Pressable key={t.key} onPress={() => merge(t.key)} disabled={busy} style={s.mergeItem}>
              <Text style={s.mergeItemLabel} numberOfLines={1}>{t.label}</Text>
              <Text style={s.mergeItemMeta}>{money(t.perAmount, cur)} · {t.paidInstallments}/{t.totalInstallments}</Text>
            </Pressable>
          ))}
          {targets.length === 0 && <Text style={s.mergeEmpty}>No other plans</Text>}
          <Pressable onPress={() => { setOpen(false); setQ(''); }} hitSlop={8}><Text style={s.mergeCancel}>Cancel</Text></Pressable>
        </View>
      ) : (
        <View style={s.mergeActions}>
          <Pressable onPress={() => setOpen(true)} disabled={busy || allPlans.length < 2} hitSlop={8}>
            <Text style={[s.mergeBtn, allPlans.length < 2 && s.mergeBtnDisabled]}>⑂ Merge into…</Text>
          </Pressable>
          {plan.merged && (
            <Pressable onPress={unmerge} disabled={busy} hitSlop={8}>
              <Text style={s.unmergeBtn}>Unmerge</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export function StatementsScreen() {
  const [rows, setRows] = useState<Statement[]>([]);
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  // P9: the deployment's base currency, which EVERY amount on this screen is denominated in
  // (statement totals, charges, installment plans). It arrives with the plans payload, so no
  // extra settings request is needed here — and it must never be read off a row: a foreign
  // statement's `currency` is what the issuer printed, not what the stored number is in.
  const [base, setBase] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [detail, setDetail] = useState<Statement | null>(null);
  const [txns, setTxns] = useState<StatementTxn[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txErr, setTxErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [st, pl] = await Promise.all([getStatements(), getInstallmentPlans()]);
      setRows(st);
      setPlans(pl.plans);
      setBase(normalizeCurrency(pl.currency) || 'EUR');
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  async function openDetail(item: Statement) {
    setDetail(item); setTxns([]); setTxErr(null); setTxLoading(true);
    try { setTxns(await getStatementTxns(item.id)); } catch (e) { setTxErr((e as Error).message); }
    finally { setTxLoading(false); }
  }

  if (loading) return <Spinner />;

  return (
    <View style={s.wrap}>
      <ErrorText>{err}</ErrorText>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[{ padding: 16 }, contentWidth]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListHeaderComponent={plans.length ? (
          <View style={s.plansBox}>
            <Text style={s.plansHead}>INSTALLMENT PLANS · {plans.filter((p) => !p.done).length} active</Text>
            {plans.map((p) => (
              <PlanRow key={p.key} plan={p} allPlans={plans} cur={base} onChanged={load} />
            ))}
          </View>
        ) : null}
        ListEmptyComponent={<Empty>No statements.</Empty>}
        renderItem={({ item }) => (
          <Card onPress={() => openDetail(item)}>
            <View style={s.top}>
              <Text style={s.card_}>{item.card}{item.last4 ? ` ··${item.last4}` : ''}</Text>
              <View style={s.totalCol}>
                {/* Base-currency total, with what the statement printed underneath it. */}
                <Text style={s.total}>{money(item.totalAmount, base)}</Text>
                <FxBadge doc={item} base={base} />
              </View>
            </View>
            <Text style={s.meta}>{[item.period, item.dueDate ? `due ${shortDate(item.dueDate)}` : '', `${item.txnCount} txn`].filter(Boolean).join('  ·  ')}</Text>
          </Card>
        )}
      />

      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>{detail?.card}{detail?.last4 ? ` ··${detail.last4}` : ''}</Text>
                <Text style={s.sheetSub}>{detail?.period}{detail?.dueDate ? `  ·  due ${shortDate(detail.dueDate)}` : ''}</Text>
              </View>
              <Pressable onPress={() => setDetail(null)} hitSlop={10}><Text style={s.close}>✕</Text></Pressable>
            </View>

            {!!detail && (
              <>
                <View style={s.totals}>
                  <View style={s.totBox}><Text style={s.totLabel}>TOTAL</Text><Text style={s.totVal}>{money(detail.totalAmount, base)}</Text></View>
                  <View style={s.totBox}><Text style={s.totLabel}>MIN</Text><Text style={s.totValDim}>{money(detail.minimumPayment, base)}</Text></View>
                  <View style={s.totBox}><Text style={s.totLabel}>PAID</Text><Text style={s.totValDim}>{money(detail.paidAmount, base)}</Text></View>
                </View>
                {/* One rate converts the whole document, so the chip belongs to the sheet, not
                    to each charge: every amount below is already this statement's rate applied. */}
                {!!fxBadgeLabel(detail, base) && (
                  <View style={s.fxRow}>
                    <FxBadge doc={detail} base={base} />
                    <Text style={s.fxNote}>printed total · every amount below is converted</Text>
                  </View>
                )}
              </>
            )}

            <ErrorText>{txErr}</ErrorText>
            {txLoading ? <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} /> : (
              <FlatList
                data={txns}
                keyExtractor={(t) => t.id}
                style={{ marginTop: 6 }}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListEmptyComponent={<Empty>No transactions parsed.</Empty>}
                renderItem={({ item }) => (
                  <View style={s.txRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.txDesc} numberOfLines={2}>{item.description || '—'}</Text>
                      <View style={s.txMetaRow}>
                        {!!item.date && <Text style={s.txMeta}>{shortDate(item.date)}</Text>}
                        {!!item.installment && <Badge label={`${item.installment.current}/${item.installment.total}`} color={C.cyan} />}
                      </View>
                    </View>
                    <Text style={[s.txAmount, item.amount < 0 && s.credit]}>{money(item.amount, base)}</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  plansBox: { marginBottom: 16 },
  plansHead: { color: C.faint, fontSize: 10, letterSpacing: 1.4, fontWeight: '700', marginBottom: 8 },
  plan: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.md, padding: 12, marginBottom: 8 },
  planDone: { opacity: 0.6 },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  planLabel: { color: C.text, fontSize: 14, fontWeight: '700', flex: 1 },
  planAmt: { color: C.purple, fontSize: 14, fontWeight: '800' },
  planAmtDone: { color: C.faint, fontWeight: '700' },
  planMeta: { color: C.faint, fontSize: 12, marginTop: 5 },
  mergeActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 9 },
  mergeBtn: { color: C.dim, fontSize: 12, fontWeight: '600' },
  mergeBtnDisabled: { opacity: 0.4 },
  unmergeBtn: { color: C.red, fontSize: 12, fontWeight: '600' },
  mergeBox: { backgroundColor: C.surface2, borderRadius: RADIUS.sm, padding: 8, marginTop: 9, gap: 6 },
  mergeHint: { color: C.faint, fontSize: 9, letterSpacing: 1.2, fontWeight: '700' },
  mergeSearch: { marginBottom: 2 },
  mergeItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, backgroundColor: C.surface },
  mergeItemLabel: { color: C.text, fontSize: 13, fontWeight: '500', flex: 1 },
  mergeItemMeta: { color: C.faint, fontSize: 11 },
  mergeEmpty: { color: C.faint, fontSize: 12, fontStyle: 'italic', paddingVertical: 4 },
  mergeCancel: { color: C.dim, fontSize: 12, paddingVertical: 2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  card_: { color: C.text, fontSize: 15, fontWeight: '700', flex: 1 },
  totalCol: { alignItems: 'flex-end', gap: 3 },
  total: { color: C.text, fontSize: 16, fontWeight: '800' },
  fxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  fxNote: { color: C.faint, fontSize: 11, flex: 1 },
  meta: { color: C.faint, fontSize: 12, marginTop: 4 },
  sheetWrap: { flex: 1, backgroundColor: scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, maxHeight: '88%' },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  sheetSub: { color: C.faint, fontSize: 13, marginTop: 3 },
  close: { color: C.dim, fontSize: 20, fontWeight: '700', paddingHorizontal: 4 },
  totals: { flexDirection: 'row', gap: 10, marginTop: 14 },
  totBox: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.md, padding: 10 },
  totLabel: { color: C.faint, fontSize: 9, letterSpacing: 1.2 },
  totVal: { color: C.accent, fontSize: 16, fontWeight: '800', marginTop: 3 },
  totValDim: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 3 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 11 },
  txDesc: { color: C.text, fontSize: 14, fontWeight: '500' },
  txMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  txMeta: { color: C.faint, fontSize: 12 },
  txAmount: { color: C.text, fontSize: 15, fontWeight: '700' },
  credit: { color: C.accent },
});
