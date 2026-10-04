// The onboarding state the step screens render from. Every step's call answers with the full
// state (decision #51); it is kept here so the next screen opens without loading again.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { ApiError } from '@/api';
import { errorMessage } from './labels';
import { onboardingApi, type OnboardingState } from './api';

let current: OnboardingState | null = null;
const listeners = new Set<(state: OnboardingState | null) => void>();

export function setOnboardingState(state: OnboardingState | null) {
  current = state;
  for (const listener of listeners) listener(state);
}

/** Forget it on sign-out, so another account never sees this one's answers. */
export function clearOnboardingState() {
  setOnboardingState(null);
}

export function useOnboarding() {
  const [state, setState] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    if (current && attempt === 0) return;
    let cancelled = false;
    onboardingApi.get().then(({ data, error: failed }) => {
      if (cancelled) return;
      if (data) setOnboardingState(data);
      else setError(errorMessage(failed));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    // Finished already (e.g. on another phone): writes would be refused, so leave.
    if (state?.done) router.replace('/start');
  }, [state?.done]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);
  return { state, error, retry };
}

/** Runs a step's call: busy while it runs, the new state kept, the error as a sentence. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = useCallback(
    async (
      call: () => Promise<{ data: OnboardingState | null; error: ApiError | null }>,
    ): Promise<OnboardingState | null> => {
      setBusy(true);
      setError(null);
      setFields({});
      const { data, error: failed } = await call();
      setBusy(false);
      if (data) {
        setOnboardingState(data);
        return data;
      }
      setError(errorMessage(failed));
      setFields(failed?.fields ?? {});
      return null;
    },
    [],
  );

  return { busy, error, fields, submit, setError };
}
