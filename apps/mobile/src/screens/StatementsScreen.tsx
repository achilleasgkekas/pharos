import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, Modal, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty } from '../ui';
import { getStatements, getStatementTxns, type Statement, type StatementTxn } from '../api';

export function StatementsScreen() {
  const [rows, setRows] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [detail, setDetail] = useState<Statement | null>(null);
  const [txns, setTxns] = useState<StatementTxn[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txErr, setTxErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await getStatements()); } catch (e) { setErr((e as Error).message); }
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
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={<Empty>No statements.</Empty>}
        renderItem={({ item }) => (
          <Pressable onPress={() => openDetail(item)} style={s.card}>
            <View style={s.top}>
              <Text style={s.card_}>{item.card}{item.last4 ? ` ··${item.last4}` : ''}</Text>
              <Text style={s.total}>{money(item.totalAmount, item.currency)}</Text>
            </View>
            <Text style={s.meta}>{[item.period, item.dueDate ? `due ${shortDate(item.dueDate)}` : '', `${item.txnCount} txn`].filter(Boolean).join('  ·  ')}</Text>
          </Pressable>
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
              <View style={s.totals}>
                <View style={s.totBox}><Text style={s.totLabel}>TOTAL</Text><Text style={s.totVal}>{money(detail.totalAmount, detail.currency)}</Text></View>
                <View style={s.totBox}><Text style={s.totLabel}>MIN</Text><Text style={s.totValDim}>{money(detail.minimumPayment, detail.currency)}</Text></View>
                <View style={s.totBox}><Text style={s.totLabel}>PAID</Text><Text style={s.totValDim}>{money(detail.paidAmount, detail.currency)}</Text></View>
              </View>
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
                        {!!item.installment && <Text style={s.badge}>{item.installment.current}/{item.installment.total}</Text>}
                      </View>
                    </View>
                    <Text style={[s.txAmount, item.amount < 0 && s.credit]}>{money(item.amount, detail?.currency)}</Text>
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
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  card_: { color: C.text, fontSize: 15, fontWeight: '700' },
  total: { color: C.text, fontSize: 16, fontWeight: '800' },
  meta: { color: C.faint, fontSize: 12, marginTop: 4 },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, maxHeight: '88%' },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  sheetSub: { color: C.faint, fontSize: 13, marginTop: 3 },
  close: { color: C.dim, fontSize: 20, fontWeight: '700', paddingHorizontal: 4 },
  totals: { flexDirection: 'row', gap: 10, marginTop: 14 },
  totBox: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10 },
  totLabel: { color: C.faint, fontSize: 9, letterSpacing: 1.2 },
  totVal: { color: C.accent, fontSize: 16, fontWeight: '800', marginTop: 3 },
  totValDim: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 3 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 11 },
  txDesc: { color: C.text, fontSize: 14, fontWeight: '500' },
  txMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  txMeta: { color: C.faint, fontSize: 12 },
  badge: { color: C.cyan, fontSize: 11, fontWeight: '700', borderWidth: 1, borderColor: C.cyan, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  txAmount: { color: C.text, fontSize: 15, fontWeight: '700' },
  credit: { color: C.accent },
});
