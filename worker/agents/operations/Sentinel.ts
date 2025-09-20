import { SentinelOutput, SentinelOutputType } from '../schemas';
import { createUserMessage, createSystemMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { PROMPT_UTILS } from '../prompts';
import { AgentOperation, OperationOptions } from './common';
import { OperationError } from '../utils/operationError';
import { RuntimeError } from '../../services/sandbox/sandboxTypes';

export interface SentinelInput {
    runtimeErrors: RuntimeError[];
}

export interface SentinelResult extends SentinelOutputType {}

const SYSTEM_PROMPT = `You are Sentinel. Analyze runtime errors from a React + Vite + TypeScript app and return:
- decision: one of none | code_review | phase_loop
- errors: ordered list of concise error summaries (highest priority first), each with optional filePath if evident
Keep output minimal. No extra keys, prose, or explanations.`;

const USER_PROMPT = `
<RUNTIME_ERRORS>
{{errors}}
</RUNTIME_ERRORS>

Instructions:
- Deduplicate by message + file/stack; ignore noise unless it blocks the UI.
- Order by impact; keep list short.
- decision rules:
  • phase_loop if issues appear systemic or across modules
  • code_review if localized fixes likely suffice
  • none if nothing actionable
- Output strictly matches schema: { decision, errors: [{ summary, filePath? }] }
`;

const userPromptFormatter = (errors: RuntimeError[]) => {
    const serialized = PROMPT_UTILS.serializeErrors(errors);
    const prompt = USER_PROMPT.replaceAll('{{errors}}', serialized);
    return PROMPT_UTILS.verifyPrompt(prompt);
}

export class SentinelOperation extends AgentOperation<SentinelInput, SentinelResult> {
    async execute(
        input: SentinelInput,
        options: OperationOptions
    ): Promise<SentinelResult> {
        const { env, logger } = options;
        try {
            const messages = [
                createSystemMessage(SYSTEM_PROMPT),
                createUserMessage(userPromptFormatter(input.runtimeErrors)),
            ];

            const result = await executeInference({
                env,
                messages,
                schema: SentinelOutput,
                agentActionName: 'sentinel',
                context: options.inferenceContext,
            });

            if (!result?.object) {
                throw new Error('Sentinel inference returned no result');
            }
            return result.object;
        } catch (error) {
            OperationError.logAndThrow(logger, "sentinel", error);
        }
    }
}