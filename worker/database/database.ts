/**
 * Core Database Service
 * Provides database connection, core utilities, and base operations∂ƒ
 */

import { drizzle } from 'drizzle-orm/d1';
import * as Sentry from '@sentry/cloudflare';
import * as schema from './schema';

import type { HealthStatusResult } from './types';

// ========================================
// TYPE DEFINITIONS AND INTERFACES
// ========================================

export interface DatabaseEnv {
    DB: D1Database;
}

export type {
    User, NewUser, Session, NewSession,
    App, NewApp,
    AppLike, NewAppLike, AppComment, NewAppComment,
    AppView, NewAppView, OAuthState, NewOAuthState,
    SystemSetting, NewSystemSetting,
    UserSecret, NewUserSecret,
    UserModelConfig, NewUserModelConfig,
} from './schema';


/**
 * Core Database Service - Connection and Base Operations
 * 
 * Provides database connection, shared utilities, and core operations.
 * Domain-specific operations are handled by dedicated service classes.
 */
export class DatabaseService {
    public readonly db: ReturnType<typeof drizzle>;

    constructor(env: DatabaseEnv) {
        const instrumented = Sentry.instrumentD1WithSentry(env.DB);
        this.db = drizzle(instrumented, { schema });
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    async getHealthStatus(): Promise<HealthStatusResult> {
        try {
            await this.db.select().from(schema.systemSettings).limit(1);
            return {
                healthy: true,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            return {
                healthy: false,
                timestamp: new Date().toISOString(),
            };
        }
    }
}

/**
 * Factory function to create database service instance
 */
export function createDatabaseService(env: DatabaseEnv): DatabaseService {
    return new DatabaseService(env);
}