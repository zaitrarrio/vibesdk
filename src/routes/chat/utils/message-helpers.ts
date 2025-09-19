import { toast } from 'sonner';
import { generateId } from '@/utils/id-generator';
import type { RateLimitError } from '@/api-types';

export type ChatMessage = {
    type: 'user' | 'ai';
    id: string;
    message: string;
    isThinking?: boolean;
};

/**
 * Check if a message ID should appear in conversational chat
 */
export function isConversationalMessage(messageId: string): boolean {
    const conversationalIds = [
        'main',
        'creating-blueprint',
        'conversation_response',
        'fetching-chat',
        'chat-not-found',
        'resuming-chat',
        'chat-welcome',
        'deployment-status',
        'code_reviewed',
    ];
    
    return conversationalIds.includes(messageId) || messageId.startsWith('conv-');
}

/**
 * Create an AI message
 */
export function createAIMessage(
    id: string,
    message: string,
    isThinking?: boolean
): ChatMessage {
    return {
        type: 'ai',
        id,
        message,
        isThinking,
    };
}

/**
 * Create a user message
 */
export function createUserMessage(message: string): ChatMessage {
    return {
        type: 'user',
        id: generateId(),
        message,
    };
}

/**
 * Handle rate limit errors consistently
 */
export function handleRateLimitError(
    rateLimitError: RateLimitError,
    onDebugMessage?: (
        type: 'error' | 'warning' | 'info' | 'websocket',
        message: string,
        details?: string,
        source?: string,
        messageType?: string,
        rawMessage?: unknown
    ) => void
): ChatMessage {
    let displayMessage = rateLimitError.message;
    
    if (rateLimitError.suggestions && rateLimitError.suggestions.length > 0) {
        displayMessage += `\n\n💡 Suggestions:\n${rateLimitError.suggestions.map(s => `• ${s}`).join('\n')}`;
    }
    
    toast.error(displayMessage);
    
    onDebugMessage?.(
        'error',
        `Rate Limit: ${rateLimitError.limitType.replace('_', ' ')} limit exceeded`,
        `Limit: ${rateLimitError.limit} per ${Math.floor((rateLimitError.period || 0) / 3600)}h\nRetry after: ${(rateLimitError.period || 0) / 3600}h\n\nSuggestions:\n${rateLimitError.suggestions?.join('\n') || 'None'}`,
        'Rate Limiting',
        rateLimitError.limitType,
        rateLimitError
    );
    
    return createAIMessage(
        `rate_limit_${Date.now()}`,
        `⏱️ ${displayMessage}`
    );
}

/**
 * Add or update a message in the messages array
 */
export function addOrUpdateMessage(
    messages: ChatMessage[],
    newMessage: Omit<ChatMessage, 'type'>,
    messageType: 'ai' | 'user' = 'ai'
): ChatMessage[] {
    // Special handling for 'main' message - update if thinking, otherwise append
    if (newMessage.id === 'main') {
        const mainMessageIndex = messages.findIndex(m => m.id === 'main' && m.isThinking);
        if (mainMessageIndex !== -1) {
            return messages.map((msg, index) =>
                index === mainMessageIndex 
                    ? { ...msg, ...newMessage, type: messageType }
                    : msg
            );
        }
    }
    
    // For all other messages, append
    return [...messages, { ...newMessage, type: messageType }];
}

/**
 * Handle streaming conversation messages
 */
export function handleStreamingMessage(
    messages: ChatMessage[],
    messageId: string,
    chunk: string,
    isNewMessage: boolean
): ChatMessage[] {
    const existingMessageIndex = messages.findIndex(m => m.id === messageId && m.type === 'ai');
    
    if (existingMessageIndex !== -1 && !isNewMessage) {
        // Append chunk to existing message
        return messages.map((msg, index) =>
            index === existingMessageIndex
                ? { ...msg, message: msg.message + chunk }
                : msg
        );
    } else {
        // Create new streaming message
        return [...messages, createAIMessage(messageId, chunk, false)];
    }
}
