import { setupAuthRoutes } from './authRoutes';
import { setupAppRoutes } from './appRoutes';
import { setupUserRoutes } from './userRoutes';
import { setupStatsRoutes } from './statsRoutes';
import { setupAnalyticsRoutes } from './analyticsRoutes';
import { setupSecretsRoutes } from './secretsRoutes';
import { setupModelConfigRoutes } from './modelConfigRoutes';
import { setupModelProviderRoutes } from './modelProviderRoutes';
import { setupGitHubExporterRoutes } from './githubExporterRoutes';
import { setupCodegenRoutes } from './codegenRoutes';
import { setupScreenshotRoutes } from './screenshotRoutes';
import { Hono } from "hono";
import { AppEnv } from "../../types/appenv";

export function setupRoutes(env: Env, app: Hono<AppEnv>): void {
    // Health check route
    app.get('/api/health', (c) => {
        return c.json({ status: 'ok' });
    });

    // Authentication and user management routes
    setupAuthRoutes(env, app);
    
    // Codegen routes
    setupCodegenRoutes(env, app);
    
    // User dashboard and profile routes
    setupUserRoutes(env, app);
    
    // App management routes
    setupAppRoutes(env, app);
    
    // Stats routes
    setupStatsRoutes(env, app);
    
    // AI Gateway Analytics routes
    setupAnalyticsRoutes(env, app);
    
    // Secrets management routes
    setupSecretsRoutes(env, app);
    
    // Model configuration and provider keys routes
    setupModelConfigRoutes(env, app);
    
    // Model provider routes
    setupModelProviderRoutes(env, app);

    // GitHub Exporter routes
    setupGitHubExporterRoutes(env, app);

    // Screenshot serving routes (public)
    setupScreenshotRoutes(env, app);
}