import { useAuthSelectors } from '@/stores/auth-store';
import { useAuthActions } from '@/hooks/use-auth-actions';
import { useNavigate } from 'react-router';
import { useEffect } from 'react';

export function useAuth() {
  const state = useAuthSelectors();
  const actions = useAuthActions();
  return { ...state, ...actions };
}

// Helper hook for protected routes
export function useRequireAuth(redirectTo = '/') {
  const { isAuthenticated, isLoading } = useAuthSelectors();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(redirectTo);
    }
  }, [isAuthenticated, isLoading, navigate, redirectTo]);

  return { isAuthenticated, isLoading };
}