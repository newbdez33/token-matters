import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('theme') as Theme) ?? 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme: Theme) => {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
    set({ theme });
  },
}));

// Apply theme on load
if (typeof window !== 'undefined') {
  applyTheme(getInitialTheme());

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = useThemeStore.getState().theme;
    if (current === 'system') applyTheme('system');
  });
}
