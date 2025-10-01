import { useThemeStore } from '@/stores/theme-store';

export function useTheme() {
  const { theme, setTheme } = useThemeStore();
  return { theme, setTheme };
}