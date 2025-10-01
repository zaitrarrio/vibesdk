import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  applyTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  subscribeWithSelector((set, get) => ({
    theme: (() => {
      const savedTheme = localStorage.getItem('theme') as Theme;
      return savedTheme || 'system';
    })(),
    
    setTheme: (newTheme: Theme) => {
      set({ theme: newTheme });
      localStorage.setItem('theme', newTheme);
      get().applyTheme(newTheme);
    },
    
    applyTheme: (theme: Theme) => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');

      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(theme);
      }
    },
  }))
);

// Initialize theme on store creation
const initialTheme = useThemeStore.getState().theme;
useThemeStore.getState().applyTheme(initialTheme);

// Listen for system theme changes
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handleSystemThemeChange = () => {
    const currentTheme = useThemeStore.getState().theme;
    if (currentTheme === 'system') {
      useThemeStore.getState().applyTheme('system');
    }
  };

  mediaQuery.addEventListener('change', handleSystemThemeChange);
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    mediaQuery.removeEventListener('change', handleSystemThemeChange);
  });
}