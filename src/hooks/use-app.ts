import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';

export function useApp(appId: string | undefined) {
  const { app, loading, error, fetchApp, setAppId } = useAppStore();
  
  // Update app ID when it changes
  useEffect(() => {
    setAppId(appId || null);
  }, [appId, setAppId]);
  
  return { app, loading, error, refetch: () => appId && fetchApp(appId) };
}
