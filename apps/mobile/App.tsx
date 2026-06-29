import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, SafeAreaView, Platform, StatusBar as RNStatusBar, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C } from './src/theme';
import { loadSession, logout } from './src/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ShoppingScreen } from './src/screens/ShoppingScreen';

type Tab = 'dashboard' | 'shopping';

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => { (async () => { setAuthed(await loadSession()); setReady(true); })(); }, []);

  if (!ready) {
    return <View style={s.splash}><StatusBar style="light" /><ActivityIndicator color={C.accent} /></View>;
  }

  if (!authed) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <LoginScreen onLogin={() => setAuthed(true)} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="light" />
      <View style={s.topbar}>
        <Text style={s.brand}>PHAROS</Text>
        <Pressable onPress={async () => { await logout(); setAuthed(false); }} hitSlop={8}>
          <Text style={s.logout}>Sign out</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'dashboard' ? <DashboardScreen /> : <ShoppingScreen />}
      </View>

      <View style={s.tabbar}>
        <TabBtn label="Dashboard" active={tab === 'dashboard'} onPress={() => setTab('dashboard')} />
        <TabBtn label="Shopping" active={tab === 'shopping'} onPress={() => setTab('shopping')} />
      </View>
    </SafeAreaView>
  );
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.tabBtn}>
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  app: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  brand: { color: C.text, fontSize: 16, fontWeight: '800', letterSpacing: 3 },
  logout: { color: C.dim, fontSize: 13 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: C.accent },
});
