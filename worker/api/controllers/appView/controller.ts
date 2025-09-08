
import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { cloneAgent, getAgentStub } from '../../../agents';
import { AppService } from '../../../database/services/AppService';
import { 
    AppDetailsData, 
    AppStarToggleData, 
    ForkAppData, 
} from './types';
import { AgentSummary } from '../../../agents/core/types';

export class AppViewController extends BaseController {
    appService: AppService;

    constructor(env: Env) {
        super(env);
        this.appService = new AppService(this.db);
    }

    // Get single app details (public endpoint, auth optional for ownership check)
    async getAppDetails(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppDetailsData>>> {
        try {
            const appId = context.pathParams.id;
            if (!appId) {
                return this.createErrorResponse<AppDetailsData>('App ID is required', 400);
            }
            
            // Try to get user if authenticated (optional for public endpoint)
            const user = await this.getOptionalUser(request, env);
            const userId = user?.id;

            // Get app details with stats using app service
            const appResult = await this.appService.getAppDetailsEnhanced(appId, userId);

            if (!appResult) {
                return this.createErrorResponse<AppDetailsData>('App not found', 404);
            }

            // Check if user has permission to view
            if (appResult.visibility === 'private' && appResult.userId !== userId) {
                return this.createErrorResponse<AppDetailsData>('App not found', 404);
            }

            // Track view for all users (including owners and anonymous users)
            if (userId) {
                // Authenticated user view
                await this.appService.recordAppView(appId, userId);
            } else {
                // Anonymous user view - use a special anonymous identifier
                // This could be enhanced with session tracking or IP-based deduplication
                await this.appService.recordAppView(appId, 'anonymous-' + Date.now());
            }

            // Try to fetch current agent state to get latest generated code
            let agentSummary: AgentSummary | null = null;
            let previewUrl: string = '';
            
            try {
                const agentStub = await getAgentStub(env, appResult.id, true, this.logger);
                agentSummary = await agentStub.getSummary();

                previewUrl = await agentStub.getPreviewUrlCache();
            } catch (agentError) {
                // If agent doesn't exist or error occurred, fall back to database stored files
                this.logger.warn('Could not fetch agent state, using stored files:', agentError);
            }

            const responseData: AppDetailsData = {
                ...appResult, // Spread all EnhancedAppData fields including stats
                cloudflareUrl: appResult.deploymentUrl,
                previewUrl: previewUrl || appResult.deploymentUrl,
                user: {
                    id: appResult.userId!,
                    displayName: appResult.userName || 'Unknown',
                    avatarUrl: appResult.userAvatar
                },
                agentSummary,
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching app details:', error);
            return this.createErrorResponse<AppDetailsData>('Internal server error', 500);
        }
    }

    // Star/unstar an app
    async toggleAppStar(_request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppStarToggleData>>> {
        try {
            const user = context.user!;

            const appId = context.pathParams.id;
            if (!appId) {
                return this.createErrorResponse<AppStarToggleData>('App ID is required', 400);
            }

            // Check if app exists and toggle star using app service
            const app = await this.appService.getSingleAppWithFavoriteStatus(appId, user.id);
            if (!app) {
                return this.createErrorResponse<AppStarToggleData>('App not found', 404);
            }

            // Toggle star using app service
            const result = await this.appService.toggleAppStar(user.id, appId);
            
            const responseData: AppStarToggleData = result;
            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error toggling star:', error);
            return this.createErrorResponse<AppStarToggleData>('Internal server error', 500);
        }
    }

    // Fork an app
    async forkApp(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ForkAppData>>> {
        try {
            const user = context.user!;

            const appId = context.pathParams.id;
            if (!appId) {
                return this.createErrorResponse<ForkAppData>('App ID is required', 400);
            }

            // Get original app with permission checks using app service
            const { app: originalApp, canFork } = await this.appService.getAppForFork(appId, user.id);

            if (!originalApp) {
                return this.createErrorResponse<ForkAppData>('App not found', 404);
            }

            if (!canFork) {
                return this.createErrorResponse<ForkAppData>('App not found', 404);
            }

            // Duplicate agent state first
            try {
                const { newAgentId } = await cloneAgent(env, appId, this.logger);
                this.logger.info(`Successfully duplicated agent state from ${appId} to ${newAgentId}`);

                // Create forked app using app service
                const forkedApp = await this.appService.createForkedApp(originalApp, newAgentId, user.id);
                
                const responseData: ForkAppData = {
                    forkedAppId: forkedApp.id,
                    message: 'App forked successfully'
                };

                return this.createSuccessResponse(responseData);
            } catch (error) {
                this.logger.error('Failed to duplicate agent state:', error);
                return this.createErrorResponse<ForkAppData>('Failed to duplicate agent state', 500);
            }
        } catch (error) {
            this.logger.error('Error forking app:', error);
            return this.createErrorResponse<ForkAppData>('Internal server error', 500);
        }
    }
}