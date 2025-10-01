import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { AuthModalProvider } from './components/auth/AuthModalProvider';
import { Toaster } from './components/ui/sonner';
import { AppLayout } from './components/layout/app-layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuthActions } from './hooks/use-auth-actions';

export default function App() {
  const { initialize } = useAuthActions();
  
  // Initialize auth state on app startup
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <ErrorBoundary>
      <AuthModalProvider>
        <AppLayout>
          <Outlet />
        </AppLayout>
        <Toaster richColors position="top-right" />
      </AuthModalProvider>
    </ErrorBoundary>
  );
}