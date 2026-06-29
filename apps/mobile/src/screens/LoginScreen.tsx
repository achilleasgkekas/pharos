import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { C } from '../theme';
import { DEFAULT_API_BASE } from '../config';
import { login, type SessionUser } from '../api';

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
        <Text style={s.brand}>PHAROS</Text>
        <Text style={s.tagline}>One light over everything you run.</Text>

        <Text style={s.label}>SERVER</Text>
        <TextInput
          value={server}
          onChangeText={setServer}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.x.x:3000"
          placeholderTextColor={C.faint}
          style={s.input}
        />
        <Text style={s.label}>USERNAME</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={C.faint}
          style={s.input}
        />
        <Text style={s.label}>PASSWORD</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          onSubmitEditing={submit}
          placeholderTextColor={C.faint}
          style={s.input}
        />

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable onPress={submit} disabled={busy || !username.trim() || !password} style={[s.btn, (busy || !username.trim() || !password) && s.btnDisabled]}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Sign in</Text>}
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
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15,
  },
  error: { color: C.red, fontSize: 13, marginTop: 14 },
  btn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#000', fontSize: 15, fontWeight: '700' },
});
