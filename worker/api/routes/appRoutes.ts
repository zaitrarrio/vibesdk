import { AppController } from '../controllers/apps/controller';
import { AppViewController } from '../controllers/appView/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';

/**
 * Setup app management routes
 */
export function setupAppRoutes(app: Hono<AppEnv>): void {
    // Create a sub-router for app routes
    const appRouter = new Hono<AppEnv>();
    
    // ========================================
    // PUBLIC ROUTES (Unauthenticated users can access)
    // ========================================
    
    // FIXED: Main apps listing - PUBLIC for /apps frontend route
    // This powers the main /apps page that shows all public apps
    appRouter.get('/public', routeAuthMiddleware(AuthConfig.public), adaptController(AppController, AppController.getPublicApps));

    // ========================================
    // AUTHENTICATED USER ROUTES (Personal dashboard routes)
    // ========================================
    
    // Get user's personal apps - requires authentication (for dashboard/profile)
    appRouter.get('/', routeAuthMiddleware(AuthConfig.authenticated), adaptController(AppController, AppController.getUserApps));

    // Get recent apps - requires authentication (for dashboard)
    appRouter.get('/recent', routeAuthMiddleware(AuthConfig.authenticated), adaptController(AppController, AppController.getRecentApps));

    // Get favorite apps - requires authentication (for dashboard)
    appRouter.get('/favorites', routeAuthMiddleware(AuthConfig.authenticated), adaptController(AppController, AppController.getFavoriteApps));

    // ========================================
    // AUTHENTICATED INTERACTION ROUTES
    // ========================================
    
    // Star/bookmark ANY app - requires authentication (can star others' public apps)
    appRouter.post('/:id/star', routeAuthMiddleware(AuthConfig.authenticated), adaptController(AppViewController, AppViewController.toggleAppStar));
    
    // Fork ANY public app - requires authentication (can fork others' public apps)
    appRouter.post('/:id/fork', routeAuthMiddleware(AuthConfig.authenticated), adaptController(AppViewController, AppViewController.forkApp));

    // Toggle favorite status - requires authentication  
    appRouter.post('/:id/favorite', routeAuthMiddleware(AuthConfig.authenticated), adaptController(AppController, AppController.toggleFavorite));

    // ========================================
    // PUBLIC APP DETAILS (placed after specific routes to avoid conflicts)
    // ========================================

    // App details view - PUBLIC for /app/:id frontend route  
    // Allows unauthenticated users to view and preview apps
    appRouter.get('/:id', routeAuthMiddleware(AuthConfig.public), adaptController(AppViewController, AppViewController.getAppDetails));

    // ========================================
    // OWNER-ONLY ROUTES (App modification)
    // ========================================
    
    // Update app visibility - OWNER ONLY
    appRouter.put('/:id/visibility', routeAuthMiddleware(AuthConfig.ownerOnly), adaptController(AppController, AppController.updateAppVisibility));

    // Delete app - OWNER ONLY
    appRouter.delete('/:id', routeAuthMiddleware(AuthConfig.ownerOnly), adaptController(AppController, AppController.deleteApp));
    
    // Mount the app router under /api/apps
    app.route('/api/apps', appRouter);
}
