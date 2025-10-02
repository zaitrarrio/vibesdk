import { BaseApiClient, ApiResponse } from './base-api-client';
import type {
  AppsListData,
  PublicAppsData,
  CreateAppData,
  UpdateAppVisibilityData,
  AppDeleteData,
  AppDetailsData,
  AppStarToggleData,
  UserAppsData,
  FavoriteToggleData,
} from '@/api-types';

export class AppsApiClient {
  constructor(private readonly client: BaseApiClient) {}

  /**
   * Get list of public apps
   */
  async getPublicApps(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
  }): Promise<ApiResponse<PublicAppsData>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.sort) queryParams.set('sort', params.sort);

    const endpoint = `/api/apps/public${queryParams.toString() ? `?${queryParams}` : ''}`;
    return this.client.get<PublicAppsData>(endpoint);
  }

  /**
   * Get user's apps
   */
  async getUserApps(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
  }): Promise<ApiResponse<UserAppsData>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.sort) queryParams.set('sort', params.sort);

    const endpoint = `/api/apps/user${queryParams.toString() ? `?${queryParams}` : ''}`;
    return this.client.get<UserAppsData>(endpoint);
  }

  /**
   * Get all apps (admin)
   */
  async getAllApps(params?: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
  }): Promise<ApiResponse<AppsListData>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.sort) queryParams.set('sort', params.sort);

    const endpoint = `/api/apps${queryParams.toString() ? `?${queryParams}` : ''}`;
    return this.client.get<AppsListData>(endpoint);
  }

  /**
   * Create a new app
   */
  async createApp(data: CreateAppData): Promise<ApiResponse<AppDetailsData>> {
    return this.client.post<AppDetailsData>('/api/apps', data);
  }

  /**
   * Get app details
   */
  async getAppDetails(appId: string): Promise<ApiResponse<AppDetailsData>> {
    return this.client.get<AppDetailsData>(`/api/apps/${appId}`);
  }

  /**
   * Update app visibility
   */
  async updateAppVisibility(appId: string, data: UpdateAppVisibilityData): Promise<ApiResponse<AppDetailsData>> {
    return this.client.patch<AppDetailsData>(`/api/apps/${appId}/visibility`, data);
  }

  /**
   * Delete an app
   */
  async deleteApp(appId: string): Promise<ApiResponse<AppDeleteData>> {
    return this.client.delete<AppDeleteData>(`/api/apps/${appId}`);
  }

  /**
   * Star/unstar an app
   */
  async toggleAppStar(appId: string): Promise<ApiResponse<AppStarToggleData>> {
    return this.client.post<AppStarToggleData>(`/api/apps/${appId}/star`);
  }

  /**
   * Toggle app as favorite
   */
  async toggleAppFavorite(appId: string): Promise<ApiResponse<FavoriteToggleData>> {
    return this.client.post<FavoriteToggleData>(`/api/apps/${appId}/favorite`);
  }

  /**
   * Get app preview URL
   */
  async getAppPreview(appId: string): Promise<ApiResponse<{ url: string }>> {
    return this.client.get<{ url: string }>(`/api/apps/${appId}/preview`);
  }

  /**
   * Deploy app to production
   */
  async deployApp(appId: string): Promise<ApiResponse<{ deploymentId: string; url: string }>> {
    return this.client.post<{ deploymentId: string; url: string }>(`/api/apps/${appId}/deploy`);
  }

  /**
   * Get app analytics
   */
  async getAppAnalytics(appId: string, params?: {
    startDate?: string;
    endDate?: string;
    metric?: string;
  }): Promise<ApiResponse<unknown>> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    if (params?.metric) queryParams.set('metric', params.metric);

    const endpoint = `/api/apps/${appId}/analytics${queryParams.toString() ? `?${queryParams}` : ''}`;
    return this.client.get(endpoint);
  }
}