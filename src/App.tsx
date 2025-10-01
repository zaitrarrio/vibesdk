import { Outlet } from 'react-router';
import { AuthModalProvider } from './components/auth/AuthModalProvider';
import { Toaster } from './components/ui/sonner';
import { AppLayout } from './components/layout/app-layout';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
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