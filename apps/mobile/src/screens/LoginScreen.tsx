import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { C, RADIUS } from '../theme';
import { Input, Spinner } from '../ui';
import { DEFAULT_API_BASE } from '../config';
import { login, type SessionUser } from '../api';
import { PharosMark } from '../PharosMark';

export function LoginScreen({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [server, setServer] = useState(DEFAULT_API_BASE);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const user = await login(server, username.trim(), password);
      onLogin(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
      <View style={s.inner}>
        <View style={{ alignItems: 'center', marginBottom: 10 }}><PharosMark size={48} /></View>
        <Text style={s.brand}>PHAROS</Text>
        <Text style={s.tagline}>One light over everything you run.</Text>

        <Text style={s.label}>SERVER</Text>
        <Input
          value={server}
          onChangeText={setServer}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.x.x:3000"
        />
        <Text style={s.label}>USERNAME</Text>
        <Input
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={s.label}>PASSWORD</Text>
        <Input
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          onSubmitEditing={submit}
        />

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable onPress={submit} disabled={busy || !username.trim() || !password} style={[s.btn, (busy || !username.trim() || !password) && s.btnDisabled]}>
          {busy ? <Spinner inline color={C.onAccent} /> : <Text style={s.btnText}>Sign in</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, justifyContent: 'center' },
  inner: { paddingHorizontal: 28 },
  brand: { color: C.text, fontSize: 34, fontWeight: '800', letterSpacing: 4, textAlign: 'center' },
  tagline: { color: C.dim, fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 32 },
  label: { color: C.faint, fontSize: 10, letterSpacing: 1.4, marginBottom: 6, marginTop: 14 },
  error: { color: C.red, fontSize: 13, marginTop: 14 },
  btn: { backgroundColor: C.accent, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: C.onAccent, fontSize: 15, fontWeight: '700' },
});
