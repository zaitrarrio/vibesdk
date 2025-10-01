import { useThemeSelectors } from '@/stores/theme-store';
import { useThemeActions } from '@/hooks/use-theme-actions';

export function useTheme() {
  const state = useThemeSelectors();
  const actions = useThemeActions();
  return { ...state, setTheme: actions.changeTheme };
}