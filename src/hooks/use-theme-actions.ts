import { useCallback, useEffect } from 'react';
import { useThemeStore } from '@/stores/theme-store';

type Theme = 'light' | 'dark' | 'system';

export function useThemeActions() {
  const { setTheme } = useThemeStore();

  const applyTheme = useCallback((theme: Theme) => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, []);

  const changeTheme = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  }, [setTheme, applyTheme]);

  // Initialize theme on mount
  useEffect(() => {
    const currentTheme = useThemeStore.getState().theme;
    applyTheme(currentTheme);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleSystemThemeChange = () => {
      const currentTheme = useThemeStore.getState().theme;
      if (currentTheme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    
    // Cleanup
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [applyTheme]);

  // Subscribe to theme changes and apply them
  useEffect(() => {
    const unsubscribe = useThemeStore.subscribe(
      (state) => state.theme,
      (theme) => {
        applyTheme(theme);
      }
    );

    return unsubscribe;
  }, [applyTheme]);

  return {
    changeTheme,
    applyTheme,
  };
}