/**
 * Analytics Controller
 * Handles AI Gateway analytics API endpoints
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import { AiGatewayAnalyticsService } from '../../../services/analytics/AiGatewayAnalyticsService';

import { UserAnalyticsResponseData, AgentAnalyticsResponseData } from './types';
import { AnalyticsError } from '../../../services/analytics/types';

export class AnalyticsController extends BaseController {
    private analyticsService: AiGatewayAnalyticsService;
    
    constructor(env: Env) {
        super(env);
        this.analyticsService = new AiGatewayAnalyticsService(env);
    }
	/**
	 * Get analytics data for a specific user
	 * GET /api/user/:id/analytics
	 */
	async getUserAnalytics(
		request: Request,
		_env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<UserAnalyticsResponseData>>> {
		try {
			// Extract authenticated user from context
			const authUser = context.user!;

			// Extract route parameters
			const userId = context.pathParams.id;

			if (!userId) {
				return this.createErrorResponse<UserAnalyticsResponseData>(
					'User ID is required',
					400,
				);
			}

			// TODO: Add ownership verification - users should only see their own analytics
			// For now, allow authenticated users to query any user analytics
			// Later: if (authUser.id !== userId && !authUser.isAdmin) { return 403; }

			// Parse query parameters
			const url = new URL(request.url);
			const daysParam = url.searchParams.get('days');

			// If days is provided, validate it; otherwise use all-time (undefined)
			let days: number | undefined;
			if (daysParam) {
				days = parseInt(daysParam);
				if (isNaN(days) || days < 1 || days > 365) {
					return this.createErrorResponse<UserAnalyticsResponseData>(
						'Days must be between 1 and 365',
						400,
					);
				}
			}

			// Get analytics data
			const analyticsData = await this.analyticsService.getUserAnalytics(
				userId,
				days,
			);

			this.logger.info('User analytics retrieved successfully', {
				userId,
				days: days || 'all-time',
				requestCount: analyticsData.totalRequests,
				cost: analyticsData.totalCost,
				requestedBy: authUser.id,
			});

			return this.createSuccessResponse(analyticsData);
		} catch (error) {
			this.logger.error('Error fetching user analytics:', error);

			if (error instanceof AnalyticsError) {
				return this.createErrorResponse<UserAnalyticsResponseData>(
					error.message,
					error.statusCode,
				);
			}

			return this.createErrorResponse<UserAnalyticsResponseData>(
				'Failed to fetch user analytics',
				500,
			);
		}
	}

	/**
	 * Get analytics data for a specific agent/chat
	 * GET /api/agent/:id/analytics
	 */
	async getAgentAnalytics(
		request: Request,
		_env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<AgentAnalyticsResponseData>>> {
		try {
			// Extract authenticated user from context
			const authUser = context.user!;
			// Extract route parameters
			const agentId = context.pathParams.id;

			if (!agentId) {
				return this.createErrorResponse<AgentAnalyticsResponseData>(
					'Agent ID is required',
					400,
				);
			}

			// TODO: Add ownership verification - users should only see analytics for their own agents
			// This would require checking if the agent/chat belongs to the authenticated user
			// For now, allow authenticated users to query any agent analytics

			// Parse query parameters
			const url = new URL(request.url);
			const daysParam = url.searchParams.get('days');

			// If days is provided, validate it; otherwise use all-time (undefined)
			let days: number | undefined;
			if (daysParam) {
				days = parseInt(daysParam);
				if (isNaN(days) || days < 1 || days > 365) {
					return this.createErrorResponse<AgentAnalyticsResponseData>(
						'Days must be between 1 and 365',
						400,
					);
				}
			}

			// Get analytics data
			const analyticsData = await this.analyticsService.getChatAnalytics(
				agentId,
				days,
			);

			this.logger.info('Agent analytics retrieved successfully', {
				agentId,
				days: days || 'all-time',
				requestCount: analyticsData.totalRequests,
				cost: analyticsData.totalCost,
				requestedBy: authUser.id,
			});

			return this.createSuccessResponse(analyticsData);
		} catch (error) {
			this.logger.error('Error fetching agent analytics:', error);

			if (error instanceof AnalyticsError) {
				return this.createErrorResponse<AgentAnalyticsResponseData>(
					error.message,
					error.statusCode,
				);
			}

			return this.createErrorResponse<AgentAnalyticsResponseData>(
				'Failed to fetch agent analytics',
				500,
			);
		}
	}
}
