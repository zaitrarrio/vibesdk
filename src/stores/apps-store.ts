import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AppWithFavoriteStatus } from '@/api-types';
import { appEvents } from '@/lib/app-events';
import type { AppEvent, AppDeletedEvent, AppUpdatedEvent } from '@/lib/app-events';
import { useAuthStore } from './auth-store';

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
  
  // Actions
  fetchAllApps: () => Promise<void>;
  fetchFavoriteApps: () => Promise<void>;
  fetchAll: () => Promise<void>;
  refetchAllApps: () => Promise<void>;
  refetchFavoriteApps: () => Promise<void>;
  refetchAll: () => Promise<void>;
  
  // Internal actions
  setAllApps: (apps: AppWithFavoriteStatus[]) => void;
  setFavoriteApps: (apps: AppWithFavoriteStatus[]) => void;
  setRecentApps: (apps: AppWithFavoriteStatus[], moreAvailable: boolean) => void;
  setLoading: (loading: { allApps: boolean; favoriteApps: boolean }) => void;
  setError: (error: { allApps: string | null; favoriteApps: string | null }) => void;
  setMoreRecentAvailable: (moreAvailable: boolean) => void;
  
  // Event handlers
  handleAppDeleted: (appId: string) => void;
  handleAppCreated: () => void;
  handleAppUpdated: (appId: string, data: any) => void;
  
  // Initialize
  initialize: () => void;
}

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

export const useAppsStore = create<AppsState>()(
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
    
    // Actions
    fetchAllApps: async () => {
      const { setAllApps, setRecentApps, setLoading, setError } = get();
      const user = useAuthStore.getState().user;
      
      if (!user) {
        setAllApps([]);
        setRecentApps([], false);
        setLoading({ allApps: false, favoriteApps: get().loading.favoriteApps });
        setError({ allApps: null, favoriteApps: get().error.favoriteApps });
        return;
      }

      try {
        setLoading({ ...get().loading, allApps: true });
        setError({ ...get().error, allApps: null });

        const response = await apiClient.getUserApps();
        
        if (response.success) {
          const apps = response.data?.apps || [];
          const { recentApps, moreRecentAvailable } = computeRecentApps(apps);
          
          setAllApps(apps);
          setRecentApps(recentApps, moreRecentAvailable);
          setLoading({ ...get().loading, allApps: false });
        } else {
          setLoading({ ...get().loading, allApps: false });
          setError({ ...get().error, allApps: response.error?.message || 'Failed to fetch apps' });
        }
      } catch (err) {
        console.error('Error fetching all apps:', err);
        const errorMessage = err instanceof ApiError 
          ? `${err.message} (${err.status})`
          : err instanceof Error ? err.message : 'Failed to fetch apps';
        
        setLoading({ ...get().loading, allApps: false });
        setError({ ...get().error, allApps: errorMessage });
      }
    },
    
    fetchFavoriteApps: async () => {
      const { setFavoriteApps, setLoading, setError } = get();
      const user = useAuthStore.getState().user;
      
      if (!user) {
        setFavoriteApps([]);
        setLoading({ allApps: get().loading.allApps, favoriteApps: false });
        setError({ allApps: get().error.allApps, favoriteApps: null });
        return;
      }

      try {
        setLoading({ ...get().loading, favoriteApps: true });
        setError({ ...get().error, favoriteApps: null });

        const response = await apiClient.getFavoriteApps();
        
        if (response.success) {
          setFavoriteApps(response.data?.apps || []);
          setLoading({ ...get().loading, favoriteApps: false });
        } else {
          setLoading({ ...get().loading, favoriteApps: false });
          setError({ ...get().error, favoriteApps: response.error?.message || 'Failed to fetch favorite apps' });
        }
      } catch (err) {
        console.error('Error fetching favorite apps:', err);
        const errorMessage = err instanceof ApiError
          ? `${err.message} (${err.status})`
          : err instanceof Error ? err.message : 'Failed to fetch favorite apps';
        
        setLoading({ ...get().loading, favoriteApps: false });
        setError({ ...get().error, favoriteApps: errorMessage });
      }
    },
    
    fetchAll: async () => {
      const user = useAuthStore.getState().user;
      if (!user) return;
      
      // Execute both API calls in parallel
      await Promise.all([
        get().fetchAllApps(),
        get().fetchFavoriteApps(),
      ]);
    },
    
    refetchAllApps: async () => {
      await get().fetchAllApps();
    },
    
    refetchFavoriteApps: async () => {
      await get().fetchFavoriteApps();
    },
    
    refetchAll: async () => {
      await get().fetchAll();
    },
    
    // Internal actions
    setAllApps: (allApps) => set({ allApps }),
    setFavoriteApps: (favoriteApps) => set({ favoriteApps }),
    setRecentApps: (recentApps, moreRecentAvailable) => set({ recentApps, moreRecentAvailable }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setMoreRecentAvailable: (moreRecentAvailable) => set({ moreRecentAvailable }),
    
    // Event handlers
    handleAppDeleted: (appId: string) => {
      const { allApps, favoriteApps, setAllApps, setFavoriteApps, setRecentApps } = get();
      
      const filteredAllApps = allApps.filter(app => app.id !== appId);
      const filteredFavoriteApps = favoriteApps.filter(app => app.id !== appId);
      const { recentApps, moreRecentAvailable } = computeRecentApps(filteredAllApps);
      
      setAllApps(filteredAllApps);
      setFavoriteApps(filteredFavoriteApps);
      setRecentApps(recentApps, moreRecentAvailable);
    },
    
    handleAppCreated: () => {
      // Refetch all data when new app is created
      get().fetchAll();
    },
    
    handleAppUpdated: (appId: string, data: any) => {
      const { allApps, favoriteApps, setAllApps, setFavoriteApps, setRecentApps } = get();
      
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
    },
    
    // Initialize
    initialize: () => {
      // Initial data load
      get().fetchAll();
      
      // Event handlers for real-time updates
      const onDeleted = (event: AppEvent) => {
        if (event.type === 'app-deleted') {
          const deletedEvent = event as AppDeletedEvent;
          get().handleAppDeleted(deletedEvent.appId);
        }
      };
      
      const onCreated = () => {
        get().handleAppCreated();
      };
      
      const onUpdated = (event: AppEvent) => {
        if (event.type === 'app-updated') {
          const updatedEvent = event as AppUpdatedEvent;
          if (updatedEvent.data) {
            get().handleAppUpdated(updatedEvent.appId, updatedEvent.data);
          }
        }
      };

      const unsubscribeDeleted = appEvents.on('app-deleted', onDeleted);
      const unsubscribeCreated = appEvents.on('app-created', onCreated);
      const unsubscribeUpdated = appEvents.on('app-updated', onUpdated);

      // Cleanup function will be called when the store is destroyed
      return () => {
        unsubscribeDeleted();
        unsubscribeCreated();
        unsubscribeUpdated();
      };
    },
  }))
);

// Initialize apps store when user authentication state changes
let unsubscribeAuth: (() => void) | null = null;

const initializeAppsStore = () => {
  // Clean up previous subscription
  if (unsubscribeAuth) {
    unsubscribeAuth();
  }
  
  // Subscribe to auth state changes
  unsubscribeAuth = useAuthStore.subscribe(
    (state) => state.user,
    (user) => {
      if (user) {
        // Initialize apps store when user is authenticated
        useAppsStore.getState().initialize();
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
};

// Initialize when the store is created
initializeAppsStore();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (unsubscribeAuth) {
      unsubscribeAuth();
    }
  });
}