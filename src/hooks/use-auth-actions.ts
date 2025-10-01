import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/stores/auth-store';
import { useAuthRedirect } from '@/stores/auth-store';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AuthUser, AuthSession } from '@/api-types';

// Token refresh interval
const TOKEN_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

let refreshTimer: NodeJS.Timeout | null = null;

const setupTokenRefresh = () => {
  // Clear any existing timer
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

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

export function useAuthActions() {
  const navigate = useNavigate();
  const { setUser, setToken, setSession, setIsLoading, setError, setAuthProviders, setHasOAuth, setRequiresEmailAuth } = useAuthStore();
  const { setIntendedUrl, getIntendedUrl, clearIntendedUrl } = useAuthRedirect();

  const initialize = useCallback(async () => {
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
  }, [setUser, setToken, setSession, setIsLoading, setAuthProviders, setHasOAuth, setRequiresEmailAuth]);

  const login = useCallback((provider: 'google' | 'github', redirectUrl?: string) => {
    // Store intended redirect URL if provided, otherwise use current location
    const intendedUrl = redirectUrl || window.location.pathname + window.location.search;
    setIntendedUrl(intendedUrl);
    
    // Build OAuth URL with redirect parameter
    const oauthUrl = new URL(`/api/auth/oauth/${provider}`, window.location.origin);
    oauthUrl.searchParams.set('redirect_url', intendedUrl);
    
    // Redirect to OAuth provider
    window.location.href = oauthUrl.toString();
  }, [setIntendedUrl]);

  const loginWithEmail = useCallback(async (credentials: { email: string; password: string }) => {
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
        
        // Navigate to intended URL or default to home
        const intendedUrl = getIntendedUrl();
        clearIntendedUrl();
        navigate(intendedUrl || '/');
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
  }, [navigate, setUser, setToken, setSession, setIsLoading, setError, getIntendedUrl, clearIntendedUrl]);

  const register = useCallback(async (data: { email: string; password: string; name?: string }) => {
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
        
        // Navigate to intended URL or default to home
        const intendedUrl = getIntendedUrl();
        clearIntendedUrl();
        navigate(intendedUrl || '/');
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
  }, [navigate, setUser, setToken, setSession, setIsLoading, setError, getIntendedUrl, clearIntendedUrl]);

  const logout = useCallback(async () => {
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
      navigate('/');
    }
  }, [navigate, setUser, setToken, setSession]);

  const refreshUser = useCallback(async () => {
    await initialize();
  }, [initialize]);

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  return {
    initialize,
    login,
    loginWithEmail,
    register,
    logout,
    refreshUser,
    clearError,
    setIntendedUrl,
    getIntendedUrl,
    clearIntendedUrl,
  };
}