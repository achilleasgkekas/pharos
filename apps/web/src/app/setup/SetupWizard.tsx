'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { User as UserIcon, Lock, Check, ArrowRight, Sparkles, SkipForward, Sun, Moon } from 'lucide-react';
import { createFirstAdmin, saveSetupBasics, saveSetupAi, finishWithoutAi } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PharosMark } from '@/components/PharosMark';
import { useTheme } from '@/components/ThemeProvider';
import { CURRENCIES } from '@/lib/money';

const STEPS = ['Account', 'Basics', 'AI', 'Done'];

const SELECT_CLS =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg text-sm text-[color:var(--color-text)] px-3 py-2 focus:outline-none focus:border-[color:var(--color-accent)]';

type Provider = 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom';
const PROVIDERS: { id: Provider; label: string; needsKey: boolean; modelHint: string }[] = [
  { id: 'ollama', label: 'Ollama (local, free)', needsKey: false, modelHint: 'qwen2.5vl:7b' },
  { id: 'anthropic', label: 'Anthropic (Claude)', needsKey: true, modelHint: 'claude-sonnet-4-6' },
  { id: 'openai', label: 'OpenAI', needsKey: true, modelHint: 'gpt-4o-mini' },
  { id: 'gemini', label: 'Google Gemini', needsKey: true, modelHint: 'gemini-2.0-flash' },
  { id: 'openrouter', label: 'OpenRouter', needsKey: true, modelHint: 'openai/gpt-4o-mini' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', needsKey: false, modelHint: 'model-name' },
];

export function SetupWizard() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  // Step 2 state
  const [currency, setCurrency] = useState('EUR');
  const [vat, setVat] = useState('24');

  // Step 3 state
  const [provider, setProvider] = useState<Provider>('ollama');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [host, setHost] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const meta = PROVIDERS.find((p) => p.id === provider)!;


  function submitAdmin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createFirstAdmin(fd);
      if (res.ok) setStep(2);
      else setError(res.error || 'Could not create the account.');
    });
  }

  function submitBasics() {
    setError('');
    start(async () => {
      await saveSetupBasics(currency, Number(vat));
      setStep(3);
    });
  }

  function submitAi() {
    setError('');
    const fd = new FormData();
    fd.set('provider', provider);
    if (provider === 'ollama') {
      fd.set('ollamaHost', host);
      fd.set('ollamaModel', model);
      fd.set('ollamaVisionModel', model);
    } else if (provider === 'anthropic') {
      fd.set('anthropicApiKey', apiKey);
      fd.set('anthropicModel', model || meta.modelHint);
    } else if (provider === 'openai') {
      fd.set('openaiApiKey', apiKey);
      fd.set('openaiModel', model || meta.modelHint);
    } else if (provider === 'gemini') {
      fd.set('geminiApiKey', apiKey);
      fd.set('geminiModel', model || meta.modelHint);
    } else if (provider === 'openrouter') {
      fd.set('openrouterApiKey', apiKey);
      fd.set('openrouterModel', model || meta.modelHint);
    } else if (provider === 'custom') {
      fd.set('customBaseUrl', baseUrl);
      fd.set('customApiKey', apiKey);
      fd.set('customModel', model);
    }
    start(async () => {
      await saveSetupAi(fd);
      setStep(4);
    });
  }

  function skipAi() {
    setError('');
    start(async () => {
      await finishWithoutAi();
      setStep(4);
    });
  }


  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <PharosMark size={44} className="text-[color:var(--color-accent)]" />
          <h1 className="mt-3 tracking-[0.18em] uppercase text-lg" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Welcome to Pharos
          </h1>
          <p className="text-xs text-[color:var(--color-text-faint)] mt-1">Let&apos;s get your hub set up.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold"
                  style={{
                    background: done || active ? 'var(--color-accent)' : 'var(--color-surface-2)',
                    color: done || active ? '#000' : 'var(--color-text-faint)',
                  }}
                >
                  {done ? <Check size={13} /> : n}
                </span>
                {i < STEPS.length - 1 && <span className="w-5 h-px bg-[color:var(--color-border)]" />}
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6">
          {/* Step 1 — account */}
          {step === 1 && (
            <form onSubmit={submitAdmin} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold mb-1">Create your admin account</h2>
              <Input name="username" autoFocus autoComplete="username" icon={<UserIcon size={15} />} placeholder="username" />
              <Input name="name" autoComplete="name" placeholder="Display name (optional)" />
              <Input name="password" type="password" autoComplete="new-password" icon={<Lock size={15} />} placeholder="Password (min 8 chars)" />
              <Input name="confirm" type="password" autoComplete="new-password" icon={<Lock size={15} />} placeholder="Confirm password" />
              {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}
              <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-2 justify-center">
                {pending ? 'Creating…' : 'Create account'} <ArrowRight size={16} />
              </Button>
            </form>
          )}

          {/* Step 2 — basics */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold">Basic preferences</h2>
              <div>
                <label className="text-xs font-medium text-[color:var(--color-text-dim)]">Currency</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${SELECT_CLS} mt-1`}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} · {c.symbol} · {c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[color:var(--color-text-dim)]">Default VAT / sales tax %</label>
                <Input value={vat} onChange={(e) => setVat(e.target.value)} type="number" min={0} max={100} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-[color:var(--color-text-dim)]">Theme</label>
                <div className="flex gap-2 mt-1">
                  <Button variant={theme === 'dark' ? 'primary' : 'secondary'} size="sm" onClick={() => setTheme('dark')}>
                    <Moon size={14} /> Dark
                  </Button>
                  <Button variant={theme === 'light' ? 'primary' : 'secondary'} size="sm" onClick={() => setTheme('light')}>
                    <Sun size={14} /> Light
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="ghost" size="md" onClick={() => setStep(3)} disabled={pending}>Skip</Button>
                <Button variant="primary" size="md" onClick={submitBasics} disabled={pending} className="flex-1 justify-center">
                  {pending ? 'Saving…' : 'Continue'} <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — AI (optional) */}
          {step === 3 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold flex items-center gap-1.5"><Sparkles size={15} className="text-[color:var(--color-accent)]" /> AI features (optional)</h2>
              <p className="text-xs text-[color:var(--color-text-dim)]">
                AI auto-reads receipts, bills, statements and more. You can skip this and turn it on later from Settings — the app works fully without it.
              </p>
              <div>
                <label className="text-xs font-medium text-[color:var(--color-text-dim)]">Provider</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className={`${SELECT_CLS} mt-1`}>
                  {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              {provider === 'ollama' && (
                <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Ollama URL (default http://localhost:11434)" />
              )}
              {provider === 'custom' && (
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Base URL (e.g. http://localhost:1234/v1)" />
              )}
              {meta.needsKey && (
                <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" icon={<Lock size={15} />} placeholder="API key" />
              )}
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={`Model (e.g. ${meta.modelHint})`} />
              {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}
              <div className="flex gap-2 mt-2">
                <Button variant="ghost" size="md" onClick={skipAi} disabled={pending}>
                  <SkipForward size={14} /> Without AI
                </Button>
                <Button variant="primary" size="md" onClick={submitAi} disabled={pending} className="flex-1 justify-center">
                  {pending ? 'Saving…' : 'Enable AI'} <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}


          {/* Step 4 — done */}
          {step === 4 && (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <span className="flex items-center justify-center h-12 w-12 rounded-full bg-[color:var(--color-accent)] text-black">
                <Check size={24} />
              </span>
              <h2 className="text-base font-semibold">You&apos;re all set</h2>
              <p className="text-xs text-[color:var(--color-text-dim)]">Your hub is ready. You can change anything later in Settings.</p>
              <Button variant="primary" size="lg" onClick={() => { router.replace('/'); router.refresh(); }} className="mt-2 justify-center w-full">
                Go to dashboard <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
