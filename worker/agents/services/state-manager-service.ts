import { StructuredLogger } from '@worker/logger';
import { CodeGenState } from '../core/state';

export interface StateManagerConfig {
  logger: StructuredLogger;
  maxHistorySize: number;
  enablePersistence: boolean;
}

export interface StateSnapshot {
  state: CodeGenState;
  timestamp: number;
  version: number;
}

export class StateManagerService {
  private readonly logger: StructuredLogger;
  private readonly config: StateManagerConfig;
  private currentState: CodeGenState | null = null;
  private stateHistory: StateSnapshot[] = [];
  private stateVersion = 0;

  constructor(config: StateManagerConfig) {
    this.logger = config.logger;
    this.config = config;
  }

  /**
   * Initialize state
   */
  initializeState(initialState: CodeGenState): void {
    this.currentState = { ...initialState };
    this.stateVersion = 0;
    this.stateHistory = [];
    
    this.saveSnapshot();
    this.logger.info('State initialized', { version: this.stateVersion });
  }

  /**
   * Get current state
   */
  getCurrentState(): CodeGenState | null {
    return this.currentState ? { ...this.currentState } : null;
  }

  /**
   * Update state
   */
  updateState(updates: Partial<CodeGenState>): void {
    if (!this.currentState) {
      throw new Error('State not initialized');
    }

    const previousState = { ...this.currentState };
    this.currentState = { ...this.currentState, ...updates };
    this.stateVersion++;

    this.saveSnapshot();
    
    this.logger.debug('State updated', {
      version: this.stateVersion,
      updates: Object.keys(updates),
    });
  }

  /**
   * Set complete state
   */
  setState(newState: CodeGenState): void {
    const previousState = this.currentState;
    this.currentState = { ...newState };
    this.stateVersion++;

    this.saveSnapshot();
    
    this.logger.info('State set', {
      version: this.stateVersion,
      hasPreviousState: !!previousState,
    });
  }

  /**
   * Get state property
   */
  getStateProperty<K extends keyof CodeGenState>(key: K): CodeGenState[K] | undefined {
    return this.currentState?.[key];
  }

  /**
   * Update state property
   */
  updateStateProperty<K extends keyof CodeGenState>(
    key: K,
    value: CodeGenState[K]
  ): void {
    if (!this.currentState) {
      throw new Error('State not initialized');
    }

    this.updateState({ [key]: value });
  }

  /**
   * Save state snapshot
   */
  private saveSnapshot(): void {
    if (!this.currentState) {
      return;
    }

    const snapshot: StateSnapshot = {
      state: { ...this.currentState },
      timestamp: Date.now(),
      version: this.stateVersion,
    };

    this.stateHistory.push(snapshot);

    // Limit history size
    if (this.stateHistory.length > this.config.maxHistorySize) {
      this.stateHistory = this.stateHistory.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Get state history
   */
  getStateHistory(): StateSnapshot[] {
    return [...this.stateHistory];
  }

  /**
   * Get state at specific version
   */
  getStateAtVersion(version: number): CodeGenState | null {
    const snapshot = this.stateHistory.find(s => s.version === version);
    return snapshot ? { ...snapshot.state } : null;
  }

  /**
   * Rollback to previous state
   */
  rollbackToPrevious(): boolean {
    if (this.stateHistory.length < 2) {
      this.logger.warn('No previous state to rollback to');
      return false;
    }

    const previousSnapshot = this.stateHistory[this.stateHistory.length - 2];
    this.currentState = { ...previousSnapshot.state };
    this.stateVersion = previousSnapshot.version;

    // Remove current state from history
    this.stateHistory.pop();

    this.logger.info('Rolled back to previous state', {
      version: this.stateVersion,
    });

    return true;
  }

  /**
   * Rollback to specific version
   */
  rollbackToVersion(version: number): boolean {
    const targetSnapshot = this.stateHistory.find(s => s.version === version);
    if (!targetSnapshot) {
      this.logger.warn('Target version not found', { version });
      return false;
    }

    this.currentState = { ...targetSnapshot.state };
    this.stateVersion = version;

    // Remove states after target version
    this.stateHistory = this.stateHistory.filter(s => s.version <= version);

    this.logger.info('Rolled back to specific version', { version });
    return true;
  }

  /**
   * Clear state history
   */
  clearHistory(): void {
    this.stateHistory = [];
    this.logger.info('State history cleared');
  }

  /**
   * Export state to JSON
   */
  exportState(): string {
    const exportData = {
      currentState: this.currentState,
      version: this.stateVersion,
      history: this.stateHistory,
      timestamp: Date.now(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import state from JSON
   */
  importState(jsonData: string): void {
    try {
      const importData = JSON.parse(jsonData);
      
      if (importData.currentState) {
        this.currentState = importData.currentState;
      }
      
      if (typeof importData.version === 'number') {
        this.stateVersion = importData.version;
      }
      
      if (Array.isArray(importData.history)) {
        this.stateHistory = importData.history;
      }

      this.logger.info('State imported successfully', {
        version: this.stateVersion,
        historyLength: this.stateHistory.length,
      });
    } catch (error) {
      this.logger.error('Failed to import state', { error });
      throw new Error('Failed to import state');
    }
  }

  /**
   * Validate state
   */
  validateState(): boolean {
    if (!this.currentState) {
      this.logger.error('State is null');
      return false;
    }

    // Add validation logic here
    return true;
  }

  /**
   * Get state statistics
   */
  getStateStatistics(): Record<string, unknown> {
    return {
      currentVersion: this.stateVersion,
      historyLength: this.stateHistory.length,
      hasState: !!this.currentState,
      lastUpdate: this.stateHistory.length > 0 
        ? this.stateHistory[this.stateHistory.length - 1].timestamp 
        : null,
    };
  }
}