import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { C } from '../theme';
import { money } from '../ui';
import { PharosMark } from '../PharosMark';
import { APP_VERSION } from '../config';
import { currentBase, currentUser, getSettings, type AppSettings } from '../api';

export function SettingsScreen({ onSignOut }: { onSignOut: () => void }) {
  const user = currentUser();
  const [cfg, setCfg] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setCfg(await getSettings()); } catch { /* preferences are best-effort */ }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16 }}>
      <View style={s.logo}><PharosMark size={40} /></View>

      <Text style={s.section}>ACCOUNT</Text>
      <View style={s.card}>
        <Row label="User" value={user?.name || '—'} />
        <Row label="Username" value={user?.username || '—'} />
        <Row label="Role" value={user?.role || '—'} />
      </View>

      <Text style={s.section}>PREFERENCES</Text>
      <View style={s.card}>
        {loading ? <ActivityIndicator color={C.accent} style={{ paddingVertical: 14 }} /> : (
          <>
            <Row label="Currency" value={cfg?.currency || '—'} />
            <Row label="Default VAT" value={cfg ? `${cfg.defaultVatRate}%` : '—'} last />
          </>
        )}
      </View>

      {!!cfg?.budgets.length && (
        <>
          <Text style={s.section}>BUDGETS · THIS MONTH</Text>
          <View style={s.card}>
            {cfg.budgets.map((b, i) => {
              const pct = b.limit > 0 ? b.spent / b.limit : 0;
              const over = b.spent > b.limit;
              return (
                <View key={b.category} style={[s.budget, i === cfg.budgets.length - 1 && s.noBorder]}>
                  <View style={s.budgetTop}>
                    <Text style={s.budgetCat}>{b.category}</Text>
                    <Text style={[s.budgetNum, over && s.over]}>{money(b.spent, cfg.currency)} / {money(b.limit, cfg.currency)}</Text>
                  </View>
                  <View style={s.track}>
                    <View style={[s.fill, { width: `${Math.min(pct, 1) * 100}%` }, over && s.fillOver]} />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      <Text style={s.section}>CONNECTION</Text>
      <View style={s.card}>
        <Row label="Server" value={currentBase()} last />
        <Text style={s.hint}>To change the server, sign out and edit it on the login screen.</Text>
      </View>

      <Text style={s.section}>ABOUT</Text>
      <View style={s.card}>
        <Row label="App" value="Pharos Mobile" />
        <Row label="Version" value={APP_VERSION} last />
      </View>

      <Pressable onPress={onSignOut} style={s.signout}><Text style={s.signoutText}>Sign out</Text></Pressable>
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.row, last && s.noBorder]}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  logo: { alignItems: 'center', marginVertical: 18 },
  section: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  noBorder: { borderBottomWidth: 0 },
  rowLabel: { color: C.dim, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  hint: { color: C.faint, fontSize: 12, paddingVertical: 12 },
  budget: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 },
  budgetCat: { color: C.text, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  budgetNum: { color: C.dim, fontSize: 13, fontWeight: '600' },
  over: { color: C.red },
  track: { height: 6, borderRadius: 3, backgroundColor: C.surface2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: C.accent },
  fillOver: { backgroundColor: C.red },
  signout: { marginTop: 26, borderWidth: 1, borderColor: '#ff475740', backgroundColor: '#ff475715', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  signoutText: { color: C.red, fontSize: 15, fontWeight: '700' },
});
