import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppDetailsData } from '@/api-types';

// Pure state interface
interface AppState {
  app: AppDetailsData | null;
  loading: boolean;
  error: string | null;
  currentAppId: string | null;
}

// Actions interface
interface AppActions {
  setApp: (app: AppDetailsData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAppId: (appId: string | null) => void;
  clearApp: () => void;
}

// Pure Zustand store - only state and basic setters
export const useAppStore = create<AppState & AppActions>()(
  subscribeWithSelector((set) => ({
    // Initial state
    app: null,
    loading: false,
    error: null,
    currentAppId: null,
    
    // Pure actions - only state updates
    setApp: (app) => set({ app }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setAppId: (currentAppId) => set({ currentAppId }),
    clearApp: () => set({ app: null, loading: false, error: null, currentAppId: null }),
  }))
);

// Computed selectors
export const useAppSelectors = () => {
  const app = useAppStore((state) => state.app);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const currentAppId = useAppStore((state) => state.currentAppId);
  
  return {
    app,
    loading,
    error,
    currentAppId,
  };
};