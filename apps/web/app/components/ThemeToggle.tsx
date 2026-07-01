import { type KeyboardEvent, useRef } from 'react';
import { type ArtifactThemePreference, useArtifactTheme } from '../hooks/useArtifactTheme';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, resolvedTheme, setThemePreference } = useArtifactTheme();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = THEME_OPTIONS.findIndex((option) => option.value === preference);

  return (
    <div
      className={`theme-toggle theme-toggle--${preference} ${compact ? 'theme-toggle--compact' : ''}`}
      role="radiogroup"
      aria-label={`Theme preference. Current appearance: ${themePreferenceLabel(resolvedTheme)}`}
      data-resolved-theme={resolvedTheme}
      onKeyDown={(event) => handleThemeToggleKeyDown(event, activeIndex, optionRefs.current, setThemePreference)}
    >
      {THEME_OPTIONS.map((option, index) => {
        const selected = option.value === preference;
        return (
          <button
            key={option.value}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            type="button"
            className="theme-toggle__option"
            role="radio"
            aria-checked={selected}
            aria-label={`${option.label} theme`}
            title={`${option.label} theme`}
            tabIndex={selected ? 0 : -1}
            onClick={() => setThemePreference(option.value)}
          >
            <ThemeIcon icon={option.icon} />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: 'system' },
  { value: 'light', label: 'Light', icon: 'light' },
  { value: 'dark', label: 'Dark', icon: 'dark' },
] as const satisfies ReadonlyArray<{
  value: ArtifactThemePreference;
  label: string;
  icon: ThemeIconName;
}>;

type ThemeIconName = 'system' | 'light' | 'dark';

function handleThemeToggleKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  activeIndex: number,
  optionNodes: Array<HTMLButtonElement | null>,
  setThemePreference: (nextPreference: ArtifactThemePreference) => void,
) {
  const nextIndex = getNextThemeIndex(event.key, activeIndex);
  if (nextIndex === null) return;
  event.preventDefault();
  const nextOption = THEME_OPTIONS[nextIndex];
  setThemePreference(nextOption.value);
  window.requestAnimationFrame(() => optionNodes[nextIndex]?.focus());
}

function getNextThemeIndex(key: string, activeIndex: number) {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (activeIndex + 1) % THEME_OPTIONS.length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (activeIndex + THEME_OPTIONS.length - 1) % THEME_OPTIONS.length;
  if (key === 'Home') return 0;
  if (key === 'End') return THEME_OPTIONS.length - 1;
  return null;
}

function ThemeIcon({ icon }: { icon: ThemeIconName }) {
  if (icon === 'system') {
    return (
      <svg className="theme-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="11" rx="1.6" />
        <path d="M9 20h6" />
        <path d="M12 16v4" />
      </svg>
    );
  }
  if (icon === 'light') {
    return (
      <svg className="theme-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.8v2.4" />
        <path d="M12 18.8v2.4" />
        <path d="m4.6 4.6 1.7 1.7" />
        <path d="m17.7 17.7 1.7 1.7" />
        <path d="M2.8 12h2.4" />
        <path d="M18.8 12h2.4" />
        <path d="m4.6 19.4 1.7-1.7" />
        <path d="m17.7 6.3 1.7-1.7" />
      </svg>
    );
  }
  return (
    <svg className="theme-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 15.2a7.6 7.6 0 0 1-10.2-10.2 8.2 8.2 0 1 0 10.2 10.2Z" />
    </svg>
  );
}

function themePreferenceLabel(theme: ArtifactThemePreference) {
  if (theme === 'system') return 'System';
  return theme === 'light' ? 'Light' : 'Dark';
}
