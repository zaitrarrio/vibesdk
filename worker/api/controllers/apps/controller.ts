import { AnalyticsService } from '../../../database/services/AnalyticsService';
import { AppService } from '../../../database/services/AppService';
import type { BatchAppStats, AppSortOption, SortOrder, TimePeriod, Visibility } from '../../../database/types';
import { formatRelativeTime } from '../../../utils/timeFormatter';
import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { 
    AppsListData,
    PublicAppsData,
    SingleAppData,
    FavoriteToggleData,
    UpdateAppVisibilityData,
    AppDeleteData
} from './types';
import { withCache } from '../../../services/cache/wrapper';
import { createLogger } from '../../../logger';

export class AppController extends BaseController {
    static logger = createLogger('AppController');

    // Get all apps for the current user
    static async getUserApps(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppsListData>>> {
        try {
            const user = context.user!;
            
            const appService = new AppService(env);
            const userApps = await appService.getUserAppsWithFavorites(user.id);

            const responseData: AppsListData = {
                apps: userApps // Already properly typed and formatted by DatabaseService
            };

            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching user apps:', error);
            return AppController.createErrorResponse<AppsListData>('Failed to fetch apps', 500);
        }
    }

    // Get recent apps (last 10)
    static async getRecentApps(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppsListData>>> {
        try {
            const user = context.user!;

            const appService = new AppService(env);
            const recentApps = await appService.getRecentAppsWithFavorites(user.id, 10);

            const responseData: AppsListData = {
                apps: recentApps // Already properly typed and formatted by DatabaseService
            };

            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching recent apps:', error);
            return AppController.createErrorResponse<AppsListData>('Failed to fetch recent apps', 500);
        }
    }

    // Get favorite apps - NO CACHE (user-specific, real-time)
    static async getFavoriteApps(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppsListData>>> {
        try {
            const user = context.user!;

            const appService = new AppService(env);
            const favoriteApps = await appService.getFavoriteAppsOnly(user.id);

            const responseData: AppsListData = {
                apps: favoriteApps // Already properly typed and formatted by DatabaseService
            };

            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching favorite apps:', error);
            return AppController.createErrorResponse<AppsListData>('Failed to fetch favorite apps', 500);
        }
    }


    // Toggle favorite status
    static async toggleFavorite(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<FavoriteToggleData>>> {
        try {
            const user = context.user!;

            const appService = new AppService(env);
            const appId = context.pathParams.id;
            if (!appId) {
                return AppController.createErrorResponse<FavoriteToggleData>('App ID is required', 400);
            }

            // Check if app exists (no ownership check needed - users can bookmark any app)
            const ownershipResult = await appService.checkAppOwnership(appId, user.id);
            
            if (!ownershipResult.exists) {
                return AppController.createErrorResponse<FavoriteToggleData>('App not found', 404);
            }

            const result = await appService.toggleAppFavorite(user.id, appId);
            const responseData: FavoriteToggleData = result;
                
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error toggling favorite:', error);
            return AppController.createErrorResponse<FavoriteToggleData>('Failed to toggle favorite', 500);
        }
    }

    // Get public apps feed (like a global board)
   static getPublicApps = withCache(
        async function(this: AppController, request: Request, env: Env, _ctx: ExecutionContext, _context: RouteContext): Promise<ControllerResponse<ApiResponse<PublicAppsData>>> {
        try {
            const url = new URL(request.url);
            
            // Pagination and filtering - handle both page and offset params
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
            const page = parseInt(url.searchParams.get('page') || '1');
            const offset = url.searchParams.get('offset') ? 
                parseInt(url.searchParams.get('offset') || '0') : 
                (page - 1) * limit;
            const sort = (url.searchParams.get('sort') || 'recent') as AppSortOption;
            const order = (url.searchParams.get('order') || 'desc') as SortOrder;
            const period = (url.searchParams.get('period') || 'all') as TimePeriod;
            const framework = url.searchParams.get('framework') || undefined;
            const search = url.searchParams.get('search') || undefined;
            
            const user = await AppController.getOptionalUser(request, env);
            const userId = user?.id;
            
            const appService = new AppService(env);
            const result = await appService.getPublicAppsEnhanced({
                limit,
                offset,
                sort,
                order,
                period,
                framework,
                search,
                userId
            });
            const { data: apps, pagination } = result;
            
            // Handle analytics sorting if needed
            let finalApps = apps; 
            let analyticsData: BatchAppStats = {};
            
            if (sort === 'popular' || sort === 'trending') {
                // For analytics-based sorting, we need to fetch analytics for ALL apps, sort, then paginate
                // First get all apps without pagination
                const allAppsResult = await appService.getPublicAppsEnhanced({
                    framework: framework,
                    search: search,
                    userId: userId,
                    limit: 1000, // Get more apps for proper sorting
                    offset: 0
                });
                
                const analyticsService = new AnalyticsService(env);
                const appIds = allAppsResult.data.map(app => app.id);
                analyticsData = await analyticsService.batchGetAppStats(appIds);
                
                // Add analytics data to all apps
                const appsWithAnalytics = allAppsResult.data.map(app => ({
                    ...app,
                    viewCount: analyticsData[app.id]?.viewCount || 0,
                    forkCount: analyticsData[app.id]?.forkCount || 0,
                    likeCount: analyticsData[app.id]?.likeCount || 0
                }));
                
                // Sort by analytics
                if (sort === 'popular') {
                    appsWithAnalytics.sort((a, b) => {
                        const aScore = (a.viewCount || 0) + (a.likeCount || 0) * 2 + (a.forkCount || 0) * 3;
                        const bScore = (b.viewCount || 0) + (b.likeCount || 0) * 2 + (b.forkCount || 0) * 3;
                        return bScore - aScore;
                    });
                } else if (sort === 'trending') {
                    appsWithAnalytics.sort((a, b) => {
                        const now = Date.now();
                        const aCreatedAt = a.createdAt ? new Date(a.createdAt).getTime() : now;
                        const bCreatedAt = b.createdAt ? new Date(b.createdAt).getTime() : now;
                        const aDays = Math.max(1, (now - aCreatedAt) / (1000 * 60 * 60 * 24));
                        const bDays = Math.max(1, (now - bCreatedAt) / (1000 * 60 * 60 * 24));
                        
                        const aScore = ((a.viewCount || 0) + (a.likeCount || 0) * 2 + (a.forkCount || 0) * 3) / Math.log10(aDays + 1);
                        const bScore = ((b.viewCount || 0) + (b.likeCount || 0) * 2 + (b.forkCount || 0) * 3) / Math.log10(bDays + 1);
                        
                        return bScore - aScore;
                    });
                }
                
                // Now apply pagination to sorted results
                finalApps = appsWithAnalytics.slice(offset, offset + limit);
                
                // Update pagination info to reflect correct total
                pagination.total = allAppsResult.pagination.total;
                pagination.hasMore = offset + limit < pagination.total;
            } else {
                // For non-analytics sorting, get analytics only for the current page
                const analyticsService = new AnalyticsService(env);
                const appIds = apps.map(app => app.id);
                analyticsData = await analyticsService.batchGetAppStats(appIds);
            }
            
            const responseData: PublicAppsData = {
                apps: finalApps.map(app => ({
                    ...app,
                    userName: app.userId ? app.userName : 'Anonymous User',
                    userAvatar: app.userId ? app.userAvatar : null,
                    updatedAtFormatted: formatRelativeTime(app.updatedAt),
                    viewCount: analyticsData[app.id]?.viewCount || 0,
                    forkCount: analyticsData[app.id]?.forkCount || 0,
                    likeCount: analyticsData[app.id]?.likeCount || 0
                })),
                pagination: {
                    total: pagination.total,
                    limit: pagination.limit,
                    offset: pagination.offset,
                    hasMore: pagination.hasMore
                }
            };
            
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            AppController.logger.error('Error fetching public apps:', error);
            return AppController.createErrorResponse<PublicAppsData>('Failed to fetch public apps', 500);
        }
    },
        { ttlSeconds: 45 * 60, tags: ['public-apps'] }
    );

    // Get single app
    static async getApp(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<SingleAppData>>> {
        try {
            const user = context.user!;

            const appId = context.pathParams.id;
            if (!appId) {
                return AppController.createErrorResponse<SingleAppData>('App ID is required', 400);
            }
            
            const appService = new AppService(env);
            const app = await appService.getSingleAppWithFavoriteStatus(appId, user.id);

            if (!app) {
                return AppController.createErrorResponse<SingleAppData>('App not found', 404);
            }

            const responseData: SingleAppData = { app };
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching app:', error);
            return AppController.createErrorResponse<SingleAppData>('Failed to fetch app', 500);
        }
    }

    // Update app visibility
    static async updateAppVisibility(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<UpdateAppVisibilityData>>> {
        try {
            const user = context.user!;

            const appId = context.pathParams.id;
            if (!appId) {
                return AppController.createErrorResponse<UpdateAppVisibilityData>('App ID is required', 400);
            }

            const bodyResult = await AppController.parseJsonBody(request);
            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<UpdateAppVisibilityData>>;
            }
            
            const visibility = (bodyResult.data as { visibility?: string })?.visibility;

            // Validate visibility value
            if (!visibility || !['private', 'public'].includes(visibility)) {
                return AppController.createErrorResponse<UpdateAppVisibilityData>('Visibility must be either "private" or "public"', 400);
            }

            const validVisibility = visibility as Visibility;
            
            const appService = new AppService(env);
            const result = await appService.updateAppVisibility(appId, user.id, validVisibility);

            if (!result.success) {
                const statusCode = result.error === 'App not found' ? 404 : 
                                 result.error?.includes('only change visibility of your own apps') ? 403 : 500;
                return AppController.createErrorResponse<UpdateAppVisibilityData>(result.error || 'Failed to update app visibility', statusCode);
            }

            const responseData: UpdateAppVisibilityData = { 
                app: {
                    ...result.app!,
                    visibility: result.app!.visibility
                },
                message: `App visibility updated to ${validVisibility}`
            };
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error updating app visibility:', error);
            return AppController.createErrorResponse<UpdateAppVisibilityData>('Failed to update app visibility', 500);
        }
    }

    // Delete app
    static async deleteApp(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppDeleteData>>> {
        try {
            const user = context.user!;

            const appId = context.pathParams.id;
            if (!appId) {
                return AppController.createErrorResponse<AppDeleteData>('App ID is required', 400);
            }
        
            const appService = new AppService(env);
            const result = await appService.deleteApp(appId, user.id);

            if (!result.success) {
                const statusCode = result.error === 'App not found' ? 404 : 
                                 result.error?.includes('only delete your own apps') ? 403 : 500;
                return AppController.createErrorResponse<AppDeleteData>(result.error || 'Failed to delete app', statusCode);
            }

            const responseData: AppDeleteData = {
                success: true,
                message: 'App deleted successfully'
            };
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error deleting app:', error);
            return AppController.createErrorResponse<AppDeleteData>('Failed to delete app', 500);
        }
    }
}