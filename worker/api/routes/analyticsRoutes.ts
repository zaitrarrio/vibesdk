/**
 * Setup routes for AI Gateway analytics endpoints
 */
import { AnalyticsController } from '../controllers/analytics/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';

/**
 * Setup analytics routes
 */
export function setupAnalyticsRoutes(env: Env, app: Hono<AppEnv>): void {
    const analyticsController = new AnalyticsController(env);

    // User analytics - requires authentication
    app.get(
        '/api/user/:id/analytics',
        routeAuthMiddleware(AuthConfig.authenticated),
        adaptController(analyticsController, analyticsController.getUserAnalytics)
    );

    // Agent/Chat analytics - requires authentication
    app.get(
        '/api/agent/:id/analytics',
        routeAuthMiddleware(AuthConfig.authenticated),
        adaptController(analyticsController, analyticsController.getAgentAnalytics)
    );
}