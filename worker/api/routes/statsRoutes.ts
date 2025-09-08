import { StatsController } from '../controllers/stats/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';

/**
 * Setup user statistics routes
 */
export function setupStatsRoutes(env: Env, app: Hono<AppEnv>): void {
    const statsController = new StatsController(env);

    // User statistics
    app.get('/api/stats', routeAuthMiddleware(AuthConfig.authenticated), adaptController(statsController, statsController.getUserStats));
    
    // User activity timeline
    app.get('/api/stats/activity', routeAuthMiddleware(AuthConfig.authenticated), adaptController(statsController, statsController.getUserActivity));
}