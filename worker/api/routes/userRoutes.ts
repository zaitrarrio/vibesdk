import { UserController } from '../controllers/user/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';

/**
 * Setup user management routes
 */
export function setupUserRoutes(env: Env, app: Hono<AppEnv>): void {
    const userController = new UserController(env);

    // User apps with pagination (this is what the frontend needs)
    app.get('/api/user/apps', routeAuthMiddleware(AuthConfig.authenticated), adaptController(userController, userController.getApps));

    // User profile
    app.put('/api/user/profile', routeAuthMiddleware(AuthConfig.authenticated), adaptController(userController, userController.updateProfile));
}