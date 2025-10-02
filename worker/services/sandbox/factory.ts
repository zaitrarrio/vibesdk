import { SandboxSdkClient } from "./sandbox-sdk-client";
import { RemoteSandboxServiceClient } from "./remote-sandbox-service";
import { BaseSandboxService } from "./base-sandbox-service";
import { env } from 'cloudflare:workers'

export function getSandboxService(sessionId: string): BaseSandboxService {
    if (env.SANDBOX_SERVICE_TYPE == 'runner') {
        console.log("[getSandboxService] Using runner service for sandboxing");
        return new RemoteSandboxServiceClient(sessionId);
    }
    console.log("[getSandboxService] Using sandboxsdk service for sandboxing");
    return new SandboxSdkClient(sessionId);
}