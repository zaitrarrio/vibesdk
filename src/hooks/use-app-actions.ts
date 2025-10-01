import { useCallback, useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';
import { apiClient } from '@/lib/api-client';
import type { AppDetailsData } from '@/api-types';

export function useAppActions() {
  const { setApp, setLoading, setError, setAppId, clearApp } = useAppStore();

  const fetchApp = useCallback(async (appId: string) => {
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
  }, [setApp, setLoading, setError]);

  const changeAppId = useCallback((appId: string | null) => {
    setAppId(appId);
    if (appId) {
      fetchApp(appId);
    } else {
      clearApp();
    }
  }, [setAppId, fetchApp, clearApp]);

  return {
    fetchApp,
    changeAppId,
    clearApp,
  };
}