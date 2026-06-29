import { useEffect, useState } from 'react';
import { View, ActivityIndicator, SafeAreaView, Platform, StatusBar as RNStatusBar, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C } from './src/theme';
import { loadSession, logout } from './src/api';
import { registerForPush, unregisterForPush } from './src/push';
import { AppBar, Drawer } from './src/nav';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen, type ScreenKey } from './src/screens/HomeScreen';
import { ShoppingScreen } from './src/screens/ShoppingScreen';
import { ReceiptsScreen } from './src/screens/ReceiptsScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { MoneyScreen } from './src/screens/MoneyScreen';
import { SubscriptionsScreen } from './src/screens/SubscriptionsScreen';
import { ItemsScreen } from './src/screens/ItemsScreen';
import { AssistantScreen } from './src/screens/AssistantScreen';
import { VouchersScreen } from './src/screens/VouchersScreen';
import { StatementsScreen } from './src/screens/StatementsScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';

const TITLES: Record<ScreenKey, string> = {
  home: 'Pharos', assistant: 'AI assistant', shopping: 'Shopping list', receipts: 'Receipts',
  tasks: 'Tasks', expenses: 'Expenses', income: 'Income', subscriptions: 'Subscriptions', items: 'Inventory',
  vouchers: 'Vouchers', statements: 'Statements', calendar: 'Calendar', reports: 'Reports', settings: 'Settings',
  search: 'Search', activity: 'Activity',
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [screen, setScreen] = useState<ScreenKey>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { (async () => { setAuthed(await loadSession()); setReady(true); })(); }, []);
  // Register this device for push once authenticated (no-op in Expo Go / without EAS creds).
  useEffect(() => { if (authed) void registerForPush(); }, [authed]);

  if (!ready) {
    return <View style={s.splash}><StatusBar style="light" /><ActivityIndicator color={C.accent} /></View>;
  }
  if (!authed) {
    return <View style={{ flex: 1 }}><StatusBar style="light" /><LoginScreen onLogin={() => setAuthed(true)} /></View>;
  }

  async function signOut() { setDrawerOpen(false); await unregisterForPush(); await logout(); setScreen('home'); setAuthed(false); }

  function body() {
    switch (screen) {
      case 'home': return <HomeScreen onOpen={setScreen} />;
      case 'assistant': return <AssistantScreen />;
      case 'shopping': return <ShoppingScreen />;
      case 'receipts': return <ReceiptsScreen />;
      case 'tasks': return <TasksScreen />;
      case 'expenses': return <MoneyScreen kind="expense" />;
      case 'income': return <MoneyScreen kind="income" />;
      case 'subscriptions': return <SubscriptionsScreen />;
      case 'items': return <ItemsScreen />;
      case 'vouchers': return <VouchersScreen />;
      case 'statements': return <StatementsScreen />;
      case 'calendar': return <CalendarScreen />;
      case 'reports': return <ReportsScreen />;
      case 'settings': return <SettingsScreen onSignOut={signOut} />;
      case 'search': return <SearchScreen onOpen={setScreen} />;
      case 'activity': return <ActivityScreen />;
      default: return null;
    }
  }

  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="light" />
      <AppBar title={TITLES[screen]} onMenu={() => setDrawerOpen(true)} onSearch={() => setScreen('search')} />
      <View style={{ flex: 1 }}>{body()}</View>
      <Drawer
        open={drawerOpen}
        current={screen}
        onClose={() => setDrawerOpen(false)}
        onSelect={(k) => { setScreen(k); setDrawerOpen(false); }}
        onSignOut={signOut}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  app: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0 },
});
