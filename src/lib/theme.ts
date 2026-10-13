import { useEffect, useState } from 'react';
import { loadPrefs, savePrefs } from './device';
import type { Prefs } from './types';

const DARK_BG = '#121110';
const LIGHT_BG = '#f3f1ea';

export function applyTheme(theme: Prefs['theme']): boolean {
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? DARK_BG : LIGHT_BG);
  return dark;
}

export function applyMotionPreference(reduce: boolean): void {
  document.documentElement.dataset.motion = reduce ? 'reduce' : 'normal';
}

/** Read and write the device theme; used outside a room. */
export function useTheme() {
  const [theme, setThemeState] = useState<Prefs['theme']>(() => loadPrefs().theme);
  const [dark, setDark] = useState(() => applyTheme(theme));

  useEffect(() => {
    setDark(applyTheme(theme));
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setDark(applyTheme(theme));
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (next: Prefs['theme']) => {
    setThemeState(next);
    savePrefs({ ...loadPrefs(), theme: next });
  };

  return { theme, dark, setTheme };
}

/** Tint the whole page with the current session colour, as the original timer did. */
export function useModeBackground(mode: 'home' | 'work' | 'short' | 'long') {
  useEffect(() => {
    document.body.dataset.mode = mode;
  }, [mode]);
}

/** Follow a theme value that already lives somewhere else (the room prefs). */
export function useAppliedTheme(theme: Prefs['theme'], reduceMotion = false) {
  useEffect(() => {
    applyTheme(theme);
    applyMotionPreference(reduceMotion);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(theme);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme, reduceMotion]);
}
