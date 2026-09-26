'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Locale } from '@/lib/i18n/config';
import {
  appendTranscript,
  getSpeechRecognition,
  speechErrorKey,
  speechLang,
  transcriptOf,
  type SpeechErrorKey,
  type SpeechRecognitionLike,
} from '@/lib/speechInput';

// Speech support never changes during a page's life, so there is nothing to subscribe to.
const noSubscribe = () => () => {};
const isSupported = () => getSpeechRecognition(window) !== null;
const notSupported = () => false;

/**
 * Browser-native dictation for a text input. `start(base)` listens once (it stops by itself
 * after a pause) and streams `base + transcript` into `onText` as the user speaks, so the
 * words appear in the box live. It never submits: the user reviews and sends as usual.
 * `supported` is false during SSR and on browsers without the Web Speech API.
 */
export function useSpeechInput(locale: Locale, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<SpeechErrorKey | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  // Feature detection: false on the server and during hydration, the real answer after.
  const supported = useSyncExternalStore(noSubscribe, isSupported, notSupported);

  // Stop listening but keep what was heard: the engine delivers the last result, then ends.
  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  // Drop the session without delivering anything more (the text was sent or cleared).
  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.abort();
    setListening(false);
  }, []);

  const start = useCallback(
    (base: string) => {
      const Ctor = getSpeechRecognition(window);
      if (!Ctor || recRef.current) return;
      const rec = new Ctor();
      rec.lang = speechLang(locale);
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => onTextRef.current(appendTranscript(base, transcriptOf(e.results)));
      rec.onerror = (e) => setError(speechErrorKey(e.error));
      rec.onend = () => {
        // A cancelled session can end after a new one started; only the current one counts.
        if (recRef.current !== rec) return;
        recRef.current = null;
        setListening(false);
      };
      recRef.current = rec;
      setError(null);
      setListening(true);
      try {
        rec.start();
      } catch {
        // start() throws if the engine is still busy with a previous session.
        recRef.current = null;
        setListening(false);
        setError('bar.micError');
      }
    },
    [locale]
  );

  // Release the microphone if the component goes away mid-dictation.
  useEffect(
    () => () => {
      const rec = recRef.current;
      recRef.current = null;
      if (rec) {
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        rec.abort();
      }
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  return { supported, listening, error, start, stop, cancel, clearError };
}
