import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import React from 'react';
import { apiClient } from '@/lib/api-client';
import type { AppDetailsData } from '@/api-types';

interface AppState {
  app: AppDetailsData | null;
  loading: boolean;
  error: string | null;
  currentAppId: string | null;
  
  // Actions
  fetchApp: (appId: string) => Promise<void>;
  setAppId: (appId: string | null) => void;
  clearApp: () => void;
  
  // Internal actions
  setApp: (app: AppDetailsData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    app: null,
    loading: false,
    error: null,
    currentAppId: null,
    
    // Actions
    fetchApp: async (appId: string) => {
      const { setApp, setLoading, setError } = get();
      
      // Guard: if no valid appId or it's a new app, reset state and skip fetching
      if (!appId || appId === 'new') {
        setApp(null);
        setError(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await apiClient.getAppDetails(appId);
        setApp(response.data || null);
        setError(null);
      } catch (err) {
        console.error('Error fetching app:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch app');
        setApp(null);
      } finally {
        setLoading(false);
      }
    },
    
    setAppId: (appId: string | null) => {
      set({ currentAppId: appId });
      if (appId) {
        get().fetchApp(appId);
      } else {
        get().clearApp();
      }
    },
    
    clearApp: () => {
      set({ app: null, loading: false, error: null, currentAppId: null });
    },
    
    // Internal actions
    setApp: (app) => set({ app }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
  }))
);

// Hook to use the app store with a specific app ID
export const useApp = (appId: string | undefined) => {
  const { app, loading, error, fetchApp, setAppId } = useAppStore();
  
  // Update app ID when it changes
  React.useEffect(() => {
    setAppId(appId || null);
  }, [appId, setAppId]);
  
  return { app, loading, error, refetch: () => appId && fetchApp(appId) };
};