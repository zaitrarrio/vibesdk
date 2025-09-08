import { ConversationalResponseType } from "../schemas";
import { createAssistantMessage, createUserMessage } from "../inferutils/common";
import { executeInference } from "../inferutils/infer";
import { getSystemPromptWithProjectContext } from "./common";
import { WebSocketMessageResponses } from "../constants";
import { WebSocketMessageData } from "../../api/websocketTypes";
import { AgentOperation, OperationOptions } from "../operations/common";
import { ConversationMessage } from "../inferutils/common";
import { StructuredLogger } from "../../logger";
import { getToolDefinitions } from "../tools/customTools";
import { XmlStreamFormat, XmlParsingState, XmlStreamingCallbacks } from "../streaming-formats/xml-stream";
import { IdGenerator } from "../utils/idGenerator";

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

const SYSTEM_PROMPT = `You are a Customer Success Representative at Cloudflare's AI development platform. Your role is to understand user feedback and translate it into actionable development requests.

## RESPONSE EXAMPLES:

**Example 1 - Feature Request:**
User: "I want to add a dark mode toggle"
Response:
<user_response>
Great idea! I'll pass along your request for a dark mode toggle. This will be implemented in the next development phase, which should take just a few minutes.
</user_response>
<enhanced_user_request>
Implement a dark mode toggle that switches between light and dark themes across the entire application
</enhanced_user_request>

**Example 2 - Bug Report:**
User: "The login button doesn't work on mobile"
Response:
<user_response>
Thanks for reporting this issue. I've noted the mobile login problem and our development team will fix this in the next phase.
</user_response>
<enhanced_user_request>
Fix the login button functionality on mobile devices - ensure it's properly sized and responsive
</enhanced_user_request>

**Example 3 - General Question:**
User: "How's the project coming along?"
Response:
<user_response>
The project is progressing well! The development team is working through the phases systematically. Is there anything specific you'd like to see added or changed?
</user_response>

## RULES:
- Be friendly and encouraging
- Always acknowledge user requests will be handled "in the next phase"
- Transform vague requests into specific technical requirements
- Don't provide implementation details or code
- Use the XML format with user_response (always) and enhanced_user_request (only for changes)

## Original User Requirement:
{{query}}

## OUTPUT FORMAT:
Always use this exact XML structure:

---------START---------
<user_response>
[Your friendly response to the user]
</user_response>

<enhanced_user_request>
[Technical request for development team - ONLY if user wants changes]
</enhanced_user_request>
---------END---------

**Key Points:**
- Always include <user_response>
- Only include <enhanced_user_request> for actual change requests
- For questions/comments, omit <enhanced_user_request>
- Be specific in enhanced requests
`;

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
            
            // Initialize robust XML streaming parser
            const xmlParser = new XmlStreamFormat();
            const xmlConfig = {
                targetElements: ['user_response', 'enhanced_user_request'],
                streamingElements: ['user_response'],
                caseSensitive: false,
                maxBufferSize: 10000
            };
            let xmlState: XmlParsingState = xmlParser.initializeXmlState(xmlConfig);
            
            // Get available tools for the conversation
            const tools = await getToolDefinitions();
            
            // XML streaming callbacks
            const xmlCallbacks: XmlStreamingCallbacks = {
                onElementContent: (tagName: string, content: string, isComplete: boolean) => {
                    if (tagName.toLowerCase() === 'user_response') {
                        extractedUserResponse += content;
                        // Stream to frontend
                        inputs.conversationResponseCallback(content, aiConversationId, true);
                        logger.info("Streamed user_response content", { 
                            length: content.length, 
                            isComplete,
                            totalLength: extractedUserResponse.length 
                        });
                    }
                },
                onElementComplete: (element) => {
                    if (element.tagName.toLowerCase() === 'enhanced_user_request') {
                        extractedEnhancedRequest = element.content.trim();
                        logger.info("Extracted enhanced_user_request", { length: extractedEnhancedRequest.length });
                    } else if (element.tagName.toLowerCase() === 'user_response') {
                        logger.info("Completed user_response streaming", { totalLength: extractedUserResponse.length });
                    }
                },
                onParsingError: (error) => {
                    logger.warn("XML parsing error in conversation response", { error });
                }
            };
            
            // Don't save the system prompts so that every time new initial prompts can be generated with latest project context
            const result = await executeInference({
                env: env,
                messages: [...systemPrompts, ...messages],
                agentActionName: "conversationalResponse",
                context: options.inferenceContext,
                tools, // Enable tools for the conversational AI
                stream: {
                    onChunk: (chunk) => {
                        logger.info("Processing user message chunk", { 
                            chunkLength: chunk.length,
                            hasXmlState: !!xmlState
                        });
                        
                        // Process chunk through XML parser
                        xmlState = xmlParser.parseXmlStream(chunk, xmlState, xmlCallbacks);
                    },
                    chunk_size: CHUNK_SIZE
                }
            });

            // Finalize XML parsing to extract any remaining content
            const finalElements = xmlParser.finalizeXmlParsing(xmlState);
            
            // Extract final values if not already captured during streaming
            if (!extractedUserResponse) {
                const userResponseElements = finalElements.get('user_response');
                if (userResponseElements && userResponseElements.length > 0) {
                    extractedUserResponse = userResponseElements[0].content.trim();
                }
                if (!extractedUserResponse) {
                    logger.warn("Failed to extract user response from XML", { xmlState }, "raw response", result.string);
                    extractedUserResponse = result.string;
                }
                inputs.conversationResponseCallback(extractedUserResponse, aiConversationId, false);
            }
            
            if (!extractedEnhancedRequest) {
                const enhancedElements = finalElements.get('enhanced_user_request');
                if (enhancedElements && enhancedElements.length > 0) {
                    extractedEnhancedRequest = enhancedElements[0].content.trim();
                }
            }

            // Use the parsed values from streaming, fallback to original user message if parsing failed
            const finalEnhancedRequest = extractedEnhancedRequest || userMessage;
            const finalUserResponse = extractedUserResponse || "I understand you'd like to make some changes to your project. Let me pass this along to the development team.";

            const parsingErrors = xmlState.hasParsingErrors;
            const errorMessages = xmlState.errorMessages;
            
            logger.info("Successfully processed user message", {
                finalEnhancedRequest,
                finalUserResponse,
                streamingSuccess: !!extractedUserResponse,
                hasEnhancedRequest: !!extractedEnhancedRequest,
                xmlParsingErrors: parsingErrors,
                xmlErrorMessages: errorMessages
            });

            const conversationResponse: ConversationalResponseType = {
                enhancedUserRequest: finalEnhancedRequest,
                userResponse: finalUserResponse
            };

            // Save the assistant's response to conversation history
            messages.push({...createAssistantMessage(result.string), conversationId: IdGenerator.generateConversationId()});

            return {
                conversationResponse,
                messages: messages
            };
        } catch (error) {
            logger.error("Error processing user message:", error);
            
            // Fallback response
            return {
                conversationResponse: {
                    enhancedUserRequest: `User request: ${userMessage}`,
                    userResponse: "I received your message and I'm passing it along to our development team. They'll incorporate your feedback in the next phase of development."
                },
                messages: [
                    ...pastMessages,
                    {...createUserMessage(userMessage), conversationId: IdGenerator.generateConversationId()},
                    {...createAssistantMessage("I received your message and I'm passing it along to our development team. They'll incorporate your feedback in the next phase of development."), conversationId: IdGenerator.generateConversationId()}
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