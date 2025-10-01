import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

// Pure state interface
interface ThemeState {
  theme: Theme;
}

// Actions interface
interface ThemeActions {
  setTheme: (theme: Theme) => void;
}

// Pure Zustand store - only state and basic setters
export const useThemeStore = create<ThemeState & ThemeActions>()(
  subscribeWithSelector((set) => ({
    // Initial state
    theme: (() => {
      const savedTheme = localStorage.getItem('theme') as Theme;
      return savedTheme || 'system';
    })(),
    
    // Pure actions - only state updates
    setTheme: (theme) => set({ theme }),
  }))
);

// Computed selectors
export const useThemeSelectors = () => {
  const theme = useThemeStore((state) => state.theme);
  
  return {
    theme,
  };
};