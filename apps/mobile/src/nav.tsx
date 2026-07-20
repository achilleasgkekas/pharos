import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { C, scrim } from './theme';
import { PharosMark } from './PharosMark';
import type { ScreenKey } from './screens/HomeScreen';

const GROUPS: { title: string; items: { key: ScreenKey; label: string }[] }[] = [
  { title: 'Stuff', items: [{ key: 'shopping', label: 'Shopping list' }, { key: 'items', label: 'Inventory' }] },
  { title: 'Money', items: [{ key: 'receipts', label: 'Receipts' }, { key: 'expenses', label: 'Expenses' }, { key: 'income', label: 'Income' }, { key: 'subscriptions', label: 'Subscriptions' }, { key: 'bills', label: 'Bills' }, { key: 'vouchers', label: 'Vouchers' }, { key: 'statements', label: 'Statements' }] },
  { title: 'Plan', items: [{ key: 'tasks', label: 'Tasks' }, { key: 'calendar', label: 'Calendar' }, { key: 'reports', label: 'Reports' }] },
];

export function AppBar({
  title, onMenu, onSearch, onBell, unread = 0,
}: {
  title: string; onMenu: () => void; onSearch?: () => void; onBell?: () => void; unread?: number;
}) {
  return (
    <View style={s.bar}>
      <Pressable onPress={onMenu} hitSlop={12} style={s.menuBtn}><Text style={s.menu}>☰</Text></Pressable>
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      {onSearch && <Pressable onPress={onSearch} hitSlop={12} style={s.menuBtn}><Text style={s.searchIcon}>🔍</Text></Pressable>}
      {onBell && (
        <Pressable onPress={onBell} hitSlop={12} style={s.menuBtn}>
          <Text style={s.bellIcon}>🔔</Text>
          {unread > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </Pressable>
      )}
      <PharosMark size={20} />
    </View>
  );
}

export function Drawer({
  open, current, onSelect, onClose, onSignOut,
}: {
  open: boolean; current: ScreenKey; onSelect: (k: ScreenKey) => void; onClose: () => void; onSignOut: () => void;
}) {
  const Item = ({ k, label }: { k: ScreenKey; label: string }) => (
    <Pressable onPress={() => onSelect(k)} style={s.item}>
      <Text style={[s.itemText, current === k && s.itemActive]}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose}>
        <Pressable style={s.panel} onPress={() => {}}>
          <View style={s.brandRow}>
            <PharosMark size={26} />
            <Text style={s.brand}>PHAROS</Text>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <Item k="home" label="Home" />
            <Item k="search" label="🔍 Search" />
            <Item k="assistant" label="✦ AI assistant" />
            {GROUPS.map((g) => (
              <View key={g.title} style={{ marginTop: 14 }}>
                <Text style={s.group}>{g.title.toUpperCase()}</Text>
                {g.items.map((it) => <Item key={it.key} k={it.key} label={it.label} />)}
              </View>
            ))}
            <View style={{ marginTop: 14 }}>
              <Item k="activity" label="🗂 Activity" />
              <Item k="settings" label="Settings" />
            </View>
          </ScrollView>
          <Pressable onPress={onSignOut} style={s.signout}><Text style={s.signoutText}>Sign out</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 6 },
  menuBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center' },
  menu: { color: C.text, fontSize: 22, lineHeight: 24 },
  searchIcon: { fontSize: 16 },
  bellIcon: { fontSize: 16 },
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: C.text, fontSize: 10, fontWeight: '800', lineHeight: 12 },
  title: { flex: 1, color: C.text, fontSize: 19, fontWeight: '800' },
  scrim: { flex: 1, backgroundColor: scrim, flexDirection: 'row' },
  panel: { width: 270, maxWidth: '82%', backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border, paddingTop: 60, paddingHorizontal: 12, paddingBottom: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 16 },
  brand: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: 3 },
  group: { color: C.faint, fontSize: 10, letterSpacing: 1.4, paddingHorizontal: 10, marginBottom: 4 },
  item: { paddingVertical: 11, paddingHorizontal: 10, borderRadius: 10 },
  itemText: { color: C.dim, fontSize: 15, fontWeight: '600' },
  itemActive: { color: C.accent },
  signout: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14, marginTop: 8, paddingHorizontal: 10 },
  signoutText: { color: C.red, fontSize: 15, fontWeight: '600' },
});
