import { useEffect } from 'react';
import { useAppSelectors } from '@/stores/app-store';
import { useAppActions } from '@/hooks/use-app-actions';

export function useApp(appId: string | undefined) {
  const { app, loading, error } = useAppSelectors();
  const { fetchApp, changeAppId } = useAppActions();
  
  // Update app ID when it changes
  useEffect(() => {
    changeAppId(appId || null);
  }, [appId, changeAppId]);
  
  return { app, loading, error, refetch: () => appId && fetchApp(appId) };
}
