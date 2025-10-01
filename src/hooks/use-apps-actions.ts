import { useCallback, useEffect } from 'react';
import { useAppsStore } from '@/stores/apps-store';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import { appEvents } from '@/lib/app-events';
import type { AppEvent, AppDeletedEvent, AppUpdatedEvent } from '@/lib/app-events';
import type { AppWithFavoriteStatus } from '@/api-types';

const RECENT_APPS_LIMIT = 10;

const computeRecentApps = (apps: AppWithFavoriteStatus[]) => {
  const sortedApps = [...apps].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
  
  return {
    recentApps: sortedApps.slice(0, RECENT_APPS_LIMIT),
    moreRecentAvailable: sortedApps.length > RECENT_APPS_LIMIT,
  };
};

export function useAppsActions() {
  const { 
    setAllApps, 
    setFavoriteApps, 
    setRecentApps, 
    setLoading, 
    setError, 
    clearError 
  } = useAppsStore();

  const fetchAllApps = useCallback(async () => {
    const user = useAuthStore.getState().user;
    
    if (!user) {
      setAllApps([]);
      setRecentApps([], false);
      setLoading({ allApps: false, favoriteApps: useAppsStore.getState().loading.favoriteApps });
      setError({ allApps: null, favoriteApps: useAppsStore.getState().error.favoriteApps });
      return;
    }

    try {
      setLoading({ ...useAppsStore.getState().loading, allApps: true });
      setError({ ...useAppsStore.getState().error, allApps: null });

      const response = await apiClient.getUserApps();
      
      if (response.success) {
        const apps = response.data?.apps || [];
        const { recentApps, moreRecentAvailable } = computeRecentApps(apps);
        
        setAllApps(apps);
        setRecentApps(recentApps, moreRecentAvailable);
        setLoading({ ...useAppsStore.getState().loading, allApps: false });
      } else {
        setLoading({ ...useAppsStore.getState().loading, allApps: false });
        setError({ ...useAppsStore.getState().error, allApps: response.error?.message || 'Failed to fetch apps' });
      }
    } catch (err) {
      console.error('Error fetching all apps:', err);
      const errorMessage = err instanceof ApiError 
        ? `${err.message} (${err.status})`
        : err instanceof Error ? err.message : 'Failed to fetch apps';
      
      setLoading({ ...useAppsStore.getState().loading, allApps: false });
      setError({ ...useAppsStore.getState().error, allApps: errorMessage });
    }
  }, [setAllApps, setRecentApps, setLoading, setError]);

  const fetchFavoriteApps = useCallback(async () => {
    const user = useAuthStore.getState().user;
    
    if (!user) {
      setFavoriteApps([]);
      setLoading({ allApps: useAppsStore.getState().loading.allApps, favoriteApps: false });
      setError({ allApps: useAppsStore.getState().error.allApps, favoriteApps: null });
      return;
    }

    try {
      setLoading({ ...useAppsStore.getState().loading, favoriteApps: true });
      setError({ ...useAppsStore.getState().error, favoriteApps: null });

      const response = await apiClient.getFavoriteApps();
      
      if (response.success) {
        setFavoriteApps(response.data?.apps || []);
        setLoading({ ...useAppsStore.getState().loading, favoriteApps: false });
      } else {
        setLoading({ ...useAppsStore.getState().loading, favoriteApps: false });
        setError({ ...useAppsStore.getState().error, favoriteApps: response.error?.message || 'Failed to fetch favorite apps' });
      }
    } catch (err) {
      console.error('Error fetching favorite apps:', err);
      const errorMessage = err instanceof ApiError
        ? `${err.message} (${err.status})`
        : err instanceof Error ? err.message : 'Failed to fetch favorite apps';
      
      setLoading({ ...useAppsStore.getState().loading, favoriteApps: false });
      setError({ ...useAppsStore.getState().error, favoriteApps: errorMessage });
    }
  }, [setFavoriteApps, setLoading, setError]);

  const fetchAll = useCallback(async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    // Execute both API calls in parallel
    await Promise.all([
      fetchAllApps(),
      fetchFavoriteApps(),
    ]);
  }, [fetchAllApps, fetchFavoriteApps]);

  const handleAppDeleted = useCallback((appId: string) => {
    const { allApps, favoriteApps } = useAppsStore.getState();
    
    const filteredAllApps = allApps.filter(app => app.id !== appId);
    const filteredFavoriteApps = favoriteApps.filter(app => app.id !== appId);
    const { recentApps, moreRecentAvailable } = computeRecentApps(filteredAllApps);
    
    setAllApps(filteredAllApps);
    setFavoriteApps(filteredFavoriteApps);
    setRecentApps(recentApps, moreRecentAvailable);
  }, [setAllApps, setFavoriteApps, setRecentApps]);

  const handleAppCreated = useCallback(() => {
    // Refetch all data when new app is created
    fetchAll();
  }, [fetchAll]);

  const handleAppUpdated = useCallback((appId: string, data: any) => {
    const { allApps, favoriteApps } = useAppsStore.getState();
    
    // Update all apps
    const updatedAllApps = allApps.map(app => 
      app.id === appId 
        ? { ...app, ...data, updatedAt: new Date() }
        : app
    );
    
    // Update favorite apps if present
    const updatedFavoriteApps = favoriteApps.map(app =>
      app.id === appId
        ? { ...app, ...data, updatedAt: new Date() }
        : app
    );
    
    // Recompute recent apps with updated data
    const { recentApps, moreRecentAvailable } = computeRecentApps(updatedAllApps);
    
    setAllApps(updatedAllApps);
    setFavoriteApps(updatedFavoriteApps);
    setRecentApps(recentApps, moreRecentAvailable);
  }, [setAllApps, setFavoriteApps, setRecentApps]);

  // Initialize event listeners
  useEffect(() => {
    const onDeleted = (event: AppEvent) => {
      if (event.type === 'app-deleted') {
        const deletedEvent = event as AppDeletedEvent;
        handleAppDeleted(deletedEvent.appId);
      }
    };
    
    const onCreated = () => {
      handleAppCreated();
    };
    
    const onUpdated = (event: AppEvent) => {
      if (event.type === 'app-updated') {
        const updatedEvent = event as AppUpdatedEvent;
        if (updatedEvent.data) {
          handleAppUpdated(updatedEvent.appId, updatedEvent.data);
        }
      }
    };

    const unsubscribeDeleted = appEvents.on('app-deleted', onDeleted);
    const unsubscribeCreated = appEvents.on('app-created', onCreated);
    const unsubscribeUpdated = appEvents.on('app-updated', onUpdated);

    return () => {
      unsubscribeDeleted();
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, [handleAppDeleted, handleAppCreated, handleAppUpdated]);

  // Auto-fetch when user changes
  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe(
      (state) => state.user,
      (user) => {
        if (user) {
          fetchAll();
        } else {
          // Clear apps when user is not authenticated
          useAppsStore.setState({
            allApps: [],
            favoriteApps: [],
            recentApps: [],
            loading: { allApps: false, favoriteApps: false },
            error: { allApps: null, favoriteApps: null },
            moreRecentAvailable: false,
          });
        }
      },
      { fireImmediately: true }
    );

    return unsubscribe;
  }, [fetchAll]);

  return {
    fetchAllApps,
    fetchFavoriteApps,
    fetchAll,
    handleAppDeleted,
    handleAppCreated,
    handleAppUpdated,
    clearError,
  };
}