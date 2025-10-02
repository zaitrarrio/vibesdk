import { setupAuthRoutes } from './auth-routes';
import { setupAppRoutes } from './app-routes';
import { setupUserRoutes } from './user-routes';
import { setupStatsRoutes } from './stats-routes';
import { setupAnalyticsRoutes } from './analytics-routes';
import { setupSecretsRoutes } from './secrets-routes';
import { setupModelConfigRoutes } from './model-config-routes';
import { setupModelProviderRoutes } from './model-provider-routes';
import { setupGitHubExporterRoutes } from './github-exporter-routes';
import { setupCodegenRoutes } from './codegen-routes';
import { setupScreenshotRoutes } from './screenshot-routes';
import { setupSentryRoutes } from './sentry-routes';
import { Hono } from "hono";
import { AppEnv } from "../../types/appenv";
import { setupStatusRoutes } from './status-routes';

export function setupRoutes(app: Hono<AppEnv>): void {
    // Health check route
    app.get('/api/health', (c) => {
        return c.json({ status: 'ok' });
    }); 
    
    // Sentry tunnel routes (public - no auth required)
    setupSentryRoutes(app);

    // Platform status routes (public)
    setupStatusRoutes(app);

    // Authentication and user management routes
    setupAuthRoutes(app);
    
    // Codegen routes
    setupCodegenRoutes(app);
    
    // User dashboard and profile routes
    setupUserRoutes(app);
    
    // App management routes
    setupAppRoutes(app);
    
    // Stats routes
    setupStatsRoutes(app);
    
    // AI Gateway Analytics routes
    setupAnalyticsRoutes(app);
    
    // Secrets management routes
    setupSecretsRoutes(app);
    
    // Model configuration and provider keys routes
    setupModelConfigRoutes(app);
    
    // Model provider routes
    setupModelProviderRoutes(app);

    // GitHub Exporter routes
    setupGitHubExporterRoutes(app);

    // Screenshot serving routes (public)
    setupScreenshotRoutes(app);
}
