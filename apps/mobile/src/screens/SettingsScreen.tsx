import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { C } from '../theme';
import { PharosMark } from '../PharosMark';
import { APP_VERSION } from '../config';
import { currentBase, currentUser } from '../api';

export function SettingsScreen({ onSignOut }: { onSignOut: () => void }) {
  const user = currentUser();
  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 16 }}>
      <View style={s.logo}><PharosMark size={40} /></View>

      <Text style={s.section}>ACCOUNT</Text>
      <View style={s.card}>
        <Row label="User" value={user?.name || '—'} />
        <Row label="Username" value={user?.username || '—'} />
        <Row label="Role" value={user?.role || '—'} />
      </View>

      <Text style={s.section}>CONNECTION</Text>
      <View style={s.card}>
        <Row label="Server" value={currentBase()} />
        <Text style={s.hint}>To change the server, sign out and edit it on the login screen.</Text>
      </View>

      <Text style={s.section}>ABOUT</Text>
      <View style={s.card}>
        <Row label="App" value="Pharos Mobile" />
        <Row label="Version" value={APP_VERSION} />
      </View>

      <Pressable onPress={onSignOut} style={s.signout}><Text style={s.signoutText}>Sign out</Text></Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
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
  rowLabel: { color: C.dim, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  hint: { color: C.faint, fontSize: 12, paddingVertical: 12 },
  signout: { marginTop: 26, borderWidth: 1, borderColor: '#ff475740', backgroundColor: '#ff475715', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  signoutText: { color: C.red, fontSize: 15, fontWeight: '700' },
});
