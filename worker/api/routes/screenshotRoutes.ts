import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { ScreenshotsController } from '../controllers/screenshots/controller';
import { adaptController } from '../honoAdapter';
import { routeAuthMiddleware, AuthConfig } from '../../middleware/auth/routeAuth';

export function setupScreenshotRoutes(env: Env, app: Hono<AppEnv>): void {
  const controller = new ScreenshotsController(env);
  const router = new Hono<AppEnv>();

  // Publicly serve screenshots (they are non-sensitive previews of generated apps)
  router.get('/:id/:file', routeAuthMiddleware(AuthConfig.authenticated), adaptController(controller, controller.serveScreenshot));

  app.route('/api/screenshots', router);
}
