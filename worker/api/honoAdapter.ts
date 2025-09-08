import { Context } from 'hono';
import { RouteContext } from './types/route-context';
import { AppEnv } from '../types/appenv';
import { BaseController } from './controllers/baseController';

/*
* This is a simple adapter to convert Hono context to our base controller's expected arguments
*/

type ControllerMethod = (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    context: RouteContext
) => Promise<Response>;

export function adaptController(
    controllerInstance: BaseController,
    method: ControllerMethod
) {
    return async (c: Context<AppEnv>): Promise<Response> => {

        const routeContext: RouteContext = {
            user: c.get('user'),
            config: c.get('config'),
            pathParams: c.req.param(),
            queryParams: new URL(c.req.url).searchParams,
        };

        const boundMethod = method.bind(controllerInstance);

        return await boundMethod(
            c.req.raw,
            c.env,
            c.executionCtx,
            routeContext
        );
    };
}
