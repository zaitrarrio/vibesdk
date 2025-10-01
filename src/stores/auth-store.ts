import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AuthSession, AuthUser } from '@/api-types';

// Token refresh interval - refresh every 10 minutes
const TOKEN_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour (check less frequently since tokens last 24h)

interface AuthState {
  // State
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
  
  // Computed state
  isAuthenticated: boolean;
  
  // Actions
  login: (provider: 'google' | 'github', redirectUrl?: string) => void;
  loginWithEmail: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { email: string; password: string; name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  setIntendedUrl: (url: string) => void;
  getIntendedUrl: () => string | null;
  clearIntendedUrl: () => void;
  
  // Internal actions
  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
  setSession: (session: AuthSession | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAuthProviders: (providers: { google: boolean; github: boolean; email: boolean }) => void;
  setHasOAuth: (hasOAuth: boolean) => void;
  setRequiresEmailAuth: (requires: boolean) => void;
  
  // Initialize auth state
  initialize: () => Promise<void>;
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

export const useAuthStore = create<AuthState>()(
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
    
    // Computed state
    get isAuthenticated() {
      return !!get().user;
    },
    
    // Actions
    login: (provider: 'google' | 'github', redirectUrl?: string) => {
      // Store intended redirect URL if provided, otherwise use current location
      const intendedUrl = redirectUrl || window.location.pathname + window.location.search;
      setIntendedUrl(intendedUrl);
      
      // Build OAuth URL with redirect parameter
      const oauthUrl = new URL(`/api/auth/oauth/${provider}`, window.location.origin);
      oauthUrl.searchParams.set('redirect_url', intendedUrl);
      
      // Redirect to OAuth provider
      window.location.href = oauthUrl.toString();
    },
    
    loginWithEmail: async (credentials: { email: string; password: string }) => {
      const { setError, setIsLoading, setUser, setToken, setSession } = get();
      
      setError(null);
      setIsLoading(true);

      try {
        const response = await apiClient.loginWithEmail(credentials);

        if (response.success && response.data) {
          setUser({ ...response.data.user, isAnonymous: false } as AuthUser);
          setToken(null); // Using cookies for authentication
          setSession({
            userId: response.data.user.id,
            email: response.data.user.email,
            sessionId: response.data.sessionId,
            expiresAt: response.data.expiresAt,
          });
          setupTokenRefresh();
        }
      } catch (error) {
        console.error('Login error:', error);
        if (error instanceof ApiError) {
          setError(error.message);
        } else {
          setError('Connection error. Please try again.');
        }
        throw error; // Re-throw to inform caller
      } finally {
        setIsLoading(false);
      }
    },
    
    register: async (data: { email: string; password: string; name?: string }) => {
      const { setError, setIsLoading, setUser, setToken, setSession } = get();
      
      setError(null);
      setIsLoading(true);

      try {
        const response = await apiClient.register(data);

        if (response.success && response.data) {
          setUser({ ...response.data.user, isAnonymous: false } as AuthUser);
          setToken(null); // Using cookies for authentication
          setSession({
            userId: response.data.user.id,
            email: response.data.user.email,
            sessionId: response.data.sessionId,
            expiresAt: response.data.expiresAt,
          });
          setupTokenRefresh();
        }
      } catch (error) {
        console.error('Registration error:', error);
        if (error instanceof ApiError) {
          setError(error.message);
        } else {
          setError('Connection error. Please try again.');
        }
        throw error; // Re-throw to inform caller
      } finally {
        setIsLoading(false);
      }
    },
    
    logout: async () => {
      const { setUser, setToken, setSession } = get();
      
      try {
        await apiClient.logout();
      } catch (error) {
        console.error('Logout error:', error);
      } finally {
        // Clear state regardless of API response
        setUser(null);
        setToken(null);
        setSession(null);
        if (refreshTimer) {
          clearInterval(refreshTimer);
          refreshTimer = null;
        }
      }
    },
    
    refreshUser: async () => {
      await get().initialize();
    },
    
    clearError: () => {
      set({ error: null });
    },
    
    setIntendedUrl,
    getIntendedUrl,
    clearIntendedUrl,
    
    // Internal actions
    setUser: (user) => set({ user }),
    setToken: (token) => set({ token }),
    setSession: (session) => set({ session }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    setAuthProviders: (authProviders) => set({ authProviders }),
    setHasOAuth: (hasOAuth) => set({ hasOAuth }),
    setRequiresEmailAuth: (requiresEmailAuth) => set({ requiresEmailAuth }),
    
    // Initialize auth state
    initialize: async () => {
      const { setUser, setToken, setSession, setIsLoading, setAuthProviders, setHasOAuth, setRequiresEmailAuth } = get();
      
      try {
        // Fetch auth providers configuration
        try {
          const response = await apiClient.getAuthProviders();
          if (response.success && response.data) {
            setAuthProviders(response.data.providers);
            setHasOAuth(response.data.hasOAuth);
            setRequiresEmailAuth(response.data.requiresEmailAuth);
          }
        } catch (error) {
          console.warn('Failed to fetch auth providers:', error);
          // Fallback to defaults
          setAuthProviders({ google: false, github: false, email: true });
          setHasOAuth(false);
          setRequiresEmailAuth(true);
        }

        // Check authentication status
        try {
          const response = await apiClient.getProfile(true);
          
          if (response.success && response.data?.user) {
            setUser({ ...response.data.user, isAnonymous: false } as AuthUser);
            setToken(null); // Profile endpoint doesn't return token, cookies are used
            setSession({
              userId: response.data.user.id,
              email: response.data.user.email,
              sessionId: response.data.sessionId || response.data.user.id,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiry
            });
            
            // Setup token refresh
            setupTokenRefresh();
          } else {
            setUser(null);
            setToken(null);
            setSession(null);
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          setUser(null);
          setToken(null);
          setSession(null);
        }
      } finally {
        setIsLoading(false);
      }
    },
  }))
);

// Initialize auth state on store creation
useAuthStore.getState().initialize();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
  });
}