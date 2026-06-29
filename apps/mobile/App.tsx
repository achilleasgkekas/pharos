import { useEffect, useState } from 'react';
import { View, ActivityIndicator, SafeAreaView, Platform, StatusBar as RNStatusBar, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { C } from './src/theme';
import { loadSession, logout } from './src/api';
import { Header } from './src/ui';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen, type ScreenKey } from './src/screens/HomeScreen';
import { ShoppingScreen } from './src/screens/ShoppingScreen';
import { ReceiptsScreen } from './src/screens/ReceiptsScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { MoneyScreen } from './src/screens/MoneyScreen';
import { SubscriptionsScreen } from './src/screens/SubscriptionsScreen';
import { ItemsScreen } from './src/screens/ItemsScreen';

const TITLES: Record<Exclude<ScreenKey, 'home'>, string> = {
  shopping: 'Shopping list', receipts: 'Receipts', tasks: 'Tasks',
  expenses: 'Expenses', income: 'Income', subscriptions: 'Subscriptions', items: 'Inventory',
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [screen, setScreen] = useState<ScreenKey>('home');

  useEffect(() => { (async () => { setAuthed(await loadSession()); setReady(true); })(); }, []);

  if (!ready) {
    return <View style={s.splash}><StatusBar style="light" /><ActivityIndicator color={C.accent} /></View>;
  }
  if (!authed) {
    return <View style={{ flex: 1 }}><StatusBar style="light" /><LoginScreen onLogin={() => setAuthed(true)} /></View>;
  }

  async function signOut() { await logout(); setScreen('home'); setAuthed(false); }

  function body(k: Exclude<ScreenKey, 'home'>) {
    switch (k) {
      case 'shopping': return <ShoppingScreen />;
      case 'receipts': return <ReceiptsScreen />;
      case 'tasks': return <TasksScreen />;
      case 'expenses': return <MoneyScreen kind="expense" />;
      case 'income': return <MoneyScreen kind="income" />;
      case 'subscriptions': return <SubscriptionsScreen />;
      case 'items': return <ItemsScreen />;
    }
  }

  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="light" />
      {screen === 'home' ? (
        <HomeScreen onOpen={setScreen} onSignOut={signOut} />
      ) : (
        <>
          <Header title={TITLES[screen]} onBack={() => setScreen('home')} />
          <View style={{ flex: 1 }}>{body(screen)}</View>
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  app: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0 },
});
