import { Hono } from 'hono';
import { SentryTunnelController } from '../controllers/sentry/tunnel-controller';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../hono-adapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

export function setupSentryRoutes(app: Hono<AppEnv>): void {
    const sentryRouter = new Hono<AppEnv>();
    
    // Sentry tunnel endpoint for frontend events (public - no auth required)
    sentryRouter.post('/tunnel', setAuthLevel(AuthConfig.public), adaptController(SentryTunnelController, SentryTunnelController.tunnel));
    
    // Mount the router under /api/sentry
    app.route('/api/sentry', sentryRouter);
}
