// Unsaved form text that survives Android closing oda in the background (decision #100).
// The draft is written when the app goes to the background and removed when the form is left
// normally (unmount: Back, Cancel, or after a save), so only a form the system killed comes
// back. Drafts expire after 12 hours (src/restore/store.ts) and are removed on sign-out.
// Never used on password, code, sign-in, delete-account or M-Pesa details forms.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { restoreStore } from './native';

export interface DraftOptions<T> {
  /** What to keep: plain JSON (text, choices, uploaded photo keys), never a secret. */
  value: T;
  /** False keeps nothing (nothing typed or changed yet). */
  worthSaving: boolean;
  /** Puts a saved draft back into the form. */
  restore: (saved: T) => void;
  /** Wait until the form has its data, so the draft lands on top of it (default true). */
  ready?: boolean;
}

export interface Draft {
  /** A draft was put back: show "Unsaved changes restored" with Discard. */
  restored: boolean;
  /** Remove the draft (the caller resets the form). */
  discard: () => void;
}

/**
 * `formKey` names the form and, for an edit, the thing edited (`product.<id>`), so a draft
 * never lands on another product. `null` turns it off.
 */
export function useDraft<T>(formKey: string | null, options: DraftOptions<T>): Draft {
  const { value, worthSaving, restore, ready = true } = options;
  const [restored, setRestored] = useState(false);
  const latest = useRef({ value, worthSaving, restore });
  useEffect(() => {
    latest.current = { value, worthSaving, restore };
  });

  // The key the form has now: a draft read for another key is dropped. Not a cleanup flag:
  // React's StrictMode remounts once in development, and the read has to survive that.
  const currentKey = useRef(formKey);
  useEffect(() => {
    currentKey.current = formKey;
  }, [formKey]);

  useEffect(() => {
    if (!formKey || !ready) return;
    restoreStore.loadDraft<T>(formKey).then(
      (saved) => {
        if (saved == null || currentKey.current !== formKey) return;
        latest.current.restore(saved);
        setRestored(true);
      },
      () => {},
    );
  }, [formKey, ready]);

  useEffect(() => {
    if (!formKey) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      const { value: now, worthSaving: keep } = latest.current;
      const done = keep ? restoreStore.saveDraft(formKey, now) : restoreStore.deleteDraft(formKey);
      done.catch(() => {});
    });
    return () => {
      subscription.remove();
      // Left normally: nothing to bring back.
      restoreStore.deleteDraft(formKey).catch(() => {});
    };
  }, [formKey]);

  const discard = useCallback(() => {
    setRestored(false);
    if (formKey) restoreStore.deleteDraft(formKey).catch(() => {});
  }, [formKey]);

  return { restored, discard };
}
