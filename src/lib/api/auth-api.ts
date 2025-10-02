import { BaseApiClient, ApiResponse } from './base-api-client';
import type {
  LoginResponseData,
  RegisterResponseData,
  ActiveSessionsData,
} from '@/api-types';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export class AuthApiClient {
  constructor(private readonly client: BaseApiClient) {}

  /**
   * Login user
   */
  async login(data: LoginRequest): Promise<ApiResponse<LoginResponseData>> {
    return this.client.post<LoginResponseData>('/api/auth/login', data);
  }

  /**
   * Register new user
   */
  async register(data: RegisterRequest): Promise<ApiResponse<RegisterResponseData>> {
    return this.client.post<RegisterResponseData>('/api/auth/register', data);
  }

  /**
   * Logout user
   */
  async logout(): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.post<{ success: boolean }>('/api/auth/logout');
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<ApiResponse<{ token: string; expiresAt: number }>> {
    return this.client.post<{ token: string; expiresAt: number }>('/api/auth/refresh');
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<ApiResponse<{ user: unknown }>> {
    return this.client.get<{ user: unknown }>('/api/auth/me');
  }

  /**
   * Update user profile
   */
  async updateProfile(data: { name?: string; email?: string }): Promise<ApiResponse<{ user: unknown }>> {
    return this.client.patch<{ user: unknown }>('/api/auth/profile', data);
  }

  /**
   * Change password
   */
  async changePassword(data: PasswordChangeRequest): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.post<{ success: boolean }>('/api/auth/change-password', data);
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(): Promise<ApiResponse<ActiveSessionsData>> {
    return this.client.get<ActiveSessionsData>('/api/auth/sessions');
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.delete<{ success: boolean }>(`/api/auth/sessions/${sessionId}`);
  }

  /**
   * Revoke all sessions
   */
  async revokeAllSessions(): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.delete<{ success: boolean }>('/api/auth/sessions');
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.post<{ success: boolean }>('/api/auth/forgot-password', { email });
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.post<{ success: boolean }>('/api/auth/reset-password', {
      token,
      newPassword,
    });
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.post<{ success: boolean }>('/api/auth/verify-email', { token });
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.post<{ success: boolean }>('/api/auth/resend-verification');
  }

  /**
   * Delete user account
   */
  async deleteAccount(password: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.client.delete<{ success: boolean }>('/api/auth/account', {
      body: { password },
    });
  }
}