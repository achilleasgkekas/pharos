import { describe, expect, it } from 'vitest';
import { LOCALE_CODES } from './i18n/config';
import { en } from './i18n/locales/en';
import {
  appendTranscript,
  getSpeechRecognition,
  speechErrorKey,
  speechLang,
  transcriptOf,
  type SpeechResultLike,
} from './speechInput';

function result(transcript: string, isFinal = true): SpeechResultLike {
  return { isFinal, length: 1, 0: { transcript } };
}

describe('getSpeechRecognition', () => {
  class Rec {}

  it('prefers the unprefixed constructor', () => {
    class Webkit {}
    expect(getSpeechRecognition({ isSecureContext: true, SpeechRecognition: Rec, webkitSpeechRecognition: Webkit })).toBe(Rec);
  });

  it('falls back to the webkit-prefixed constructor (Chrome, Safari)', () => {
    expect(getSpeechRecognition({ isSecureContext: true, webkitSpeechRecognition: Rec })).toBe(Rec);
  });

  it('returns null when the API is missing (Firefox) so the button stays hidden', () => {
    expect(getSpeechRecognition({ isSecureContext: true })).toBeNull();
    expect(getSpeechRecognition({ isSecureContext: true, webkitSpeechRecognition: 'nope' })).toBeNull();
  });

  it('returns null outside a secure context, where the microphone is always refused', () => {
    expect(getSpeechRecognition({ isSecureContext: false, webkitSpeechRecognition: Rec })).toBeNull();
  });

  it('returns null without a window (SSR)', () => {
    expect(getSpeechRecognition(undefined)).toBeNull();
  });
});

describe('speechLang', () => {
  it('maps every UI locale to a region-qualified BCP-47 tag', () => {
    for (const code of LOCALE_CODES) expect(speechLang(code)).toMatch(new RegExp(`^${code}-[A-Z]{2}$`));
  });

  it('uses Greek for the Greek UI', () => {
    expect(speechLang('el')).toBe('el-GR');
  });
});

describe('transcriptOf', () => {
  it('joins final and interim segments and normalises whitespace', () => {
    expect(transcriptOf([result('πρόσθεσε έξοδο '), result(' ΔΕΗ 84 ευρώ', false)])).toBe('πρόσθεσε έξοδο ΔΕΗ 84 ευρώ');
  });

  it('is empty when nothing was recognised', () => {
    expect(transcriptOf([])).toBe('');
  });
});

describe('appendTranscript', () => {
  it('fills an empty box', () => {
    expect(appendTranscript('', 'add task buy milk')).toBe('add task buy milk');
  });

  it('continues typed text with a single space', () => {
    expect(appendTranscript('add task ', ' buy milk')).toBe('add task buy milk');
  });

  it('leaves the typed text untouched when nothing was heard', () => {
    expect(appendTranscript('add task ', '  ')).toBe('add task ');
  });
});

describe('speechErrorKey', () => {
  it('stays quiet for our own abort', () => {
    expect(speechErrorKey('aborted')).toBeNull();
  });

  it('explains a blocked or missing microphone', () => {
    expect(speechErrorKey('not-allowed')).toBe('bar.micDenied');
    expect(speechErrorKey('service-not-allowed')).toBe('bar.micDenied');
    expect(speechErrorKey('audio-capture')).toBe('bar.micDenied');
  });

  it('reports silence and falls back to a generic message', () => {
    expect(speechErrorKey('no-speech')).toBe('bar.micNoSpeech');
    expect(speechErrorKey('network')).toBe('bar.micError');
  });

  it('only returns keys the dictionaries define', () => {
    for (const code of ['not-allowed', 'no-speech', 'network']) {
      const key = speechErrorKey(code);
      expect(key && key in en).toBe(true);
    }
  });
});
