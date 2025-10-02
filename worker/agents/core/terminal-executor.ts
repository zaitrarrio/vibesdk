import { Connection } from 'agents';
import { WebSocketMessageResponses } from '../constants';
import { StructuredLogger } from '@worker/logger';

export interface TerminalOutput {
    output: string;
    outputType: 'stdout' | 'stderr';
    timestamp: number;
}

export interface TerminalExecutorConfig {
    logger: StructuredLogger;
    broadcast: (type: string, data: unknown) => void;
    sendToConnection: (connection: Connection, type: string, data: unknown) => void;
}

export class TerminalExecutor {
    private readonly logger: StructuredLogger;
    private readonly broadcast: (type: string, data: unknown) => void;
    private readonly sendToConnection: (connection: Connection, type: string, data: unknown) => void;

    constructor(config: TerminalExecutorConfig) {
        this.logger = config.logger;
        this.broadcast = config.broadcast;
        this.sendToConnection = config.sendToConnection;
    }

    /**
     * Execute a terminal command and stream output
     */
    async executeCommand(
        command: string,
        connection?: Connection
    ): Promise<void> {
        try {
            this.logger.debug('Executing terminal command:', { command });

            // Simulate command execution (replace with actual implementation)
            const output: TerminalOutput = {
                output: `$ ${command}\nExecuting command...\nCommand completed successfully.`,
                outputType: 'stdout',
                timestamp: Date.now()
            };

            if (connection) {
                this.sendToConnection(connection, WebSocketMessageResponses.TERMINAL_OUTPUT, output);
            } else {
                this.broadcast(WebSocketMessageResponses.TERMINAL_OUTPUT, output);
            }

            // Simulate exit code
            const exitCodeMessage = {
                output: `Exit code: 0`,
                outputType: 'stdout' as const,
                timestamp: Date.now()
            };

            if (connection) {
                this.sendToConnection(connection, WebSocketMessageResponses.TERMINAL_OUTPUT, exitCodeMessage);
            } else {
                this.broadcast(WebSocketMessageResponses.TERMINAL_OUTPUT, exitCodeMessage);
            }

        } catch (error) {
            this.logger.error('Error executing terminal command:', error);

            const errorMessage: TerminalOutput = {
                output: `Error: ${error instanceof Error ? error.message : String(error)}`,
                outputType: 'stderr',
                timestamp: Date.now()
            };

            if (connection) {
                this.sendToConnection(connection, WebSocketMessageResponses.TERMINAL_OUTPUT, errorMessage);
            } else {
                this.broadcast(WebSocketMessageResponses.TERMINAL_OUTPUT, errorMessage);
            }
        }
    }

    /**
     * Send a server log message to terminals
     */
    broadcastServerLog(
        message: string,
        level: 'info' | 'warn' | 'error' | 'debug' = 'info',
        source?: string
    ): void {
        this.broadcast(WebSocketMessageResponses.SERVER_LOG, {
            message,
            level,
            timestamp: Date.now(),
            source
        });
    }
}