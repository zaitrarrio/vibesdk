import { useAuthStore } from '@/stores/auth-store';
import { useNavigate } from 'react-router';
import { useEffect } from 'react';

export function useAuth() {
  const store = useAuthStore();
  return store;
}

// Helper hook for protected routes
export function useRequireAuth(redirectTo = '/') {
  const { isAuthenticated, isLoading } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(redirectTo);
    }
  }, [isAuthenticated, isLoading, navigate, redirectTo]);

  return { isAuthenticated, isLoading };
}