'use client';
import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}>({ theme: 'dark', setTheme: () => {}, toggle: () => {} });

export const useTheme = () => useContext(ThemeContext);

function apply(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = t;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as Theme | null) ?? 'dark';
    setThemeState(saved);
    apply(saved);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    apply(t);
    try {
      localStorage.setItem('theme', t);
    } catch {
      /* ignore */
    }
  }

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
