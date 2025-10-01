import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppWithFavoriteStatus } from '@/api-types';

// Pure state interface
interface AppsState {
  allApps: AppWithFavoriteStatus[];
  favoriteApps: AppWithFavoriteStatus[];
  recentApps: AppWithFavoriteStatus[];
  loading: {
    allApps: boolean;
    favoriteApps: boolean;
  };
  error: {
    allApps: string | null;
    favoriteApps: string | null;
  };
  moreRecentAvailable: boolean;
}

// Actions interface
interface AppsActions {
  setAllApps: (apps: AppWithFavoriteStatus[]) => void;
  setFavoriteApps: (apps: AppWithFavoriteStatus[]) => void;
  setRecentApps: (apps: AppWithFavoriteStatus[], moreAvailable: boolean) => void;
  setLoading: (loading: { allApps: boolean; favoriteApps: boolean }) => void;
  setError: (error: { allApps: string | null; favoriteApps: string | null }) => void;
  setMoreRecentAvailable: (moreAvailable: boolean) => void;
  clearError: (type: 'allApps' | 'favoriteApps') => void;
}

// Pure Zustand store - only state and basic setters
export const useAppsStore = create<AppsState & AppsActions>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    allApps: [],
    favoriteApps: [],
    recentApps: [],
    loading: {
      allApps: true,
      favoriteApps: true,
    },
    error: {
      allApps: null,
      favoriteApps: null,
    },
    moreRecentAvailable: false,
    
    // Pure actions - only state updates
    setAllApps: (allApps) => set({ allApps }),
    setFavoriteApps: (favoriteApps) => set({ favoriteApps }),
    setRecentApps: (recentApps, moreRecentAvailable) => set({ recentApps, moreRecentAvailable }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setMoreRecentAvailable: (moreRecentAvailable) => set({ moreRecentAvailable }),
    clearError: (type) => set((state) => ({
      error: { ...state.error, [type]: null }
    })),
  }))
);

// Computed selectors
export const useAppsSelectors = () => {
  const allApps = useAppsStore((state) => state.allApps);
  const favoriteApps = useAppsStore((state) => state.favoriteApps);
  const recentApps = useAppsStore((state) => state.recentApps);
  const loading = useAppsStore((state) => state.loading);
  const error = useAppsStore((state) => state.error);
  const moreRecentAvailable = useAppsStore((state) => state.moreRecentAvailable);
  
  return {
    allApps,
    favoriteApps,
    recentApps,
    loading,
    error,
    moreRecentAvailable,
  };
};