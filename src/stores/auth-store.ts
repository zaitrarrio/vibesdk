import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AuthSession, AuthUser } from '@/api-types';

// Token refresh interval - refresh every 10 minutes
const TOKEN_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour (check less frequently since tokens last 24h)

// Pure state interface - no actions
interface AuthState {
  user: AuthUser | null;
  token: string | null;
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
  authProviders: {
    google: boolean;
    github: boolean;
    email: boolean;
  } | null;
  hasOAuth: boolean;
  requiresEmailAuth: boolean;
}

// Actions interface - separate from state
interface AuthActions {
  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  setSession: (session: AuthSession | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAuthProviders: (providers: { google: boolean; github: boolean; email: boolean }) => void;
  setHasOAuth: (hasOAuth: boolean) => void;
  setRequiresEmailAuth: (requires: boolean) => void;
  clearError: () => void;
}

// Redirect URL management
const INTENDED_URL_KEY = 'auth_intended_url';

const setIntendedUrl = (url: string) => {
  try {
    sessionStorage.setItem(INTENDED_URL_KEY, url);
  } catch (error) {
    console.warn('Failed to store intended URL:', error);
  }
};

const getIntendedUrl = (): string | null => {
  try {
    return sessionStorage.getItem(INTENDED_URL_KEY);
  } catch (error) {
    console.warn('Failed to retrieve intended URL:', error);
    return null;
  }
};

const clearIntendedUrl = () => {
  try {
    sessionStorage.removeItem(INTENDED_URL_KEY);
  } catch (error) {
    console.warn('Failed to clear intended URL:', error);
  }
};

let refreshTimer: NodeJS.Timeout | null = null;

const setupTokenRefresh = () => {
  // Clear any existing timer
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  // Set up session validation timer - less frequent since cookies handle refresh
  refreshTimer = setInterval(async () => {
    try {
      // Import here to avoid circular dependencies
      const { apiClient } = await import('@/lib/api-client');
      const response = await apiClient.getProfile(true);

      if (!response.success) {
        // Session invalid, user needs to login again
        useAuthStore.getState().setUser(null);
        useAuthStore.getState().setToken(null);
        useAuthStore.getState().setSession(null);
        if (refreshTimer) {
          clearInterval(refreshTimer);
          refreshTimer = null;
        }
      }
    } catch (error) {
      console.error('Session validation failed:', error);
    }
  }, TOKEN_REFRESH_INTERVAL);
};

// Pure Zustand store - only state and basic setters
export const useAuthStore = create<AuthState & AuthActions>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    user: null,
    token: null,
    session: null,
    isLoading: true,
    error: null,
    authProviders: null,
    hasOAuth: false,
    requiresEmailAuth: true,
    
    // Pure actions - only state updates
    setUser: (user) => set({ user }),
    setToken: (token) => set({ token }),
    setSession: (session) => set({ session }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setAuthProviders: (authProviders) => set({ authProviders }),
    setHasOAuth: (hasOAuth) => set({ hasOAuth }),
    setRequiresEmailAuth: (requiresEmailAuth) => set({ requiresEmailAuth }),
    clearError: () => set({ error: null }),
  }))
);

// Computed selectors
export const useAuthSelectors = () => {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const authProviders = useAuthStore((state) => state.authProviders);
  const hasOAuth = useAuthStore((state) => state.hasOAuth);
  const requiresEmailAuth = useAuthStore((state) => state.requiresEmailAuth);
  
  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    authProviders,
    hasOAuth,
    requiresEmailAuth,
  };
};

// Redirect URL helpers
export const useAuthRedirect = () => ({
  setIntendedUrl,
  getIntendedUrl,
  clearIntendedUrl,
});

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
  });
}