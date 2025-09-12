import * as Sentry from '@sentry/cloudflare';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types/appenv';

export function sentryOptions(env: Env) {
	return {
		dsn: env.SENTRY_DSN,
		release: env.CF_VERSION_METADATA.id,
		environment: env.ENVIRONMENT,
		enableLogs: true,
		sendDefaultPii: true,
		tracesSampleRate: 1.0,
	};
}

export function initHonoSentry(app: Hono<AppEnv>): void {
	// Report unhandled exceptions from routes/middleware
	app.onError((err, c) => {
		Sentry.captureException(err);
		if (err instanceof HTTPException) {
			return err.getResponse();
		}
		return c.json({ error: 'Internal server error' }, 500);
	});

	// Light context binding for better traces
	app.use('*', async (c, next) => {
		try {
			const url = new URL(c.req.url);
			Sentry.setTag('http.method', c.req.method);
			Sentry.setTag('http.path', url.pathname);
			const cfRay = c.req.header('cf-ray');
			if (cfRay) Sentry.setTag('cf_ray', cfRay);

			const user = c.get('user');
			if (user) {
				Sentry.setUser({ id: user.id, email: user.email });
			}
		} catch {
            console.error('Failed to set Sentry context');
		}
		return next();
	});
}

export type SecurityEventType =
	| 'csrf_violation'
	| 'rate_limit_exceeded'
	| 'auth_violation'
	| 'oauth_state_mismatch'
	| 'jwt_invalid'
	| string;

export type SecuritySeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface SecurityEventOptions {
    level?: SecuritySeverity;
    error?: unknown;
}

export function captureSecurityEvent(
    type: SecurityEventType,
    data: Record<string, unknown> = {},
    options: SecurityEventOptions = {},
): void {
    try {
        const level: SecuritySeverity = options.level ?? 'warning';
        Sentry.withScope((scope) => {
            scope.setTag('security_event', type);
            scope.setContext('security', data);
            scope.setLevel(level);
            Sentry.addBreadcrumb({
                category: 'security',
                level,
                data: { type, ...data },
            });
            if (options.error !== undefined) {
                Sentry.captureException(options.error, { level, extra: data });
            } else {
                Sentry.captureMessage(`[security] ${type}`, level);
            }
        });
    } catch {
        // no-op: telemetry must not break the app
        console.error('Failed to capture security event');
    }
}
