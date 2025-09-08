
import { SmartCodeGeneratorAgent } from './core/smartGeneratorAgent';
import { getAgentByName } from 'agents';
import { CodeGenState } from './core/state';
import { generateId } from '../utils/idGenerator';
import { StructuredLogger } from '../logger';

export async function getAgentStub(env: Env, agentId: string, searchInOtherJurisdictions: boolean = false, logger: StructuredLogger) : Promise<DurableObjectStub<SmartCodeGeneratorAgent>> {
    if (searchInOtherJurisdictions) {
        // Try multiple jurisdictions until we find the agent
        const jurisdictions = [undefined, 'eu' as DurableObjectJurisdiction];
        for (const jurisdiction of jurisdictions) {
            try {
                logger.info(`Agent ${agentId} retreiving from jurisdiction ${jurisdiction}`);
                const stub = await getAgentByName<Env, SmartCodeGeneratorAgent>(env.CodeGenObject, agentId, {
                    locationHint: 'enam',
                    jurisdiction: jurisdiction,
                });
                const isInitialized = await stub.isInitialized()
                if (isInitialized) {
                    logger.info(`Agent ${agentId} found in jurisdiction ${jurisdiction}`);
                    return stub
                }
            } catch (error) {
                logger.info(`Agent ${agentId} not found in jurisdiction ${jurisdiction}`);
            }
        }
        // If all jurisdictions fail, throw an error
        // throw new Error(`Agent ${agentId} not found in any jurisdiction`);
    }
    logger.info(`Agent ${agentId} retrieved directly`);
    return getAgentByName<Env, SmartCodeGeneratorAgent>(env.CodeGenObject, agentId, {
        locationHint: 'enam'
    });
}

export async function getAgentState(env: Env, agentId: string, searchInOtherJurisdictions: boolean = false, logger: StructuredLogger) : Promise<CodeGenState> {
    const agentInstance = await getAgentStub(env, agentId, searchInOtherJurisdictions, logger);
    return agentInstance.getFullState() as CodeGenState;
}

export async function cloneAgent(env: Env, agentId: string, logger: StructuredLogger) : Promise<{newAgentId: string, newAgent: DurableObjectStub<SmartCodeGeneratorAgent>}> {
    const agentInstance = await getAgentStub(env, agentId, true, logger);
    if (!agentInstance || !await agentInstance.isInitialized()) {
        throw new Error(`Agent ${agentId} not found`);
    }
    const newAgentId = generateId();

    const newAgent = await getAgentStub(env, newAgentId, false, logger);
    const originalState = await agentInstance.getFullState() as CodeGenState;
    const newState = {
        ...originalState,
        sessionId: newAgentId,
        sandboxInstanceId: undefined,
        pendingUserInputs: [],
        currentDevState: 0,
        generationPromise: undefined,
        shouldBeGenerating: false,
        // latestScreenshot: undefined,
        clientReportedErrors: [],
    };

    await newAgent.setState(newState);
    return {newAgentId, newAgent};
}

