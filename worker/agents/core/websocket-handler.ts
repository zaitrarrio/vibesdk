import { Connection } from 'agents';
import { WebSocketMessageData, WebSocketMessageType } from '@worker/api/websocket-types';
import { WebSocketMessageResponses } from '../constants';
import { StructuredLogger } from '@worker/logger';

export interface WebSocketHandlerConfig {
    logger: StructuredLogger;
    broadcast: (type: string, data: unknown) => void;
    sendToConnection: (connection: Connection, type: string, data: unknown) => void;
}

export class WebSocketHandler {
    private readonly logger: StructuredLogger;
    private readonly broadcast: (type: string, data: unknown) => void;
    private readonly sendToConnection: (connection: Connection, type: string, data: unknown) => void;

    constructor(config: WebSocketHandlerConfig) {
        this.logger = config.logger;
        this.broadcast = config.broadcast;
        this.sendToConnection = config.sendToConnection;
    }

    /**
     * Handle incoming WebSocket messages
     */
    async handleMessage(
        connection: Connection,
        message: WebSocketMessageData
    ): Promise<void> {
        try {
            this.logger.debug('Handling WebSocket message:', { 
                type: message.type,
                connectionId: connection.id 
            });

            switch (message.type) {
                case WebSocketMessageType.TERMINAL_COMMAND:
                    await this.handleTerminalCommand(connection, message.data);
                    break;
                
                case WebSocketMessageType.USER_MESSAGE:
                    await this.handleUserMessage(connection, message.data);
                    break;
                
                case WebSocketMessageType.PING:
                    await this.handlePing(connection);
                    break;
                
                default:
                    this.logger.warn('Unknown WebSocket message type:', { type: message.type });
                    break;
            }
        } catch (error) {
            this.logger.error('Error handling WebSocket message:', error);
            this.sendErrorResponse(connection, 'Failed to process message');
        }
    }

    /**
     * Handle terminal command messages
     */
    private async handleTerminalCommand(
        connection: Connection,
        data: unknown
    ): Promise<void> {
        const command = this.extractCommand(data);
        if (!command) {
            this.sendErrorResponse(connection, 'Invalid command data');
            return;
        }

        // Delegate to terminal executor
        // This would be injected as a dependency
        this.logger.info('Terminal command received:', { command });
    }

    /**
     * Handle user message
     */
    private async handleUserMessage(
        connection: Connection,
        data: unknown
    ): Promise<void> {
        const message = this.extractMessage(data);
        if (!message) {
            this.sendErrorResponse(connection, 'Invalid message data');
            return;
        }

        this.logger.info('User message received:', { message });
    }

    /**
     * Handle ping messages
     */
    private async handlePing(connection: Connection): Promise<void> {
        this.sendToConnection(connection, WebSocketMessageResponses.PONG, {
            timestamp: Date.now()
        });
    }

    /**
     * Send error response to connection
     */
    private sendErrorResponse(connection: Connection, message: string): void {
        this.sendToConnection(connection, WebSocketMessageResponses.ERROR, {
            message,
            timestamp: Date.now()
        });
    }

    /**
     * Extract command from message data
     */
    private extractCommand(data: unknown): string | null {
        if (typeof data === 'string') {
            return data;
        }
        
        if (typeof data === 'object' && data !== null && 'command' in data) {
            const commandData = data as { command: unknown };
            return typeof commandData.command === 'string' ? commandData.command : null;
        }
        
        return null;
    }

    /**
     * Extract message from message data
     */
    private extractMessage(data: unknown): string | null {
        if (typeof data === 'string') {
            return data;
        }
        
        if (typeof data === 'object' && data !== null && 'message' in data) {
            const messageData = data as { message: unknown };
            return typeof messageData.message === 'string' ? messageData.message : null;
        }
        
        return null;
    }
}