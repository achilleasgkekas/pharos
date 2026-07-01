import { useEffect, useState, useCallback } from 'react';
import { View, Text, SectionList, RefreshControl, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money, shortDate, Spinner, ErrorText, Empty, ListItem } from '../ui';
import { getCalendar, type CalMonth, type CalEntry, type CalEntryKind } from '../api';

const KIND: Record<CalEntryKind, { label: string; color: string }> = {
  renewal: { label: 'RENEWAL', color: C.cyan },
  installments: { label: 'INSTALLMENTS', color: C.purple },
  bill: { label: 'BILL', color: C.red },
  income: { label: 'INCOME', color: C.accent },
  warranty: { label: 'WARRANTY', color: C.purple },
  voucher: { label: 'VOUCHER', color: C.gold },
};

type Section = { title: string; out: number; inc: number; key: string; data: CalEntry[] };

export function CalendarScreen() {
  const [months, setMonths] = useState<CalMonth[]>([]);
  const [cur, setCur] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { const r = await getCalendar(); setMonths(r.months || []); setCur(r.currency); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (loading) return <Spinner />;

  const sections: Section[] = months.map((m) => ({ title: m.label, out: m.out, inc: m.inc, key: m.key, data: m.entries }));
  const hasAny = sections.some((s) => s.data.length > 0);

  return (
    <View style={s.wrap}>
      <ErrorText>{err}</ErrorText>
      <SectionList
        sections={sections}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16 }}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={!hasAny ? <Empty>Nothing coming up.</Empty> : null}
        renderSectionHeader={({ section }) => (
          <View style={s.mhead}>
            <Text style={s.month}>{section.title}</Text>
            <View style={s.totals}>
              {section.inc > 0 && <Text style={[s.tot, { color: C.accent }]}>+{money(section.inc, cur)}</Text>}
              {section.out > 0 && <Text style={[s.tot, { color: C.red }]}>-{money(section.out, cur)}</Text>}
            </View>
          </View>
        )}
        renderItem={({ item, section }) => {
          // Skip rendering an empty month body; SectionList still shows the header.
          if (section.data.length === 0) return null;
          const k = KIND[item.kind];
          return (
            <ListItem style={item.pinned && s.pinned}>
              <View style={[s.dot, { backgroundColor: k.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.kind, { color: k.color }]}>{k.label}</Text>
                <Text style={s.label} numberOfLines={1}>{item.label}</Text>
                {!!item.sub && <Text style={s.sub} numberOfLines={1}>{item.sub}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {!item.pinned && <Text style={s.date}>{shortDate(item.date)}</Text>}
                {item.amount != null && (
                  <Text style={[s.amount, { color: item.kind === 'income' ? C.accent : C.text }]}>
                    {item.kind === 'income' ? '+' : ''}{money(item.amount, cur)}
                  </Text>
                )}
              </View>
            </ListItem>
          );
        }}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? <Text style={s.quiet}>Nothing this month.</Text> : <View style={{ height: 8 }} />
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  mhead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 },
  month: { color: C.text, fontSize: 16, fontWeight: '800' },
  totals: { flexDirection: 'row', gap: 10 },
  tot: { fontSize: 13, fontWeight: '700' },
  pinned: { backgroundColor: C.surface2 ?? C.surface, borderColor: C.purple },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kind: { fontSize: 9, letterSpacing: 1, fontWeight: '700' },
  label: { color: C.text, fontSize: 15, fontWeight: '600', marginTop: 2 },
  sub: { color: C.dim, fontSize: 12, marginTop: 1 },
  date: { color: C.dim, fontSize: 13 },
  amount: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  quiet: { color: C.faint, fontSize: 13, marginBottom: 14 },
});
