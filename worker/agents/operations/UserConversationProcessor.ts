import { ConversationalResponseType } from "../schemas";
import { createAssistantMessage, createUserMessage } from "../inferutils/common";
import { executeInference } from "../inferutils/infer";
import { getSystemPromptWithProjectContext } from "./common";
import { WebSocketMessageResponses } from "../constants";
import { WebSocketMessageData } from "../../api/websocketTypes";
import { AgentOperation, OperationOptions } from "../operations/common";
import { ConversationMessage } from "../inferutils/common";
import { StructuredLogger } from "../../logger";
import { IdGenerator } from "../utils/idGenerator";
import { RateLimitExceededError, SecurityError } from 'shared/types/errors';
import { toolWebSearchDefinition } from "../tools/toolkit/web-search";
import { toolWeatherDefinition } from "../tools/toolkit/weather";
import { ToolDefinition } from "../tools/types";

// Constants
const CHUNK_SIZE = 64;

export interface UserConversationInputs {
    userMessage: string;
    pastMessages: ConversationMessage[];
    conversationResponseCallback: (message: string, conversationId: string, isStreaming: boolean) => void;
}

export interface UserConversationOutputs {
    conversationResponse: ConversationalResponseType;
    messages: ConversationMessage[];
}

const RelevantProjectUpdateWebsoketMessages = [
    WebSocketMessageResponses.PHASE_IMPLEMENTING,
    WebSocketMessageResponses.PHASE_IMPLEMENTED,
    WebSocketMessageResponses.CODE_REVIEW,
    WebSocketMessageResponses.FILE_REGENERATING,
    WebSocketMessageResponses.FILE_REGENERATED,
    WebSocketMessageResponses.DEPLOYMENT_COMPLETED,
    WebSocketMessageResponses.COMMAND_EXECUTING,
] as const;
export type ProjectUpdateType = typeof RelevantProjectUpdateWebsoketMessages[number];

const SYSTEM_PROMPT = `You are an AI assistant for Cloudflare's development platform, helping users build and modify their applications. You have a conversational interface and can help users with their projects.

## YOUR CAPABILITIES:
- You can answer questions about the project and its current state
- You can search the web for information when needed
- Most importantly, you can modify the application when users request changes or ask for new features
- You can execute other tools provided to you to help users with their projects

## HOW TO INTERACT:

1. **For general questions or discussions**: Simply respond naturally and helpfully. Be friendly and informative.

2. **When users want to modify their app**: Use the edit_app tool to queue the modification request. 
   - First acknowledge what they want to change
   - Then call the edit_app tool with a clear, actionable description
   - The modification request should be specific but NOT include code-level implementation details
   - After calling the tool, let them know the changes will be implemented in the next development phase

3. **For information requests**: Use the appropriate tools (web_search, etc) when they would be helpful.

## RESPONSE STYLE:
- Be conversational and natural - you're having a chat, not filling out forms
- Be encouraging and positive about their project
- When changes are requested, respond as if you're the one making the changes (say "I'll add that" not "the team will add that")
- Always acknowledge that implementation will happen "in the next development phase" to set expectations

## IMPORTANT GUIDELINES:
- DO NOT generate or discuss code-level implementation details
- DO NOT provide specific technical instructions or code snippets
- DO translate vague user requests into clear, actionable requirements when using edit_app
- DO be helpful in understanding what the user wants to achieve

## Original Project Context:
{{query}}

Remember: You're here to help users build great applications through natural conversation and the tools at your disposal.`;

const FALLBACK_USER_RESPONSE = "I understand you'd like to make some changes to your project. Let me make sure this is incorporated in the next phase of development.";

interface EditAppArgs {
    modificationRequest: string;
}

interface EditAppResult {}

export function buildEditAppTool(stateMutator: (modificationRequest: string) => void): ToolDefinition<EditAppArgs, EditAppResult> {
    return {
        type: 'function' as const,
        function: {
            name: 'edit_app',
            description: 'Make modifications to the app',
            parameters: {
                type: 'object',
                properties: {
                    modificationRequest: {
                        type: 'string',
                        description: 'The changes needed to be made to the app. Please don\'t supply any code level or implementation details.'
                    }
                },
                required: ['modificationRequest']
            }
        },
        implementation: async (args: EditAppArgs) => {
            console.log("Queueing app edit request", args);
            stateMutator(args.modificationRequest);
            return {};
        }
    };
}
export class UserConversationProcessor extends AgentOperation<UserConversationInputs, UserConversationOutputs> {
    async execute(inputs: UserConversationInputs, options: OperationOptions): Promise<UserConversationOutputs> {
        const { env, logger, context } = options;
        const { userMessage, pastMessages } = inputs;
        logger.info("Processing user message", { 
            messageLength: inputs.userMessage.length,
        });

        try {
            const systemPrompts = getSystemPromptWithProjectContext(SYSTEM_PROMPT, context, false);
            const messages = [...pastMessages, {...createUserMessage(userMessage), conversationId: IdGenerator.generateConversationId()}];

            let extractedUserResponse = "";
            let extractedEnhancedRequest = "";
            
            // Generate unique conversation ID for this turn
            const aiConversationId = IdGenerator.generateConversationId();

            logger.info("Generated conversation ID", { aiConversationId });
            // Get available tools for the conversation
            const tools = [
                toolWebSearchDefinition,
                toolWeatherDefinition,
                buildEditAppTool((modificationRequest) => {
                    logger.info("Received app edit request", { modificationRequest }); 
                    extractedEnhancedRequest = modificationRequest;
                })
            ]

            logger.info("Executing inference for user message", { 
                messageLength: userMessage.length,
                aiConversationId,
                tools
            });
            
            // Don't save the system prompts so that every time new initial prompts can be generated with latest project context
            const result = await executeInference({
                env: env,
                messages: [...systemPrompts, ...messages],
                agentActionName: "conversationalResponse",
                context: options.inferenceContext,
                tools, // Enable tools for the conversational AI
                stream: {
                    onChunk: (chunk) => {
                        logger.info("Processing user message chunk", { chunkLength: chunk.length });
                        inputs.conversationResponseCallback(chunk, aiConversationId, true);
                        extractedUserResponse += chunk;
                    },
                    chunk_size: CHUNK_SIZE
                }
            });

            
            logger.info("Successfully processed user message", {
                streamingSuccess: !!extractedUserResponse,
                hasEnhancedRequest: !!extractedEnhancedRequest,
            });

            const conversationResponse: ConversationalResponseType = {
                enhancedUserRequest: extractedEnhancedRequest,
                userResponse: extractedUserResponse
            };

            // Save the assistant's response to conversation history
            messages.push({...createAssistantMessage(result.string), conversationId: IdGenerator.generateConversationId()});

            return {
                conversationResponse,
                messages: messages
            };
        } catch (error) {
            logger.error("Error processing user message:", error);
            if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
                throw error;
            }   
            
            // Fallback response
            return {
                conversationResponse: {
                    enhancedUserRequest: `User request: ${userMessage}`,
                    userResponse: FALLBACK_USER_RESPONSE
                },
                messages: [
                    ...pastMessages,
                    {...createUserMessage(userMessage), conversationId: IdGenerator.generateConversationId()},
                    {...createAssistantMessage(FALLBACK_USER_RESPONSE), conversationId: IdGenerator.generateConversationId()}
                ]
            };
        }
    }

    processProjectUpdates<T extends ProjectUpdateType>(updateType: T, _data: WebSocketMessageData<T>, logger: StructuredLogger) : ConversationMessage[] {
        try {
            logger.info("Processing project update", { updateType });

            // Just save it as an assistant message. Dont save data for now to avoid DO size issues
            const preparedMessage = `**<Internal Memo>**
Project Updates: ${updateType}
</Internal Memo>`;

            return [{
                role: 'assistant',
                content: preparedMessage,
                conversationId: IdGenerator.generateConversationId()
            }];
        } catch (error) {
            logger.error("Error processing project update:", error);
            return [];
        }
    }

    isProjectUpdateType(type: any): type is ProjectUpdateType {
        return RelevantProjectUpdateWebsoketMessages.includes(type);
    }
}