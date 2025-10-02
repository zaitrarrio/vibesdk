import { BaseAgent } from './base-agent';
import { FileManagerService } from '../services/file-manager-service';
import { StateManagerService } from '../services/state-manager-service';
import { CodeGenState, CurrentDevState, MAX_PHASES } from './state';
import { AgentInitArgs, PhaseExecutionResult } from './types';
import { StructuredLogger } from '@worker/logger';
import { WebSocketMessageResponses } from '../constants';

export interface SimpleGeneratorAgentConfig {
  logger: StructuredLogger;
  maxFileSize: number;
  allowedExtensions: string[];
  maxHistorySize: number;
  enablePersistence: boolean;
}

/**
 * Refactored SimpleCodeGeneratorAgent with improved modularity and dependency injection
 */
export class SimpleGeneratorAgentRefactored extends BaseAgent {
  private readonly fileManager: FileManagerService;
  private readonly stateManager: StateManagerService;
  private readonly config: SimpleGeneratorAgentConfig;

  constructor(config: SimpleGeneratorAgentConfig) {
    super();
    this.config = config;
    
    // Initialize services with dependency injection
    this.fileManager = new FileManagerService({
      logger: config.logger,
      maxFileSize: config.maxFileSize,
      allowedExtensions: config.allowedExtensions,
    });

    this.stateManager = new StateManagerService({
      logger: config.logger,
      maxHistorySize: config.maxHistorySize,
      enablePersistence: config.enablePersistence,
    });
  }

  /**
   * Initialize the agent with project blueprint and template
   */
  async initialize(initArgs: AgentInitArgs): Promise<CodeGenState> {
    this.logger.info('Initializing SimpleCodeGeneratorAgent', {
      queryLength: initArgs.query.length,
      userId: initArgs.userId,
      sessionId: initArgs.sessionId,
    });

    const initialState: CodeGenState = {
      agentMode: 'deterministic',
      query: initArgs.query,
      userId: initArgs.userId,
      sessionId: initArgs.sessionId,
      initialized: true,
      currentPhase: 0,
      maxPhases: MAX_PHASES,
      files: [],
      issues: [],
      blueprint: null,
      config: {},
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };

    this.stateManager.initializeState(initialState);
    this.setState(initialState);

    this.logger.info('Agent initialized successfully');
    return initialState;
  }

  /**
   * Generate all files for the project
   */
  async generateAllFiles(reviewCycles: number = 10): Promise<void> {
    this.logger.info('Starting file generation', { reviewCycles });

    if (!this.validateState()) {
      throw new Error('Agent state is not valid');
    }

    try {
      // Generate blueprint if not exists
      await this.generateBlueprint();

      // Generate files phase by phase
      await this.generatePhases();

      // Run review cycles
      await this.runReviewCycles(reviewCycles);

      this.logger.info('File generation completed successfully');
    } catch (error) {
      this.logger.error('File generation failed', { error });
      throw error;
    }
  }

  /**
   * Generate project blueprint
   */
  private async generateBlueprint(): Promise<void> {
    this.logger.info('Generating project blueprint');

    const currentState = this.stateManager.getCurrentState();
    if (!currentState) {
      throw new Error('State not initialized');
    }

    // Mock blueprint generation
    const blueprint = {
      id: 'blueprint-1',
      name: 'Project Blueprint',
      phases: [
        { id: 1, name: 'Setup', description: 'Initial project setup' },
        { id: 2, name: 'Core Features', description: 'Core functionality' },
        { id: 3, name: 'UI Components', description: 'User interface' },
      ],
      createdAt: Date.now(),
    };

    this.stateManager.updateStateProperty('blueprint', blueprint);
    this.setState(this.stateManager.getCurrentState()!);

    this.logger.info('Blueprint generated', { phases: blueprint.phases.length });
  }

  /**
   * Generate files phase by phase
   */
  private async generatePhases(): Promise<void> {
    this.logger.info('Generating files phase by phase');

    const currentState = this.stateManager.getCurrentState();
    if (!currentState?.blueprint) {
      throw new Error('Blueprint not found');
    }

    for (const phase of currentState.blueprint.phases) {
      await this.generatePhase(phase.id, phase.name);
    }

    this.logger.info('All phases generated');
  }

  /**
   * Generate a specific phase
   */
  private async generatePhase(phaseId: number, phaseName: string): Promise<void> {
    this.logger.info('Generating phase', { phaseId, phaseName });

    // Mock file generation for this phase
    const files = this.generatePhaseFiles(phaseId, phaseName);

    for (const file of files) {
      this.fileManager.createFile(file.path, file.content);
    }

    // Update state with new files
    const currentState = this.stateManager.getCurrentState();
    if (currentState) {
      const updatedFiles = this.fileManager.getAllFiles();
      this.stateManager.updateStateProperty('files', updatedFiles);
      this.setState(this.stateManager.getCurrentState()!);
    }

    this.logger.info('Phase generated', { phaseId, filesCount: files.length });
  }

  /**
   * Generate files for a specific phase
   */
  private generatePhaseFiles(phaseId: number, phaseName: string): Array<{ path: string; content: string }> {
    const files: Array<{ path: string; content: string }> = [];

    switch (phaseId) {
      case 1: // Setup
        files.push(
          {
            path: 'package.json',
            content: JSON.stringify({
              name: 'generated-project',
              version: '1.0.0',
              dependencies: {},
            }, null, 2),
          },
          {
            path: 'README.md',
            content: '# Generated Project\n\nThis is a generated project.',
          }
        );
        break;

      case 2: // Core Features
        files.push(
          {
            path: 'src/index.js',
            content: 'console.log("Hello, World!");',
          },
          {
            path: 'src/utils.js',
            content: 'export const helper = () => {};',
          }
        );
        break;

      case 3: // UI Components
        files.push(
          {
            path: 'src/components/App.jsx',
            content: 'export const App = () => <div>Hello World</div>;',
          },
          {
            path: 'src/components/Button.jsx',
            content: 'export const Button = ({ children }) => <button>{children}</button>;',
          }
        );
        break;
    }

    return files;
  }

  /**
   * Run review cycles to fix issues
   */
  private async runReviewCycles(reviewCycles: number): Promise<void> {
    this.logger.info('Running review cycles', { reviewCycles });

    for (let cycle = 1; cycle <= reviewCycles; cycle++) {
      this.logger.debug('Review cycle', { cycle });

      // Mock review process
      const issues = this.detectIssues();
      
      if (issues.length === 0) {
        this.logger.info('No issues found, review complete', { cycle });
        break;
      }

      // Fix issues
      await this.fixIssues(issues);
      
      this.logger.debug('Review cycle completed', { cycle, issuesFixed: issues.length });
    }

    this.logger.info('All review cycles completed');
  }

  /**
   * Detect issues in generated files
   */
  private detectIssues(): Array<{ file: string; issue: string }> {
    // Mock issue detection
    const issues: Array<{ file: string; issue: string }> = [];
    
    const files = this.fileManager.getAllFiles();
    for (const file of files) {
      if (file.content.includes('TODO')) {
        issues.push({
          file: file.path,
          issue: 'Contains TODO comment',
        });
      }
    }

    return issues;
  }

  /**
   * Fix detected issues
   */
  private async fixIssues(issues: Array<{ file: string; issue: string }>): Promise<void> {
    this.logger.info('Fixing issues', { count: issues.length });

    for (const issue of issues) {
      const file = this.fileManager.getFile(issue.file);
      if (file) {
        // Mock issue fixing
        const fixedContent = file.content.replace(/TODO/g, 'FIXED');
        this.fileManager.updateFile(issue.file, fixedContent);
      }
    }

    // Update state with fixed files
    const currentState = this.stateManager.getCurrentState();
    if (currentState) {
      const updatedFiles = this.fileManager.getAllFiles();
      this.stateManager.updateStateProperty('files', updatedFiles);
      this.setState(this.stateManager.getCurrentState()!);
    }
  }

  /**
   * Get file manager service
   */
  getFileManager(): FileManagerService {
    return this.fileManager;
  }

  /**
   * Get state manager service
   */
  getStateManager(): StateManagerService {
    return this.stateManager;
  }

  /**
   * Export agent state
   */
  exportState(): string {
    return this.stateManager.exportState();
  }

  /**
   * Import agent state
   */
  importState(jsonData: string): void {
    this.stateManager.importState(jsonData);
    this.setState(this.stateManager.getCurrentState()!);
  }
}