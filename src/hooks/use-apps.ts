import { apiClient, ApiError } from '@/lib/api-client';
import type { AppWithFavoriteStatus } from '@/api-types';
import { useAuthGuard } from './useAuthGuard';
import { useAppsSelectors } from '@/stores/apps-store';
import { useAppsActions } from '@/hooks/use-apps-actions';

interface AppHookState<T> {
  apps: T[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}


export function useApps(): AppHookState<AppWithFavoriteStatus> {
  const { allApps, loading, error } = useAppsSelectors();
  const { fetchAllApps } = useAppsActions();
  
  return {
    apps: allApps,
    loading: loading.allApps,
    error: error.allApps,
    refetch: fetchAllApps,
  };
}

export function useRecentApps() {
  const { recentApps, moreRecentAvailable, loading, error } = useAppsSelectors();
  const { fetchAllApps } = useAppsActions();
  
  return { 
    apps: recentApps, 
    moreAvailable: moreRecentAvailable,
    loading: loading.allApps, 
    error: error.allApps, 
    refetch: fetchAllApps
  };
}

export function useFavoriteApps(): AppHookState<AppWithFavoriteStatus> {
  const { favoriteApps, loading, error } = useAppsSelectors();
  const { fetchFavoriteApps } = useAppsActions();
  
  return {
    apps: favoriteApps,
    loading: loading.favoriteApps,
    error: error.favoriteApps,
    refetch: fetchFavoriteApps,
  };
}


export async function toggleFavorite(appId: string): Promise<boolean> {
  try {
    const response = await apiClient.toggleFavorite(appId);
    if (response.success && response.data) {
      return response.data.isFavorite;
    }
    throw new Error(response.error?.message || 'Failed to toggle favorite');
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(`Failed to toggle favorite: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Hook for protected toggle favorite functionality
 */
export function useToggleFavorite() {
  const { requireAuth } = useAuthGuard();

  const protectedToggleFavorite = async (appId: string, actionContext = 'to favorite this app'): Promise<boolean | null> => {
    if (!requireAuth({ 
      requireFullAuth: true, 
      actionContext 
    })) {
      return null;
    }

    return await toggleFavorite(appId);
  };

  return { toggleFavorite: protectedToggleFavorite };
}