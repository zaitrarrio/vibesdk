import { createLogger } from './logger';
import { SmartCodeGeneratorAgent } from "./agents/core/smartGeneratorAgent";
import { proxyToSandbox } from '@cloudflare/sandbox';
import { isDispatcherAvailable } from './utils/dispatcherUtils';
import { createApp } from './app';
import * as Sentry from '@sentry/cloudflare';
import { sentryOptions } from './observability/sentry';

export { UserAppSandboxService, DeployerService } from './services/sandbox/sandboxSdkClient';
// export { DORateLimitStore } from './services/rate-limit/DORateLimitStore';
// export class CodeGeneratorAgent extends SmartCodeGeneratorAgent {}


import { DORateLimitStore as BaseDORateLimitStore } from './services/rate-limit/DORateLimitStore';
export const CodeGeneratorAgent = Sentry.instrumentDurableObjectWithSentry(sentryOptions, SmartCodeGeneratorAgent);
export const DORateLimitStore = Sentry.instrumentDurableObjectWithSentry(sentryOptions, BaseDORateLimitStore);

// Logger for the main application
const logger = createLogger('App');
/**
 * Main Worker fetch handler
 */
const worker = {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const hostname = url.hostname;
        try {
            // make a copy of request
            const requestCopy = request.clone() as Request<unknown, CfProperties<unknown>>;
            // Check if hostname is an ip address via regex
            const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
            if (!ipRegex.test(hostname)) {
                // Get the immideate subdomain of the hostname
                const subdomain = hostname.split('.')[0];
                // logger.info(`Subdomain: ${subdomain}, Hostname: ${hostname}`);
                // If the subdomain is not build, or there are less than 3 subdomains, redirect it to dispatcher
                // Thus either the main site should be build.somehost.com or build.something.somehost.com or something.com or www.something.com
                if (hostname !== env.CUSTOM_DOMAIN && subdomain !== 'localhost' && subdomain !== 'www' && subdomain !== 'build' && hostname.split('.').length >= 2) {
                    const proxyResponse = await proxyToSandbox(requestCopy, env);
                    if (proxyResponse) return proxyResponse;
                    logger.info(`Dispatching request to dispatcher`);
                    if (isDispatcherAvailable(env)) {
                        // Get worker from dispatch namespace
                        const dispatcher = env['DISPATCHER'] as any;
                        const worker = dispatcher.get(subdomain);
                        if (worker) {
                            logger.info(`Dispatching request to worker ${subdomain}`);
                            // Dispatch request to worker
                            const response = await worker.fetch(requestCopy);
                            return response;
                        }
                    } else {
                        logger.info(`Dispatcher not available, skipping dispatch for subdomain: ${subdomain}`);
                    }
                }
            }
        } catch (error) {
            logger.warn(`Error dispatching request to dispatcher ${error}, will try to serve it from main worker`);
        }

        // If the request is NOT to /api, redirect it to assets
        if (!url.pathname.startsWith('/api')) {
            const response = await env.ASSETS.fetch(request);
            return response;
        }

        logger.info(`Handling the request ${url}`);

        // Ignore favicon requests
        if (url.pathname.startsWith('/favicon')) {
            return new Response('', { status: 404 });
        }

        // Create hono app
        const app = createApp(env);
        const response = await app.fetch(request, env, ctx);
        return response;
    },
} satisfies ExportedHandler<Env>;

export default Sentry.withSentry(sentryOptions, worker);
