
import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import { UserStatsData, UserActivityData } from './types';
import { AnalyticsService } from '../../../database/services/AnalyticsService';

export class StatsController extends BaseController {
    private analyticsService: AnalyticsService;
    
    constructor(env: Env) {
        super(env);
        this.analyticsService = new AnalyticsService(this.db);
    }
    // Get user statistics
    async getUserStats(_request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<UserStatsData>>> {
        try {
            const user = context.user!;

            // Get comprehensive user statistics using analytics service
            const enhancedStats = await this.analyticsService.getEnhancedUserStats(user.id);

            // Use EnhancedUserStats directly as response data
            const responseData = enhancedStats;

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching user stats:', error);
            return this.createErrorResponse<UserStatsData>('Failed to fetch user statistics', 500);
        }
    }


    // Get user activity timeline
    async getUserActivity(_request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<UserActivityData>>> {
        try {
            const user = context.user!;

            // Get user activity timeline using analytics service
            const activities = await this.analyticsService.getUserActivityTimeline(user.id, 20);

            const responseData: UserActivityData = { activities };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching user activity:', error);
            return this.createErrorResponse<UserActivityData>('Failed to fetch user activity', 500);
        }
    }
}