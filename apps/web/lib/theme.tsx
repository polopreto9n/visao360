'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'corporate' | 'dark' | 'glass';

const THEME_CLASS: Record<Theme, string> = {
  corporate: '',
  dark: 'theme-dark',
  glass: 'theme-glass',
};

export const THEME_LABELS: Record<Theme, { name: string; desc: string; preview: string }> = {
  corporate: { name: 'Corporate Clean', desc: 'Branco elegante · Stripe / Notion', preview: '#F8FAFC' },
  dark:      { name: 'Dark Pro',        desc: 'Dark premium · Linear / Vercel',   preview: '#0A0F1E' },
  glass:     { name: 'Glass Premium',   desc: 'Glassmorphism · Apple / Arc',      preview: '#6366F1' },
};

interface ThemeCtx { theme: Theme; setTheme: (t: Theme) => void; }
const Ctx = createContext<ThemeCtx>({ theme: 'corporate', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('corporate');

  useEffect(() => {
    const saved = localStorage.getItem('v360-theme') as Theme | null;
    if (saved && saved in THEME_CLASS) applyTheme(saved);
  }, []);

  function applyTheme(t: Theme) {
    const root = document.documentElement;
    Object.values(THEME_CLASS).forEach((cls) => { if (cls) root.classList.remove(cls); });
    if (THEME_CLASS[t]) root.classList.add(THEME_CLASS[t]);
    localStorage.setItem('v360-theme', t);
    setThemeState(t);
  }

  return <Ctx.Provider value={{ theme, setTheme: applyTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() { return useContext(Ctx); }
