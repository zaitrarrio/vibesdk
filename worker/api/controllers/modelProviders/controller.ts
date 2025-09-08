/**
 * Model Providers Controller
 * Handles CRUD operations for user custom model providers
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import { SecretsService } from '../../../database/services/SecretsService';
import { ModelProvidersService } from '../../../database/services/ModelProvidersService';
import { z } from 'zod';
import {
    ModelProvidersListData,
    ModelProviderData,
    ModelProviderCreateData,
    ModelProviderUpdateData,
    ModelProviderDeleteData,
    ModelProviderTestData,
    CreateProviderRequest,
    UpdateProviderRequest,
    TestProviderRequest
} from './types';

// Validation schemas
const createProviderSchema = z.object({
    name: z.string().min(1).max(100),
    baseUrl: z.string().url(),
    apiKey: z.string().min(1)
});

const updateProviderSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().min(1).optional(),
    isActive: z.boolean().optional()
});

const testProviderSchema = z.object({
    providerId: z.string().optional(),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().min(1).optional()
}).refine(
    (data) => data.providerId || (data.baseUrl && data.apiKey),
    "Either providerId or both baseUrl and apiKey must be provided"
);

export class ModelProvidersController extends BaseController {
    private modelProvidersService: ModelProvidersService;
    private secretsService: SecretsService;
    
    constructor(env: Env) {
        super(env);
        this.modelProvidersService = new ModelProvidersService(this.db);
        this.secretsService = new SecretsService(this.db, env);
    }

    /**
     * Get all custom providers for the authenticated user
     */
    async getProviders(_request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelProvidersListData>>> {
        const user = context.user!;

        return this.executeTypedOperation(
            async () => {
                const providers = await this.modelProvidersService.getUserProviders(user.id);
                
                return {
                    providers: providers.filter(p => p.isActive)
                };
            },
            'getProviders'
        );
    }

    /**
     * Get a specific provider by ID
     */
    async getProvider(request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelProviderData>>> {
        const user = context.user!;

        const url = new URL(request.url);
        const providerId = url.pathname.split('/').pop();

        if (!providerId) {
            return this.createErrorResponse<ModelProviderData>('Provider ID is required', 400);
        }

        return this.executeTypedOperation(
            async () => {
                const provider = await this.modelProvidersService.getProvider(user.id, providerId);
                
                if (!provider) {
                    throw new Error('Provider not found');
                }
                
                return { provider };
            },
            'getProvider'
        );
    }

    /**
     * Create a new custom provider
     */
    async createProvider(request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelProviderCreateData>>> {
        const user = context.user!;

        const bodyResult = await this.parseJsonBody<CreateProviderRequest>(request);
        if (!bodyResult.success) {
            return bodyResult.response as ControllerResponse<ApiResponse<ModelProviderCreateData>>;
        }

        const validation = createProviderSchema.safeParse(bodyResult.data);
        if (!validation.success) {
            return this.createErrorResponse<ModelProviderCreateData>(
                `Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 
                400
            );
        }

        const { name, baseUrl, apiKey } = validation.data;

        return this.executeTypedOperation(
            async () => {

                const exists = await this.modelProvidersService.providerExists(user.id, name);
                if (exists) {
                    throw new Error('Provider name already exists');
                }

                const secretResult = await this.secretsService.storeSecret(user.id, {
                    name: `${name} API Key`,
                    provider: 'custom',
                    secretType: 'api_key',
                    value: apiKey,
                    description: `API key for custom provider: ${name}`,
                    expiresAt: null
                });

                const provider = await this.modelProvidersService.createProvider(user.id, {
                    name,
                    baseUrl,
                    secretId: secretResult.id
                });

                return { provider };
            },
            'createProvider'
        );
    }

    /**
     * Update an existing provider
     */
    async updateProvider(request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelProviderUpdateData>>> {
        const user = context.user!;

        const url = new URL(request.url);
        const providerId = url.pathname.split('/').pop();

        if (!providerId) {
            return this.createErrorResponse<ModelProviderUpdateData>('Provider ID is required', 400);
        }

        const bodyResult = await this.parseJsonBody<UpdateProviderRequest>(request);
        if (!bodyResult.success) {
            return bodyResult.response as ControllerResponse<ApiResponse<ModelProviderUpdateData>>;
        }

        const validation = updateProviderSchema.safeParse(bodyResult.data);
        if (!validation.success) {
            return this.createErrorResponse<ModelProviderUpdateData>(
                `Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 
                400
            );
        }

        const updates = validation.data;

        return this.executeTypedOperation(
            async () => {
                const existingProvider = await this.modelProvidersService.getProvider(user.id, providerId);
                if (!existingProvider) {
                    throw new Error('Provider not found');
                }

                let secretId = existingProvider.secretId;

                if (updates.apiKey) {
                    if (existingProvider.secretId) {
                        await this.secretsService.deleteSecret(user.id, existingProvider.secretId);
                    }
                    
                    const secretResult = await this.secretsService.storeSecret(user.id, {
                        name: `${updates.name || existingProvider.name} API Key`,
                        provider: 'custom',
                        secretType: 'api_key',
                        value: updates.apiKey,
                        description: `API key for custom provider: ${updates.name || existingProvider.name}`,
                        expiresAt: null
                    });
                    secretId = secretResult.id;
                }

                const updatedProvider = await this.modelProvidersService.updateProvider(user.id, providerId, {
                    name: updates.name,
                    baseUrl: updates.baseUrl,
                    isActive: updates.isActive,
                    secretId
                });

                if (!updatedProvider) {
                    throw new Error('Failed to update provider');
                }

                return { provider: updatedProvider };
            },
            'updateProvider'
        );
    }

    /**
     * Delete a provider
     */
    async deleteProvider(request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelProviderDeleteData>>> {
        const user = context.user!;

        const url = new URL(request.url);
        const providerId = url.pathname.split('/').pop();

        if (!providerId) {
            return this.createErrorResponse<ModelProviderDeleteData>('Provider ID is required', 400);
        }

        return this.executeTypedOperation(
            async () => {
                const existingProvider = await this.modelProvidersService.getProvider(user.id, providerId);
                if (!existingProvider) {
                    throw new Error('Provider not found');
                }

                if (existingProvider.secretId) {
                    await this.secretsService.deleteSecret(user.id, existingProvider.secretId);
                }

                const updated = await this.modelProvidersService.updateProvider(user.id, providerId, {
                    isActive: false
                });

                return {
                    success: !!updated,
                    providerId
                };
            },
            'deleteProvider'
        );
    }

    /**
     * Test provider connection
     */
    async testProvider(request: Request, _env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ModelProviderTestData>>> {
        const user = context.user!;

        const bodyResult = await this.parseJsonBody<TestProviderRequest>(request);
        if (!bodyResult.success) {
            return bodyResult.response as ControllerResponse<ApiResponse<ModelProviderTestData>>;
        }

        const validation = testProviderSchema.safeParse(bodyResult.data);
        if (!validation.success) {
            return this.createErrorResponse<ModelProviderTestData>(
                `Validation error: ${validation.error.errors.map(e => e.message).join(', ')}`, 
                400
            );
        }

        return this.executeTypedOperation(
            async () => {
                let baseUrl: string;
                let apiKey: string;

                if (validation.data.providerId) {
                    const provider = await this.modelProvidersService.getProvider(user.id, validation.data.providerId);
                    if (!provider) {
                        throw new Error('Provider not found');
                    }

                    if (!provider.secretId) {
                        throw new Error('Provider has no API key');
                    }

                    const secretValue = await this.secretsService.getSecretValue(user.id, provider.secretId);
                    if (!secretValue) {
                        throw new Error('API key not found');
                    }

                    baseUrl = provider.baseUrl;
                    apiKey = secretValue;
                } else {
                    baseUrl = validation.data.baseUrl!;
                    apiKey = validation.data.apiKey!;
                }

                const startTime = Date.now();
                try {
                    const testUrl = `${baseUrl.replace(/\/$/, '')}/models`;
                    const response = await fetch(testUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    const responseTime = Date.now() - startTime;

                    if (response.ok) {
                        return {
                            success: true,
                            responseTime
                        };
                    } else {
                        const errorText = await response.text();
                        return {
                            success: false,
                            error: `API request failed: ${response.status} ${errorText}`,
                            responseTime
                        };
                    }
                } catch (error) {
                    const responseTime = Date.now() - startTime;
                    return {
                        success: false,
                        error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        responseTime
                    };
                }
            },
            'testProvider'
        );
    }
}