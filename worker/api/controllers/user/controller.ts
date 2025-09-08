
import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import { RouteContext } from '../../types/route-context';
import { UserService } from '../../../database/services/UserService';
import type { AppSortOption, SortOrder, TimePeriod, Visibility } from '../../../database/types';
import { 
    UserAppsData, 
    ProfileUpdateData, 
} from './types';

/**
 * User Management Controller for Orange
 * Handles user dashboard, profile management, and app history
 */
export class UserController extends BaseController {
    private userService: UserService;
    
    constructor(env: Env) {
        super(env);
        this.userService = new UserService(this.db);
    }

    /**
     * Get user's apps with pagination and filtering
     */
    async getApps(request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<UserAppsData>>> {
        try {
            const user = context.user!;

            const url = new URL(request.url);
            const page = parseInt(url.searchParams.get('page') || '1');
            const limit = parseInt(url.searchParams.get('limit') || '20');
            const status = url.searchParams.get('status') as 'generating' | 'completed' | undefined;
            const visibility = url.searchParams.get('visibility') as Visibility | undefined;
            const framework = url.searchParams.get('framework') || undefined;
            const search = url.searchParams.get('search') || undefined;
            const sort = (url.searchParams.get('sort') || 'recent') as AppSortOption;
            const order = (url.searchParams.get('order') || 'desc') as SortOrder;
            const period = (url.searchParams.get('period') || 'all') as TimePeriod;
            const offset = (page - 1) * limit;
            
            const queryOptions = {
                limit,
                offset,
                status,
                visibility,
                framework,
                search,
                sort,
                order,
                period
            };
            
            // Get user apps with analytics and proper total count
            const [apps, totalCount] = await Promise.all([
                this.userService.getUserAppsWithAnalytics(user.id, queryOptions),
                this.userService.getUserAppsCount(user.id, queryOptions)
            ]);

            const responseData: UserAppsData = {
                apps,
                pagination: {
                    limit,
                    offset,
                    total: totalCount,
                    hasMore: offset + limit < totalCount
                }
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting user apps:', error);
            return this.createErrorResponse<UserAppsData>('Failed to get user apps', 500);
        }
    }

    /**
     * Update user profile
     */
    async updateProfile(request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ProfileUpdateData>>> {
        try {
            const user = context.user!;

            const bodyResult = await this.parseJsonBody<{
                username?: string;
                displayName?: string;
                bio?: string;
                theme?: 'light' | 'dark' | 'system';
            }>(request);

            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<ProfileUpdateData>>;
            }

            const result = await this.userService.updateUserProfileWithValidation(user.id, bodyResult.data!);

            if (!result.success) {
                return this.createErrorResponse<ProfileUpdateData>(result.message, 400);
            }

            const responseData: ProfileUpdateData = result;
            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error updating user profile:', error);
            return this.createErrorResponse<ProfileUpdateData>('Failed to update profile', 500);
        }
    }
}