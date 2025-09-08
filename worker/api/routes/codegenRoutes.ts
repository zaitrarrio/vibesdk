import { CodingAgentController } from '../controllers/agent/controller';
import { AppEnv } from '../../types/appenv';
import { Hono } from 'hono';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';
import { adaptController } from '../honoAdapter';

/**
 * Setup and configure the application router
 */
export function setupCodegenRoutes(env: Env, app: Hono<AppEnv>): void {
    const codingAgentController = new CodingAgentController(env);

    // ========================================
    // CODE GENERATION ROUTES
    // ========================================
    
    // CRITICAL: Create new app - requires full authentication
    app.post('/api/agent', routeAuthMiddleware(AuthConfig.authenticated), adaptController(codingAgentController, codingAgentController.startCodeGeneration));
    
    // ========================================
    // APP EDITING ROUTES (/chat/:id frontend)
    // ========================================
    
    // WebSocket for app editing - OWNER ONLY (for /chat/:id route)
    // Only the app owner should be able to connect and modify via WebSocket
    app.get('/api/agent/:agentId/ws', routeAuthMiddleware(AuthConfig.ownerOnly), adaptController(codingAgentController, codingAgentController.handleWebSocketConnection));
    
    // Connect to existing agent for editing - OWNER ONLY
    // Only the app owner should be able to connect for editing purposes
    app.get('/api/agent/:agentId/connect', routeAuthMiddleware(AuthConfig.ownerOnly), adaptController(codingAgentController, codingAgentController.connectToExistingAgent));

    app.get('/api/agent/:agentId/preview', routeAuthMiddleware(AuthConfig.public), adaptController(codingAgentController, codingAgentController.deployPreview));
}