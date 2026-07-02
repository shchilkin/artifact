import { useCallback, useEffect, useState } from 'react';

export type ArtifactTheme = 'dark' | 'light';
export type ArtifactThemePreference = ArtifactTheme | 'system';

interface ArtifactThemeState {
  preference: ArtifactThemePreference;
  resolvedTheme: ArtifactTheme;
}

export const ARTIFACT_THEME_STORAGE_KEY = 'artifact-theme';

const THEME_CHANGE_EVENT = 'artifact-theme-change';
const DEFAULT_THEME_PREFERENCE: ArtifactThemePreference = 'system';

function normalizeThemePreference(value: string | null | undefined): ArtifactThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

function getSystemTheme(): ArtifactTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolveTheme(preference: ArtifactThemePreference): ArtifactTheme {
  return preference === 'system' ? getSystemTheme() : preference;
}

function getStoredThemePreference(): ArtifactThemePreference | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeThemePreference(window.localStorage.getItem(ARTIFACT_THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

function getDocumentThemePreference(): ArtifactThemePreference | null {
  if (typeof document === 'undefined') return null;
  return normalizeThemePreference(document.documentElement.dataset.themePreference);
}

function getCurrentPreference(): ArtifactThemePreference {
  return getDocumentThemePreference() ?? getStoredThemePreference() ?? DEFAULT_THEME_PREFERENCE;
}

function getCurrentThemeState(): ArtifactThemeState {
  const preference = getCurrentPreference();
  return { preference, resolvedTheme: resolveTheme(preference) };
}

function syncDocumentTheme(preference: ArtifactThemePreference, resolvedTheme = resolveTheme(preference)) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function applyArtifactThemePreference(preference: ArtifactThemePreference) {
  const resolvedTheme = resolveTheme(preference);
  syncDocumentTheme(preference, resolvedTheme);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ARTIFACT_THEME_STORAGE_KEY, preference);
  } catch {
    // Theme still applies for the active session when storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent<ArtifactThemeState>(THEME_CHANGE_EVENT, { detail: { preference, resolvedTheme } }),
  );
}

export function useArtifactTheme() {
  const [themeState, setThemeState] = useState<ArtifactThemeState>(getCurrentThemeState);

  useEffect(() => {
    const nextThemeState = getCurrentThemeState();
    syncDocumentTheme(nextThemeState.preference, nextThemeState.resolvedTheme);

    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<ArtifactThemeState>;
      const preference = normalizeThemePreference(customEvent.detail?.preference) ?? getCurrentPreference();
      setThemeState({ preference, resolvedTheme: resolveTheme(preference) });
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ARTIFACT_THEME_STORAGE_KEY) {
        const preference = normalizeThemePreference(event.newValue) ?? DEFAULT_THEME_PREFERENCE;
        const resolvedTheme = resolveTheme(preference);
        syncDocumentTheme(preference, resolvedTheme);
        setThemeState({ preference, resolvedTheme });
      }
    };
    const systemThemeMedia =
      typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
    const handleSystemThemeChange = () => {
      const preference = getCurrentPreference();
      if (preference !== 'system') return;
      const resolvedTheme = resolveTheme(preference);
      syncDocumentTheme(preference, resolvedTheme);
      setThemeState({ preference, resolvedTheme });
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener('storage', handleStorage);
    systemThemeMedia?.addEventListener('change', handleSystemThemeChange);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener('storage', handleStorage);
      systemThemeMedia?.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  const setThemePreference = useCallback((nextPreference: ArtifactThemePreference) => {
    const resolvedTheme = resolveTheme(nextPreference);
    setThemeState({ preference: nextPreference, resolvedTheme });
    applyArtifactThemePreference(nextPreference);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextPreference = nextThemePreference(themeState.preference);
    setThemePreference(nextPreference);
  }, [setThemePreference, themeState.preference]);

  return {
    isLight: themeState.resolvedTheme === 'light',
    preference: themeState.preference,
    resolvedTheme: themeState.resolvedTheme,
    setThemePreference,
    theme: themeState.resolvedTheme,
    toggleTheme,
  };
}

function nextThemePreference(preference: ArtifactThemePreference): ArtifactThemePreference {
  if (preference === 'system') return 'light';
  if (preference === 'light') return 'dark';
  return 'system';
}
