/**
 * Routes for managing user model configurations
 */

import { ModelConfigController } from '../controllers/modelConfig/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, routeAuthMiddleware } from '../../middleware/auth/routeAuth';

/**
 * Setup model configuration routes
 * All routes are protected and require authentication
 */
export function setupModelConfigRoutes(env: Env, app: Hono<AppEnv>): void {
    const modelConfigController = new ModelConfigController(env);
    
    // Create a sub-router for model config routes
    const modelConfigRouter = new Hono<AppEnv>();

    // Model Configuration Routes
    modelConfigRouter.get('/', routeAuthMiddleware(AuthConfig.authenticated), adaptController(modelConfigController, modelConfigController.getModelConfigs));
    modelConfigRouter.get('/defaults', routeAuthMiddleware(AuthConfig.authenticated), adaptController(modelConfigController, modelConfigController.getDefaults));
    modelConfigRouter.get('/byok-providers', routeAuthMiddleware(AuthConfig.authenticated), adaptController(modelConfigController, modelConfigController.getByokProviders));
    modelConfigRouter.get('/:agentAction', routeAuthMiddleware(AuthConfig.authenticated), adaptController(modelConfigController, modelConfigController.getModelConfig));
    modelConfigRouter.put('/:agentAction', routeAuthMiddleware(AuthConfig.authenticated), adaptController(modelConfigController, modelConfigController.updateModelConfig));
    modelConfigRouter.delete('/:agentAction', routeAuthMiddleware(AuthConfig.authenticated), adaptController(modelConfigController, modelConfigController.deleteModelConfig));
    modelConfigRouter.post('/test', routeAuthMiddleware(AuthConfig.authenticated), adaptController(modelConfigController, modelConfigController.testModelConfig));
    modelConfigRouter.post('/reset-all', routeAuthMiddleware(AuthConfig.authenticated), adaptController(modelConfigController, modelConfigController.resetAllConfigs));

    // Mount the router under /api/model-configs
    app.route('/api/model-configs', modelConfigRouter);
}