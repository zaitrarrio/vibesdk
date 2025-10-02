import { Agent, Connection } from 'agents';
import { StructuredLogger } from '@worker/logger';
import { CodeGenState } from './state';
import { AgentInitArgs } from './types';

/**
 * Base agent class providing common functionality for all code generation agents
 */
export abstract class BaseAgent extends Agent<Env, CodeGenState> {
  protected readonly logger: StructuredLogger;
  protected readonly operations: Record<string, unknown> = {};

  constructor() {
    super();
    this.logger = this.createLogger();
  }

  /**
   * Create a structured logger for this agent
   */
  protected createLogger(): StructuredLogger {
    return this.logger || this.createDefaultLogger();
  }

  /**
   * Create a default logger implementation
   */
  private createDefaultLogger(): StructuredLogger {
    return {
      debug: (message: string, data?: Record<string, unknown>) => {
        console.debug(`[DEBUG] ${message}`, data);
      },
      info: (message: string, data?: Record<string, unknown>) => {
        console.info(`[INFO] ${message}`, data);
      },
      warn: (message: string, data?: Record<string, unknown>) => {
        console.warn(`[WARN] ${message}`, data);
      },
      error: (message: string, data?: Record<string, unknown>) => {
        console.error(`[ERROR] ${message}`, data);
      },
    };
  }

  /**
   * Initialize the agent with required arguments
   */
  abstract initialize(initArgs: AgentInitArgs): Promise<CodeGenState>;

  /**
   * Generate all files for the project
   */
  abstract generateAllFiles(reviewCycles?: number): Promise<void>;

  /**
   * Handle WebSocket connections
   */
  protected handleConnection(connection: Connection): void {
    this.logger.info('New WebSocket connection established', {
      connectionId: connection.id,
      agentId: this.id,
    });
  }

  /**
   * Handle WebSocket disconnections
   */
  protected handleDisconnection(connection: Connection): void {
    this.logger.info('WebSocket connection closed', {
      connectionId: connection.id,
      agentId: this.id,
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  protected broadcast(type: string, data: unknown): void {
    this.logger.debug('Broadcasting message', { type, data });
    // Implementation would broadcast to all connections
  }

  /**
   * Send message to specific connection
   */
  protected sendToConnection(connection: Connection, type: string, data: unknown): void {
    try {
      const message = { type, ...data };
      connection.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error('Error sending message to connection', { error });
    }
  }

  /**
   * Validate agent state
   */
  protected validateState(): boolean {
    if (!this.state) {
      this.logger.error('Agent state is not initialized');
      return false;
    }
    return true;
  }

  /**
   * Get agent configuration
   */
  protected getConfig(): Record<string, unknown> {
    return this.state?.config || {};
  }

  /**
   * Update agent configuration
   */
  protected updateConfig(config: Record<string, unknown>): void {
    if (this.state) {
      this.setState({
        ...this.state,
        config: { ...this.state.config, ...config },
      });
    }
  }
}