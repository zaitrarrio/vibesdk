/**
 * Model Configuration Controller
 * Handles CRUD operations for user model configurations
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import { ModelConfigService } from '../../../database/services/ModelConfigService';
import { SecretsService } from '../../../database/services/SecretsService';
import { ModelTestService } from '../../../database/services/ModelTestService';
import { 
    AgentActionKey, 
    ModelConfig
} from '../../../agents/inferutils/config.types';
import { AGENT_CONFIG } from '../../../agents/inferutils/config';
import {
    ModelConfigsData,
    ModelConfigData,
    ModelConfigUpdateData,
    ModelConfigTestData,
    ModelConfigResetData,
    ModelConfigDefaultsData,
    ModelConfigDeleteData,
    ByokProvidersData
} from './types';
import { 
    getUserProviderStatus, 
    getByokModels,
    getPlatformAvailableModels,
    validateModelAccessForEnvironment
} from './byokHelper';
import { z } from 'zod';

// Validation schemas
const modelConfigUpdateSchema = z.object({
    modelName: z.string().min(1).max(100).nullable().optional(),
    maxTokens: z.number().min(1).max(200000).nullable().optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
    reasoningEffort: z.enum(['low', 'medium', 'high']).nullable().optional(),
    providerOverride: z.enum(['cloudflare', 'direct']).nullable().optional(),
    fallbackModel: z.string().min(1).max(100).nullable().optional(),
    isUserOverride: z.boolean().optional()
});

const modelTestSchema = z.object({
    agentActionName: z.string(),
    testPrompt: z.string().optional(),
    useUserKeys: z.boolean().default(true),
    tempConfig: modelConfigUpdateSchema.optional()
});

export class ModelConfigController extends BaseController {
    private modelConfigService: ModelConfigService;
    constructor(env: Env) {
        super(env);
        this.modelConfigService = new ModelConfigService(this.db);
    }
    
    /**
     * Get all model configurations for the current user
     * GET /api/model-configs
     */
    async getModelConfigs(_request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelConfigsData>>> {
        try {
            const user = context.user!;

            const configs = await this.modelConfigService.getUserModelConfigs(user.id);
            const defaults = this.modelConfigService.getDefaultConfigs();

            const responseData: ModelConfigsData = {
                configs,
                defaults,
                message: 'Model configurations retrieved successfully'
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting model configurations:', error);
            return this.createErrorResponse<ModelConfigsData>('Failed to get model configurations', 500);
        }
    }

    /**
     * Get a specific model configuration
     * GET /api/model-configs/:agentAction
     */
    async getModelConfig(request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelConfigData>>> {
        try {
            const user = context.user!;

            const url = new URL(request.url);
            const agentAction = url.pathname.split('/').pop() as AgentActionKey;

            if (!agentAction || !(agentAction in AGENT_CONFIG)) {
                return this.createErrorResponse<ModelConfigData>('Invalid agent action name', 400);
            }

            const config = await this.modelConfigService.getUserModelConfig(user.id, agentAction);
            const defaultConfig = this.modelConfigService.getDefaultConfigs()[agentAction];

            const responseData: ModelConfigData = {
                config,
                defaultConfig,
                message: 'Model configuration retrieved successfully'
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting model configuration:', error);
            return this.createErrorResponse<ModelConfigData>('Failed to get model configuration', 500);
        }
    }

    /**
     * Update a specific model configuration
     * PUT /api/model-configs/:agentAction
     */
    async updateModelConfig(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelConfigUpdateData>>> {
        try {
            const user = context.user!;

            const url = new URL(request.url);
            const agentAction = url.pathname.split('/').pop() as AgentActionKey;

            if (!agentAction || !(agentAction in AGENT_CONFIG)) {
                return this.createErrorResponse<ModelConfigUpdateData>('Invalid agent action name', 400);
            }

            const bodyResult = await this.parseJsonBody(request);
            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<ModelConfigUpdateData>>;
            }

            const validatedData = modelConfigUpdateSchema.parse(bodyResult.data);

            // Convert to ModelConfig format - only include non-null values
            const modelConfig: Partial<ModelConfig> = {};
            
            if (validatedData.modelName !== null && validatedData.modelName !== undefined) {
                modelConfig.name = validatedData.modelName;
            }
            if (validatedData.maxTokens !== null && validatedData.maxTokens !== undefined) {
                modelConfig.max_tokens = validatedData.maxTokens;
            }
            if (validatedData.temperature !== null && validatedData.temperature !== undefined) {
                modelConfig.temperature = validatedData.temperature;
            }
            if (validatedData.reasoningEffort !== null && validatedData.reasoningEffort !== undefined) {
                modelConfig.reasoning_effort = validatedData.reasoningEffort;
            }
            if (validatedData.fallbackModel !== null && validatedData.fallbackModel !== undefined) {
                modelConfig.fallbackModel = validatedData.fallbackModel;
            }

            // Validate model access based on environment configuration and user BYOK status
            if (modelConfig.name || modelConfig.fallbackModel) {
                const userProviderStatus = await getUserProviderStatus(user.id, env);
                
                // Validate primary model
                if (modelConfig.name) {
                    const isValidAccess = validateModelAccessForEnvironment(
                        modelConfig.name, 
                        env, 
                        userProviderStatus
                    );
                    
                    if (!isValidAccess) {
                        const provider = modelConfig.name.split('/')[0];
                        return this.createErrorResponse<ModelConfigUpdateData>(
                            `Model requires API key for provider '${provider}'. Please add your API key in the BYOK settings or contact your platform administrator.`,
                            403
                        );
                    }
                }

                // Validate fallback model
                if (modelConfig.fallbackModel) {
                    const isValidAccess = validateModelAccessForEnvironment(
                        modelConfig.fallbackModel,
                        env,
                        userProviderStatus
                    );
                    
                    if (!isValidAccess) {
                        const provider = modelConfig.fallbackModel.split('/')[0];
                        return this.createErrorResponse<ModelConfigUpdateData>(
                            `Fallback model requires API key for provider '${provider}'. Please add your API key in the BYOK settings or contact your platform administrator.`,
                            403
                        );
                    }
                }
            }

            const updatedConfig = await this.modelConfigService.upsertUserModelConfig(
                user.id,
                agentAction,
                modelConfig
            );

            const responseData: ModelConfigUpdateData = {
                config: updatedConfig,
                message: 'Model configuration updated successfully'
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return this.createErrorResponse<ModelConfigUpdateData>('Validation failed: ' + JSON.stringify(error.errors), 400);
            }
            this.logger.error('Error updating model configuration:', error);
            return this.createErrorResponse<ModelConfigUpdateData>('Failed to update model configuration', 500);
        }
    }

    /**
     * Delete/reset a model configuration to default
     * DELETE /api/model-configs/:agentAction
     */
    async deleteModelConfig(request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelConfigDeleteData>>> {
        try {
            const user = context.user!;

            const url = new URL(request.url);
            const agentAction = url.pathname.split('/').pop() as AgentActionKey;

            if (!agentAction || !(agentAction in AGENT_CONFIG)) {
                return this.createErrorResponse<ModelConfigDeleteData>('Invalid agent action name', 400);
            }

            const deleted = await this.modelConfigService.deleteUserModelConfig(user.id, agentAction);

            if (!deleted) {
                return this.createErrorResponse<ModelConfigDeleteData>('Configuration not found or already using defaults', 404);
            }

            const responseData: ModelConfigDeleteData = {
                message: 'Model configuration reset to default successfully'
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error deleting model configuration:', error);
            return this.createErrorResponse<ModelConfigDeleteData>('Failed to delete model configuration', 500);
        }
    }

    /**
     * Test a model configuration
     * POST /api/model-configs/test
     */
    async testModelConfig(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelConfigTestData>>> {
        try {
            const user = context.user!;

            const bodyResult = await this.parseJsonBody(request);
            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<ModelConfigTestData>>;
            }

            const validatedData = modelTestSchema.parse(bodyResult.data);
            const agentAction = validatedData.agentActionName as AgentActionKey;

            if (!(agentAction in AGENT_CONFIG)) {
                return this.createErrorResponse<ModelConfigTestData>('Invalid agent action name', 400);
            }

            const secretsService = new SecretsService(this.db, env);
            const modelTestService = new ModelTestService(this.db, env);

            // Get base configuration and merge with temporary changes if provided
            const baseConfig = await this.modelConfigService.getUserModelConfig(user.id, agentAction);
            
            const configToTest: ModelConfig = validatedData.tempConfig ? {
                ...baseConfig,
                // Map frontend field names to backend config structure
                ...(validatedData.tempConfig.modelName != null && { name: validatedData.tempConfig.modelName }),
                ...(validatedData.tempConfig.maxTokens != null && { max_tokens: validatedData.tempConfig.maxTokens }),
                ...(validatedData.tempConfig.temperature != null && { temperature: validatedData.tempConfig.temperature }),
                ...(validatedData.tempConfig.reasoningEffort != null && { reasoning_effort: validatedData.tempConfig.reasoningEffort }),
                ...(validatedData.tempConfig.fallbackModel != null && { fallbackModel: validatedData.tempConfig.fallbackModel }),
                ...(validatedData.tempConfig.providerOverride != null && { providerOverride: validatedData.tempConfig.providerOverride })
            } : baseConfig;

            // Get user API keys if requested
            let userApiKeys: Record<string, string> | undefined;
            if (validatedData.useUserKeys) {
                const userApiKeysMap = await secretsService.getUserBYOKKeysMap(user.id);
                userApiKeys = Object.fromEntries(userApiKeysMap);
            }

            // Test the configuration
            const testResult = await modelTestService.testModelConfig({
                modelConfig: configToTest,
                userApiKeys,
                testPrompt: validatedData.testPrompt
            });

            const responseData: ModelConfigTestData = {
                testResult,
                message: testResult.success 
                    ? 'Model configuration test successful' 
                    : 'Model configuration test failed'
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return this.createErrorResponse<ModelConfigTestData>('Validation failed: ' + JSON.stringify(error.errors), 400);
            }
            this.logger.error('Error testing model configuration:', error);
            return this.createErrorResponse<ModelConfigTestData>('Failed to test model configuration', 500);
        }
    }

    /**
     * Reset all model configurations to defaults
     * POST /api/model-configs/reset-all
     */
    async resetAllConfigs(_request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelConfigResetData>>> {
        try {
            const user = context.user!;

            const resetCount = await this.modelConfigService.resetAllUserConfigs(user.id);

            const responseData: ModelConfigResetData = {
                resetCount,
                message: `${resetCount} model configurations reset to defaults`
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error resetting all model configurations:', error);
            return this.createErrorResponse<ModelConfigResetData>('Failed to reset model configurations', 500);
        }
    }

    /**
     * Get default configurations
     * GET /api/model-configs/defaults
     */
    async getDefaults(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<ControllerResponse<ApiResponse<ModelConfigDefaultsData>>> {
        try {
            const defaults = this.modelConfigService.getDefaultConfigs();
            
            const responseData: ModelConfigDefaultsData = {
                defaults,
                message: 'Default configurations retrieved successfully'
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting default configurations:', error);
            return this.createErrorResponse<ModelConfigDefaultsData>('Failed to get default configurations', 500);
        }
    }

    /**
     * Get BYOK providers and available models
     * GET /api/model-configs/byok-providers
     */
    async getByokProviders(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ByokProvidersData>>> {
        try {
            const user = context.user!;

            // Get user's provider status
            const providers = await getUserProviderStatus(user.id, env);
            
            // Get models available for providers with valid keys
            const modelsByProvider = getByokModels(providers);
            
            // Get platform models based on environment configuration
            const platformModels = getPlatformAvailableModels(env);
            
            const responseData: ByokProvidersData = {
                providers,
                modelsByProvider,
                platformModels
            };

            return this.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting BYOK providers:', error);
            return this.createErrorResponse<ByokProvidersData>('Failed to get BYOK providers', 500);
        }
    }
}