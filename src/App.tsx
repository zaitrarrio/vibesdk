import { Outlet } from 'react-router';
import { AuthProvider } from './contexts/auth-context';
import { AuthModalProvider } from './components/auth/AuthModalProvider';
import { ThemeProvider } from './contexts/theme-context';
import { Toaster } from './components/ui/sonner';
import { AppLayout } from './components/layout/app-layout';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthModalProvider>
          <AppLayout>
            <Outlet />
          </AppLayout>
          <Toaster richColors position="top-right" />
        </AuthModalProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}