import { BaseApiClient, ApiClientConfig } from './base-api-client';
import { AppsApiClient } from './apps-api';
import { AuthApiClient } from './auth-api';

export class UnifiedApiClient {
  private readonly baseClient: BaseApiClient;
  public readonly apps: AppsApiClient;
  public readonly auth: AuthApiClient;

  constructor(config: ApiClientConfig) {
    this.baseClient = new BaseApiClient(config);
    this.apps = new AppsApiClient(this.baseClient);
    this.auth = new AuthApiClient(this.baseClient);
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.baseClient.setAuthToken(token);
  }

  /**
   * Remove authentication token
   */
  removeAuthToken(): void {
    this.baseClient.removeAuthToken();
  }

  /**
   * Set custom header
   */
  setHeader(key: string, value: string): void {
    this.baseClient.setHeader(key, value);
  }

  /**
   * Remove custom header
   */
  removeHeader(key: string): void {
    this.baseClient.removeHeader(key);
  }

  /**
   * Get base client for custom requests
   */
  getBaseClient(): BaseApiClient {
    return this.baseClient;
  }
}

// Default configuration
const defaultConfig: ApiClientConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
};

// Create default instance
export const apiClient = new UnifiedApiClient(defaultConfig);

// Export types
export type { ApiResponse, ApiRequestOptions } from './base-api-client';
export type { LoginRequest, RegisterRequest, PasswordChangeRequest } from './auth-api';