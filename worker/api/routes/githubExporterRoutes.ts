/**
 * GitHub Exporter Routes
 * Handles GitHub repository export flows
 */

import { GitHubExporterController } from '../controllers/githubExporter/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';

/**
 * Setup GitHub Exporter routes
 */
export function setupGitHubExporterRoutes(app: Hono<AppEnv>): void {
    app.get('/api/github-exporter/callback', routeAuthMiddleware(AuthConfig.public), adaptController(GitHubExporterController, GitHubExporterController.handleOAuthCallback));
    
    // Repository export routes with OAuth flow
    app.post('/api/github-app/export', routeAuthMiddleware(AuthConfig.authenticated), adaptController(GitHubExporterController, GitHubExporterController.initiateGitHubExport));
}
