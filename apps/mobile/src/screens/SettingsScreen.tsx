import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { C } from '../theme';
import { money, ErrorText } from '../ui';
import { PharosMark } from '../PharosMark';
import { APP_VERSION } from '../config';
import { currentBase, currentUser, getSettings, updateSettings, testNotify, type AppSettings } from '../api';

const CURRENCIES = ['EUR', 'USD', 'GBP'];

export function SettingsScreen({ onSignOut }: { onSignOut: () => void }) {
  const user = currentUser();
  const [cfg, setCfg] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Editable local state (initialised from cfg).
  const [currency, setCurrency] = useState('EUR');
  const [vat, setVat] = useState('24');
  const [warranty, setWarranty] = useState('24');
  const [alertDays, setAlertDays] = useState('90');
  const [autoAdd, setAutoAdd] = useState(true);
  const [ntfyUrl, setNtfyUrl] = useState('');
  const [ntfyOn, setNtfyOn] = useState(false);
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  function hydrate(s: AppSettings) {
    setCfg(s);
    setCurrency(s.currency || 'EUR');
    setVat(String(s.defaultVatRate ?? 24));
    setWarranty(String(s.defaultWarrantyMonths ?? 24));
    setAlertDays(String(s.warrantyAlertDays ?? 90));
    setAutoAdd(s.autoAddStores !== false);
    setNtfyUrl(s.ntfyUrl || '');
    setNtfyOn(!!s.ntfyEnabled);
    const bm: Record<string, string> = {};
    for (const b of s.budgets) bm[b.category] = String(b.limit);
    setBudgets(bm);
  }

  useEffect(() => {
    (async () => {
      try { hydrate(await getSettings()); } catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, []);

  async function save() {
    setSaving(true); setErr(null);
    const budgetMap: Record<string, number> = {};
    for (const [k, v] of Object.entries(budgets)) {
      const n = parseFloat(v.replace(',', '.'));
      if (Number.isFinite(n) && n > 0) budgetMap[k] = n;
    }
    try {
      await updateSettings({
        currency,
        defaultVatRate: parseFloat(vat) || 0,
        defaultWarrantyMonths: parseInt(warranty, 10) || 0,
        warrantyAlertDays: parseInt(alertDays, 10) || 0,
        autoAddStores: autoAdd,
        ntfyUrl: ntfyUrl.trim(),
        ntfyEnabled: ntfyOn,
        budgets: budgetMap,
      });
      hydrate(await getSettings());
      Alert.alert('Saved', 'Settings updated.');
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function test() {
    setTesting(true); setErr(null);
    try { await testNotify(); Alert.alert('Sent', 'Test notification delivered to your ntfy topic.'); }
    catch (e) { Alert.alert('Failed', (e as Error).message); }
    finally { setTesting(false); }
  }

  const addableCats = (cfg?.expenseCategories || []).filter((c) => !(c in budgets));

  if (loading) return <View style={s.loadWrap}><ActivityIndicator color={C.accent} /></View>;

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={s.logo}><PharosMark size={40} /></View>
      <ErrorText>{err}</ErrorText>

      <Text style={s.section}>ACCOUNT</Text>
      <View style={s.card}>
        <Row label="User" value={user?.name || '—'} />
        <Row label="Username" value={user?.username || '—'} />
        <Row label="Role" value={user?.role || '—'} last />
      </View>

      <Text style={s.section}>PREFERENCES</Text>
      <View style={s.cardPad}>
        <Text style={s.flabel}>CURRENCY</Text>
        <View style={s.chipsRow}>
          {CURRENCIES.map((c) => (
            <Pressable key={c} onPress={() => setCurrency(c)} style={[s.chip, currency === c && s.chipOn]}>
              <Text style={[s.chipText, currency === c && s.chipTextOn]}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.pair}>
          <Field label="DEFAULT VAT %" value={vat} onChange={setVat} keyboard="decimal-pad" />
          <Field label="WARRANTY (MONTHS)" value={warranty} onChange={setWarranty} keyboard="number-pad" />
        </View>
        <View style={s.pair}>
          <Field label="WARRANTY ALERT (DAYS)" value={alertDays} onChange={setAlertDays} keyboard="number-pad" />
          <View style={{ flex: 1 }} />
        </View>
        <Toggle label="Auto-add unknown stores" on={autoAdd} onToggle={() => setAutoAdd((v) => !v)} />
      </View>

      <Text style={s.section}>BUDGETS · THIS MONTH</Text>
      <View style={s.cardPad}>
        {Object.keys(budgets).length === 0 && <Text style={s.hint}>No budgets set. Add one below.</Text>}
        {Object.entries(budgets).map(([cat, val]) => {
          const row = cfg?.budgets.find((b) => b.category === cat);
          const limit = parseFloat(val.replace(',', '.')) || 0;
          const over = row ? row.spent > limit : false;
          return (
            <View key={cat} style={s.budget}>
              <View style={s.budgetTop}>
                <Text style={s.budgetCat}>{cat}</Text>
                {!!row && <Text style={[s.budgetNum, over && s.over]}>{money(row.spent, currency)} spent</Text>}
              </View>
              <View style={s.budgetEdit}>
                <Text style={s.curSym}>{money(0, currency).replace(/0.*/, '')}</Text>
                <TextInput value={val} onChangeText={(t) => setBudgets((p) => ({ ...p, [cat]: t }))} keyboardType="decimal-pad" placeholder="limit" placeholderTextColor={C.faint} style={s.budgetInput} />
                <Pressable onPress={() => setBudgets((p) => { const n = { ...p }; delete n[cat]; return n; })} style={s.rm}><Text style={s.rmText}>✕</Text></Pressable>
              </View>
            </View>
          );
        })}
        {addableCats.length > 0 && (
          <>
            <Text style={[s.flabel, { marginTop: 12 }]}>ADD BUDGET FOR</Text>
            <View style={s.chipsRow}>
              {addableCats.map((c) => (
                <Pressable key={c} onPress={() => setBudgets((p) => ({ ...p, [c]: '' }))} style={s.addChip}>
                  <Text style={s.addChipText}>+ {c}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      <Text style={s.section}>NOTIFICATIONS (ntfy)</Text>
      <View style={s.cardPad}>
        <Text style={s.flabel}>NTFY URL</Text>
        <TextInput value={ntfyUrl} onChangeText={setNtfyUrl} autoCapitalize="none" autoCorrect={false} placeholder="https://ntfy.sh/your-topic" placeholderTextColor={C.faint} style={s.input} />
        <Toggle label="Enable alerts" on={ntfyOn} onToggle={() => setNtfyOn((v) => !v)} />
        <Pressable onPress={test} disabled={testing || !ntfyUrl.trim()} style={[s.testBtn, (testing || !ntfyUrl.trim()) && s.dim]}>
          {testing ? <ActivityIndicator color={C.cyan} size="small" /> : <Text style={s.testText}>Send test notification</Text>}
        </Pressable>
      </View>

      <Pressable onPress={save} disabled={saving} style={[s.saveBtn, saving && s.dim]}>
        {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveText}>Save settings</Text>}
      </Pressable>

      <Text style={s.section}>CONNECTION</Text>
      <View style={s.card}>
        <Row label="Server" value={currentBase()} last />
      </View>
      <Text style={s.hint}>To change the server, sign out and edit it on the login screen.</Text>

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

function Field({ label, value, onChange, keyboard }: { label: string; value: string; onChange: (t: string) => void; keyboard: 'decimal-pad' | 'number-pad' }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.flabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboard} style={s.input} placeholderTextColor={C.faint} />
    </View>
  );
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={s.toggle}>
      <View style={[s.tbox, on && s.tboxOn]}>{on && <Text style={s.tmark}>✓</Text>}</View>
      <Text style={s.tlabel}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  loadWrap: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  logo: { alignItems: 'center', marginVertical: 18 },
  section: { color: C.faint, fontSize: 10, letterSpacing: 1.2, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14 },
  cardPad: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  noBorder: { borderBottomWidth: 0 },
  rowLabel: { color: C.dim, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  hint: { color: C.faint, fontSize: 12, paddingVertical: 8 },
  flabel: { color: C.faint, fontSize: 10, letterSpacing: 1.1, marginBottom: 6 },
  input: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 15 },
  pair: { flexDirection: 'row', gap: 12, marginTop: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#000' },
  addChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: C.cyan },
  addChipText: { color: C.cyan, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  tbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  tboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  tmark: { color: '#000', fontSize: 15, fontWeight: '800' },
  tlabel: { color: C.text, fontSize: 14 },
  budget: { marginBottom: 12 },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  budgetCat: { color: C.text, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  budgetNum: { color: C.dim, fontSize: 12, fontWeight: '600' },
  over: { color: C.red },
  budgetEdit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  curSym: { color: C.dim, fontSize: 15 },
  budgetInput: { flex: 1, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: C.text, fontSize: 15 },
  rm: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: C.border },
  rmText: { color: C.red, fontSize: 14, fontWeight: '700' },
  testBtn: { marginTop: 14, borderWidth: 1, borderColor: C.cyan, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  testText: { color: C.cyan, fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.45 },
  saveBtn: { marginTop: 20, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  saveText: { color: '#000', fontSize: 15, fontWeight: '800' },
  signout: { marginTop: 26, borderWidth: 1, borderColor: '#ff475740', backgroundColor: '#ff475715', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  signoutText: { color: C.red, fontSize: 15, fontWeight: '700' },
});
