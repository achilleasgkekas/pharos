import type { Locale } from './i18n/config';

// Pure helpers behind the command bar's dictation button (see components/useSpeechInput.ts).
// The browser's Web Speech API does all the recognition work: no audio or transcript
// reaches the server until the user reviews the text and presses send themselves.

// The subset of the Web Speech API the command bar uses. Declared here because the DOM
// lib typings don't reliably ship it (Chrome and Safari expose it prefixed).
export type SpeechAlternativeLike = { transcript: string };
export type SpeechResultLike = { readonly isFinal: boolean; readonly length: number; [index: number]: SpeechAlternativeLike };
export type SpeechResultEventLike = { readonly resultIndex: number; readonly results: ArrayLike<SpeechResultLike> };
export type SpeechErrorEventLike = { readonly error: string };

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onerror: ((e: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * The browser's speech-recognition constructor, or null when dictation can't work here.
 * Firefox has no implementation, and every engine refuses the microphone outside a secure
 * context (a self-hosted instance opened over plain http on a LAN address), so in both
 * cases the mic button is simply not rendered instead of failing on the first press.
 */
export function getSpeechRecognition(scope: unknown): SpeechRecognitionCtor | null {
  if (!scope || typeof scope !== 'object') return null;
  const w = scope as { isSecureContext?: boolean; SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  if (w.isSecureContext === false) return null;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : null;
}

// Recognisers want a full BCP-47 tag; a bare "el" falls back to the browser's own language
// in some engines. Each UI locale maps to the region its speakers most commonly use.
const SPEECH_LANG: Record<Locale, string> = {
  en: 'en-US',
  el: 'el-GR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
};

export function speechLang(locale: Locale): string {
  return SPEECH_LANG[locale] ?? 'en-US';
}

/** Everything recognised so far in this session, final and interim, as one string. */
export function transcriptOf(results: ArrayLike<SpeechResultLike>): string {
  let text = '';
  for (let i = 0; i < results.length; i++) text += results[i]?.[0]?.transcript ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

/** Appends dictated text to whatever was already typed, with exactly one space between. */
export function appendTranscript(existing: string, spoken: string): string {
  const a = existing.trimEnd();
  const b = spoken.trim();
  if (!b) return existing;
  return a ? `${a} ${b}` : b;
}

export type SpeechErrorKey = 'bar.micDenied' | 'bar.micNoSpeech' | 'bar.micError';

/**
 * The message to show for a recognition error, or null when there is nothing to report.
 * `aborted` is our own stop (closing the bar, switching mode), not a failure.
 */
export function speechErrorKey(code: string): SpeechErrorKey | null {
  switch (code) {
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
    case 'audio-capture':
      return 'bar.micDenied';
    case 'no-speech':
      return 'bar.micNoSpeech';
    default:
      return 'bar.micError';
  }
}
