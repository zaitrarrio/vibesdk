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
export function setupModelConfigRoutes(app: Hono<AppEnv>): void {
    // Create a sub-router for model config routes
    const modelConfigRouter = new Hono<AppEnv>();

    // Model Configuration Routes
    modelConfigRouter.get('/', routeAuthMiddleware(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.getModelConfigs));
    modelConfigRouter.get('/defaults', routeAuthMiddleware(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.getDefaults));
    modelConfigRouter.get('/byok-providers', routeAuthMiddleware(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.getByokProviders));
    modelConfigRouter.get('/:agentAction', routeAuthMiddleware(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.getModelConfig));
    modelConfigRouter.put('/:agentAction', routeAuthMiddleware(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.updateModelConfig));
    modelConfigRouter.delete('/:agentAction', routeAuthMiddleware(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.deleteModelConfig));
    modelConfigRouter.post('/test', routeAuthMiddleware(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.testModelConfig));
    modelConfigRouter.post('/reset-all', routeAuthMiddleware(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.resetAllConfigs));

    // Mount the router under /api/model-configs
    app.route('/api/model-configs', modelConfigRouter);
}