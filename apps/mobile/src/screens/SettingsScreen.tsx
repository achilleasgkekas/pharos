import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet, Alert, Modal } from 'react-native';
import { C, alpha } from '../theme';
import { money, ErrorText, Check } from '../ui';
import { PharosMark } from '../PharosMark';
import { APP_VERSION } from '../config';
import {
  currentBase, currentUser, getSettings, updateSettings, testNotify, type AppSettings,
  getCards, createCard, updateCard, deleteCard, type Card, type CardInput,
  getStores, createStore, updateStore, deleteStore, type StoreRow, type StoreInput,
  getLists, saveList, type ListEntry,
} from '../api';

const CURRENCIES = ['EUR', 'USD', 'GBP'];
const CARD_KINDS: Card['kind'][] = ['credit', 'debit'];
const CARD_TYPES: Card['type'][] = ['mastercard', 'visa', 'amex', 'maestro', 'other'];
const CARD_COLORS = [C.cyan, C.accent, C.gold, C.purple, C.red, C.text];

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

      <CardsSection currency={currency} />
      <StoresSection />
      <ListsSection />

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

// ---- Payment cards CRUD (self-contained: loads + saves independently) ----
const EMPTY_CARD: CardInput = { name: '', last4: '', bank: '', kind: 'credit', type: 'other', color: C.cyan, creditLimit: 0, notes: '' };

function CardsSection({ currency }: { currency: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Card | 'new' | null>(null);

  async function load() {
    try { setCards(await getCards()); setErr(null); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function toggle(c: Card) {
    setCards((p) => p.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
    try { await updateCard(c.id, { active: !c.active }); } catch (e) { setErr((e as Error).message); load(); }
  }
  function remove(c: Card) {
    Alert.alert('Delete card', `Remove "${c.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteCard(c.id); setCards((p) => p.filter((x) => x.id !== c.id)); }
        catch (e) { setErr((e as Error).message); }
      } },
    ]);
  }

  return (
    <>
      <Text style={s.section}>PAYMENT CARDS</Text>
      <View style={s.cardPad}>
        <ErrorText>{err}</ErrorText>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 8 }} />
        ) : cards.length === 0 ? (
          <Text style={s.hint}>No cards yet. Add one below.</Text>
        ) : (
          cards.map((c) => (
            <View key={c.id} style={s.cardRow}>
              <View style={[s.dot, { backgroundColor: c.color }]} />
              <Pressable style={{ flex: 1 }} onPress={() => setEditing(c)}>
                <Text style={[s.cardName, !c.active && s.dimText]} numberOfLines={1}>{c.name}</Text>
                <Text style={s.cardMeta} numberOfLines={1}>
                  {[c.bank, c.kind, c.last4 ? `••${c.last4}` : ''].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
              <Pressable onPress={() => toggle(c)} style={[s.activePill, c.active ? s.activeOn : s.activeOff]}>
                <Text style={[s.activePillText, c.active ? s.activeOnText : s.activeOffText]}>{c.active ? 'ON' : 'OFF'}</Text>
              </Pressable>
              <Pressable onPress={() => remove(c)} style={s.rm}><Text style={s.rmText}>✕</Text></Pressable>
            </View>
          ))
        )}
        <Pressable onPress={() => setEditing('new')} style={s.addCardBtn}>
          <Text style={s.addCardText}>+ Add card</Text>
        </Pressable>
      </View>

      {editing && (
        <CardEditor
          card={editing === 'new' ? null : editing}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function CardEditor({ card, currency, onClose, onSaved }: { card: Card | null; currency: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CardInput>(card ? { ...card } : { ...EMPTY_CARD });
  const [limit, setLimit] = useState(String(card?.creditLimit ?? ''));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof CardInput>(k: K, v: CardInput[K]) => setForm((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!form.name?.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr(null);
    const payload: CardInput = {
      name: form.name.trim(),
      last4: (form.last4 || '').replace(/\D/g, '').slice(0, 4),
      bank: form.bank || '',
      kind: form.kind,
      type: form.type,
      color: form.color,
      creditLimit: parseFloat(limit.replace(',', '.')) || 0,
      notes: form.notes || '',
    };
    try {
      if (card) await updateCard(card.id, payload);
      else await createCard(payload);
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  const curSym = money(0, currency).replace(/0.*/, '');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalSheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 30 }}>
            <Text style={s.modalTitle}>{card ? 'Edit card' : 'New card'}</Text>
            <ErrorText>{err}</ErrorText>

            <Text style={s.flabel}>NAME</Text>
            <TextInput value={form.name} onChangeText={(t) => set('name', t)} placeholder="e.g. Mastercard 7791" placeholderTextColor={C.faint} style={s.input} />

            <View style={s.pair}>
              <View style={{ flex: 1 }}>
                <Text style={s.flabel}>BANK</Text>
                <TextInput value={form.bank} onChangeText={(t) => set('bank', t)} placeholder="Bank" placeholderTextColor={C.faint} style={s.input} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.flabel}>LAST 4</Text>
                <TextInput value={form.last4} onChangeText={(t) => set('last4', t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="7791" placeholderTextColor={C.faint} style={s.input} />
              </View>
            </View>

            <Text style={[s.flabel, { marginTop: 12 }]}>KIND</Text>
            <View style={s.chipsRow}>
              {CARD_KINDS.map((k) => (
                <Pressable key={k} onPress={() => set('kind', k)} style={[s.chip, form.kind === k && s.chipOn]}>
                  <Text style={[s.chipText, form.kind === k && s.chipTextOn]}>{k}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.flabel, { marginTop: 12 }]}>TYPE</Text>
            <View style={s.chipsRow}>
              {CARD_TYPES.map((t) => (
                <Pressable key={t} onPress={() => set('type', t)} style={[s.chip, form.type === t && s.chipOn]}>
                  <Text style={[s.chipText, form.type === t && s.chipTextOn]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.flabel, { marginTop: 12 }]}>COLOR</Text>
            <View style={s.chipsRow}>
              {CARD_COLORS.map((col) => (
                <Pressable key={col} onPress={() => set('color', col)} style={[s.swatch, { backgroundColor: col }, form.color === col && s.swatchOn]} />
              ))}
            </View>

            <Text style={[s.flabel, { marginTop: 12 }]}>CREDIT LIMIT ({curSym || currency})</Text>
            <TextInput value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.faint} style={s.input} />

            <Text style={[s.flabel, { marginTop: 12 }]}>NOTES</Text>
            <TextInput value={form.notes} onChangeText={(t) => set('notes', t)} placeholder="Optional" placeholderTextColor={C.faint} style={[s.input, { height: 64, textAlignVertical: 'top' }]} multiline />

            <View style={s.modalBtns}>
              <Pressable onPress={onClose} style={s.cancelBtn}><Text style={s.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={save} disabled={saving} style={[s.saveBtn, { flex: 1, marginTop: 0 }, saving && s.dim]}>
                {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveText}>{card ? 'Save card' : 'Add card'}</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---- Store list management (search + CRUD, self-contained) ----
function StoresSection() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<StoreRow | 'new' | null>(null);

  async function load() {
    try { setStores(await getStores()); setErr(null); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function remove(st: StoreRow) {
    Alert.alert('Delete store', `Remove "${st.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteStore(st.id); setStores((p) => p.filter((x) => x.id !== st.id)); }
        catch (e) { setErr((e as Error).message); }
      } },
    ]);
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? stores.filter((st) => st.name.toLowerCase().includes(q) || st.aliases.some((a) => a.includes(q)))
    : stores;
  const CAP = 12;
  const shown = q ? filtered : filtered.slice(0, CAP);
  const hidden = q ? 0 : Math.max(0, filtered.length - CAP);

  return (
    <>
      <Text style={s.section}>STORES ({stores.length})</Text>
      <View style={s.cardPad}>
        <ErrorText>{err}</ErrorText>
        <TextInput value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Search stores…" placeholderTextColor={C.faint} style={[s.input, { marginBottom: 8 }]} />
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 8 }} />
        ) : shown.length === 0 ? (
          <Text style={s.hint}>{q ? 'No matches.' : 'No stores yet.'}</Text>
        ) : (
          shown.map((st) => (
            <View key={st.id} style={s.cardRow}>
              <Pressable style={{ flex: 1 }} onPress={() => setEditing(st)}>
                <View style={s.storeNameRow}>
                  <Text style={s.cardName} numberOfLines={1}>{st.name}</Text>
                  {st.auto && <Text style={s.autoBadge}>review</Text>}
                </View>
                {!!st.aliases.length && <Text style={s.cardMeta} numberOfLines={1}>{st.aliases.join(', ')}</Text>}
              </Pressable>
              <Pressable onPress={() => remove(st)} style={s.rm}><Text style={s.rmText}>✕</Text></Pressable>
            </View>
          ))
        )}
        {hidden > 0 && <Text style={s.hint}>+{hidden} more — search to filter</Text>}
        <Pressable onPress={() => setEditing('new')} style={s.addCardBtn}>
          <Text style={s.addCardText}>+ Add store</Text>
        </Pressable>
      </View>

      {editing && (
        <StoreEditor
          store={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function StoreEditor({ store, onClose, onSaved }: { store: StoreRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(store?.name ?? '');
  const [url, setUrl] = useState(store?.url ?? '');
  const [aliases, setAliases] = useState((store?.aliases ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr(null);
    const payload: StoreInput = {
      name: name.trim(),
      url: url.trim(),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
    };
    try {
      if (store) await updateStore(store.id, payload);
      else await createStore(payload);
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalSheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 30 }}>
            <Text style={s.modalTitle}>{store ? 'Edit store' : 'New store'}</Text>
            <ErrorText>{err}</ErrorText>

            <Text style={s.flabel}>NAME</Text>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Skroutz" placeholderTextColor={C.faint} style={s.input} />

            <Text style={[s.flabel, { marginTop: 12 }]}>URL</Text>
            <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://skroutz.gr" placeholderTextColor={C.faint} style={s.input} />

            <Text style={[s.flabel, { marginTop: 12 }]}>ALIASES (comma-separated)</Text>
            <TextInput value={aliases} onChangeText={setAliases} autoCapitalize="none" autoCorrect={false} placeholder="skroutz, skroutz.gr" placeholderTextColor={C.faint} style={s.input} />
            <Text style={s.hint}>Match terms the AI uses to recognise this shop on receipts.</Text>

            <View style={s.modalBtns}>
              <Pressable onPress={onClose} style={s.cancelBtn}><Text style={s.cancelText}>Cancel</Text></Pressable>
              <Pressable onPress={save} disabled={saving} style={[s.saveBtn, { flex: 1, marginTop: 0 }, saving && s.dim]}>
                {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveText}>{store ? 'Save store' : 'Add store'}</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---- Editable dropdown lists / category taxonomies ----
function ListsSection() {
  const [lists, setLists] = useState<ListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0); // bump to remount editors with fresh data after a save

  async function load() {
    try { setLists(await getLists()); setErr(null); setRev((r) => r + 1); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <Text style={s.section}>DROPDOWN LISTS</Text>
      <View style={s.cardPad}>
        <ErrorText>{err}</ErrorText>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 8 }} />
        ) : (
          lists.map((l, i) => <ListEditor key={`${l.key}-${rev}`} entry={l} last={i === lists.length - 1} onSaved={load} />)
        )}
      </View>
    </>
  );
}

function ListEditor({ entry, last, onSaved }: { entry: ListEntry; last: boolean; onSaved: () => void }) {
  const [values, setValues] = useState<string[]>(entry.values);
  const [add, setAdd] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = values.length !== entry.values.length || values.some((v, i) => v !== entry.values[i]);
  const isDefault = values.length === entry.default.length && values.every((v, i) => v === entry.default[i]);

  function addVal() {
    const v = add.trim().toLowerCase();
    if (!v || values.includes(v)) { setAdd(''); return; }
    setValues((p) => [...p, v]); setAdd('');
  }

  async function save(next?: string[]) {
    const payload = next ?? values;
    setSaving(true); setErr(null);
    try { await saveList(entry.key, payload); onSaved(); }
    catch (e) { setErr((e as Error).message); setSaving(false); }
  }

  return (
    <View style={[s.listBlock, !last && s.listBlockBorder]}>
      <Text style={s.listLabel}>{entry.label}</Text>
      <Text style={s.listWhere}>{entry.where}</Text>
      <ErrorText>{err}</ErrorText>
      <View style={s.chipsRow}>
        {values.map((v) => (
          <Pressable key={v} onPress={() => setValues((p) => p.filter((x) => x !== v))} style={s.valChip}>
            <Text style={s.valChipText}>{v}</Text>
            <Text style={s.valChipX}> ✕</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.listAddRow}>
        <TextInput value={add} onChangeText={setAdd} onSubmitEditing={addVal} returnKeyType="done" autoCapitalize="none" autoCorrect={false} placeholder="add category…" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} />
        <Pressable onPress={addVal} style={s.listAddBtn}><Text style={s.listAddText}>+</Text></Pressable>
      </View>
      <View style={s.listBtns}>
        <Pressable onPress={() => save()} disabled={saving || !dirty} style={[s.listSaveBtn, (saving || !dirty) && s.dim]}>
          {saving ? <ActivityIndicator color="#000" size="small" /> : <Text style={s.listSaveText}>Save</Text>}
        </Pressable>
        {!isDefault && (
          <Pressable onPress={() => save(entry.default)} disabled={saving} style={s.listResetBtn}>
            <Text style={s.listResetText}>Reset to default</Text>
          </Pressable>
        )}
      </View>
    </View>
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
      <Check checked={!!on} />
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
  chipTextOn: { color: C.onAccent },
  addChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: C.cyan },
  addChipText: { color: C.cyan, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
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
  saveText: { color: C.onAccent, fontSize: 15, fontWeight: '800' },
  signout: { marginTop: 26, borderWidth: 1, borderColor: alpha(C.red, 0.25), backgroundColor: alpha(C.red, 0.08), borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  signoutText: { color: C.red, fontSize: 15, fontWeight: '700' },
  // cards
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  dot: { width: 12, height: 12, borderRadius: 6 },
  cardName: { color: C.text, fontSize: 14, fontWeight: '600' },
  dimText: { color: C.dim },
  cardMeta: { color: C.faint, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  activePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  activeOn: { borderColor: C.accent, backgroundColor: alpha(C.accent, 0.08) },
  activeOff: { borderColor: C.border },
  activePillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  activeOnText: { color: C.accent },
  activeOffText: { color: C.faint },
  addCardBtn: { marginTop: 12, borderWidth: 1, borderColor: C.cyan, borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  addCardText: { color: C.cyan, fontSize: 14, fontWeight: '700' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: C.text },
  // stores
  storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autoBadge: { color: C.gold, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, borderWidth: 1, borderColor: alpha(C.gold, 0.31), borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, textTransform: 'uppercase' },
  // dropdown lists
  listBlock: { paddingVertical: 12 },
  listBlockBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  listLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  listWhere: { color: C.faint, fontSize: 11, marginTop: 1, marginBottom: 8 },
  valChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  valChipText: { color: C.text, fontSize: 12, fontWeight: '600' },
  valChipX: { color: C.faint, fontSize: 11, fontWeight: '700' },
  listAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  listAddBtn: { width: 44, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.cyan },
  listAddText: { color: C.onAccent, fontSize: 20, fontWeight: '800' },
  listBtns: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  listSaveBtn: { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 22, alignItems: 'center' },
  listSaveText: { color: C.onAccent, fontSize: 13, fontWeight: '800' },
  listResetBtn: { paddingVertical: 9, paddingHorizontal: 6 },
  listResetText: { color: C.dim, fontSize: 12, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: alpha('#000', 0.67), justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.border, maxHeight: '90%' },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 22, alignItems: 'stretch' },
  cancelBtn: { paddingHorizontal: 20, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border },
  cancelText: { color: C.dim, fontSize: 15, fontWeight: '600' },
});
