import { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { C } from '../theme';
import { aiCommand, type AiTurn } from '../api';

type Msg = AiTurn & { actions?: { name: string; summary: string }[] };
const EXAMPLES = ['Add a task: call the plumber', 'Add expense ΔΕΗ 84€', "Show me this month's stats", 'Add Netflix subscription 15€ monthly'];

export function AssistantScreen() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput(''); setErr(null);
    const history: Msg[] = [...msgs, { role: 'user', content: t }];
    setMsgs(history);
    setBusy(true);
    try {
      const r = await aiCommand(history.map((m) => ({ role: m.role, content: m.content })));
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply || 'Done.', actions: r.actions }]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap} keyboardVerticalOffset={90}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.content} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {msgs.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Ask Pharos</Text>
            <Text style={s.emptySub}>Natural language, and it acts on your data.</Text>
            {EXAMPLES.map((ex) => (
              <Pressable key={ex} onPress={() => send(ex)} style={s.example}><Text style={s.exampleText}>{ex}</Text></Pressable>
            ))}
          </View>
        ) : msgs.map((m, i) => (
          <View key={i} style={[s.bubble, m.role === 'user' ? s.user : s.assistant]}>
            <Text style={m.role === 'user' ? s.userText : s.assistantText}>{m.content}</Text>
            {m.actions?.map((a, j) => <Text key={j} style={s.action}>✓ {a.summary || a.name}</Text>)}
          </View>
        ))}
        {busy && <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />}
        {err && <Text style={s.err}>{err}</Text>}
      </ScrollView>
      <View style={s.inputRow}>
        <TextInput value={input} onChangeText={setInput} onSubmitEditing={() => send()} placeholder="Ask or command…" placeholderTextColor={C.faint} style={s.input} editable={!busy} returnKeyType="send" />
        <Pressable onPress={() => send()} disabled={busy || !input.trim()} style={[s.send, (busy || !input.trim()) && s.dim]}><Text style={s.sendText}>↑</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16 },
  empty: { paddingTop: 24 },
  emptyTitle: { color: C.text, fontSize: 22, fontWeight: '800' },
  emptySub: { color: C.dim, fontSize: 14, marginTop: 4, marginBottom: 18 },
  example: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  exampleText: { color: C.text, fontSize: 14 },
  bubble: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: C.accent },
  assistant: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  userText: { color: '#000', fontSize: 15 },
  assistantText: { color: C.text, fontSize: 15 },
  action: { color: C.accent, fontSize: 12, marginTop: 6, fontWeight: '600' },
  err: { color: C.red, fontSize: 13, marginTop: 10 },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: C.text, fontSize: 15, maxHeight: 120 },
  send: { width: 46, height: 44, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#000', fontSize: 20, fontWeight: '800' },
  dim: { opacity: 0.4 },
});
