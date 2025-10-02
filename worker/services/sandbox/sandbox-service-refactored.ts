import { getSandbox, Sandbox, ExecuteResponse } from '@cloudflare/sandbox';
import { StructuredLogger } from '@worker/logger';
import { BaseSandboxService } from './base-sandbox-service';
import { ResourceProvisioner } from './resource-provisioner';
import { TemplateParser } from './template-parser';
import { GitHubService } from '@worker/services/github/github-service';
import { DeployerService } from '@worker/services/deployer/deployer-service';
import { CodeFixerService } from '@worker/services/code-fixer/code-fixer-service';
import type {
  TemplateDetailsResponse,
  BootstrapResponse,
  GetInstanceResponse,
  BootstrapStatusResponse,
  ShutdownResponse,
  WriteFilesRequest,
  WriteFilesResponse,
  GetFilesResponse,
  ExecuteCommandsResponse,
  RuntimeErrorResponse,
  ClearErrorsResponse,
  StaticAnalysisResponse,
  DeploymentResult,
  FileTreeNode,
  RuntimeError,
  CommandExecutionResult,
  CodeIssue,
  InstanceDetails,
  LintSeverity,
  TemplateInfo,
  TemplateDetails,
  GitHubPushRequest,
  GitHubPushResponse,
  GitHubExportRequest,
  GitHubExportResponse,
  GetLogsResponse,
  ListInstancesResponse,
  StoredError,
} from './sandbox-types';

export interface SandboxServiceConfig {
  logger: StructuredLogger;
  resourceProvisioner: ResourceProvisioner;
  templateParser: TemplateParser;
  githubService: GitHubService;
  deployerService: DeployerService;
  codeFixerService: CodeFixerService;
}

export interface SandboxInstance {
  id: string;
  status: 'creating' | 'running' | 'stopped' | 'error';
  createdAt: number;
  lastAccessed: number;
  template?: TemplateInfo;
  errors: RuntimeError[];
  logs: string[];
}

export class SandboxServiceRefactored extends BaseSandboxService {
  private readonly logger: StructuredLogger;
  private readonly resourceProvisioner: ResourceProvisioner;
  private readonly templateParser: TemplateParser;
  private readonly githubService: GitHubService;
  private readonly deployerService: DeployerService;
  private readonly codeFixerService: CodeFixerService;
  private readonly instances: Map<string, SandboxInstance> = new Map();

  constructor(config: SandboxServiceConfig) {
    super();
    this.logger = config.logger;
    this.resourceProvisioner = config.resourceProvisioner;
    this.templateParser = config.templateParser;
    this.githubService = config.githubService;
    this.deployerService = config.deployerService;
    this.codeFixerService = config.codeFixerService;
  }

  /**
   * Create a new sandbox instance
   */
  async createInstance(templateId: string, config?: Record<string, unknown>): Promise<SandboxInstance> {
    this.logger.info('Creating sandbox instance', { templateId, config });

    try {
      const instanceId = this.generateInstanceId();
      const instance: SandboxInstance = {
        id: instanceId,
        status: 'creating',
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        errors: [],
        logs: [],
      };

      this.instances.set(instanceId, instance);

      // Parse template
      const template = await this.templateParser.parseTemplate(templateId);
      instance.template = template;

      // Provision resources
      const provisioningResult = await this.resourceProvisioner.provisionResources(template);
      if (!provisioningResult.success) {
        throw new Error(`Resource provisioning failed: ${provisioningResult.error}`);
      }

      // Initialize sandbox
      const sandbox = await getSandbox(env.SANDBOX);
      const bootstrapResponse = await sandbox.bootstrap({
        template: templateId,
        config: config || {},
      });

      if (!bootstrapResponse.success) {
        throw new Error(`Sandbox bootstrap failed: ${bootstrapResponse.error}`);
      }

      instance.status = 'running';
      this.logger.info('Sandbox instance created successfully', { instanceId });

      return instance;
    } catch (error) {
      this.logger.error('Failed to create sandbox instance', { error, templateId });
      throw error;
    }
  }

  /**
   * Get sandbox instance details
   */
  async getInstance(instanceId: string): Promise<SandboxInstance | null> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return null;
    }

    // Update last accessed time
    instance.lastAccessed = Date.now();
    return { ...instance };
  }

  /**
   * List all sandbox instances
   */
  async listInstances(): Promise<SandboxInstance[]> {
    return Array.from(this.instances.values()).map(instance => ({ ...instance }));
  }

  /**
   * Write files to sandbox
   */
  async writeFiles(instanceId: string, files: WriteFilesRequest): Promise<WriteFilesResponse> {
    this.logger.debug('Writing files to sandbox', { instanceId, fileCount: files.files.length });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      const sandbox = await getSandbox(env.SANDBOX);
      const response = await sandbox.writeFiles(instanceId, files);

      if (response.success) {
        this.logger.debug('Files written successfully', { instanceId });
      } else {
        this.logger.warn('Failed to write files', { instanceId, error: response.error });
      }

      return response;
    } catch (error) {
      this.logger.error('Error writing files to sandbox', { error, instanceId });
      throw error;
    }
  }

  /**
   * Get files from sandbox
   */
  async getFiles(instanceId: string, path?: string): Promise<GetFilesResponse> {
    this.logger.debug('Getting files from sandbox', { instanceId, path });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      const sandbox = await getSandbox(env.SANDBOX);
      const response = await sandbox.getFiles(instanceId, path);

      return response;
    } catch (error) {
      this.logger.error('Error getting files from sandbox', { error, instanceId });
      throw error;
    }
  }

  /**
   * Execute commands in sandbox
   */
  async executeCommands(instanceId: string, commands: string[]): Promise<ExecuteCommandsResponse> {
    this.logger.debug('Executing commands in sandbox', { instanceId, commandCount: commands.length });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      const sandbox = await getSandbox(env.SANDBOX);
      const response = await sandbox.executeCommands(instanceId, commands);

      if (response.success) {
        this.logger.debug('Commands executed successfully', { instanceId });
      } else {
        this.logger.warn('Failed to execute commands', { instanceId, error: response.error });
      }

      return response;
    } catch (error) {
      this.logger.error('Error executing commands in sandbox', { error, instanceId });
      throw error;
    }
  }

  /**
   * Get runtime errors from sandbox
   */
  async getRuntimeErrors(instanceId: string): Promise<RuntimeErrorResponse> {
    this.logger.debug('Getting runtime errors from sandbox', { instanceId });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      const sandbox = await getSandbox(env.SANDBOX);
      const response = await sandbox.getRuntimeErrors(instanceId);

      if (response.success && response.errors) {
        instance.errors = response.errors;
      }

      return response;
    } catch (error) {
      this.logger.error('Error getting runtime errors from sandbox', { error, instanceId });
      throw error;
    }
  }

  /**
   * Clear runtime errors from sandbox
   */
  async clearRuntimeErrors(instanceId: string): Promise<ClearErrorsResponse> {
    this.logger.debug('Clearing runtime errors from sandbox', { instanceId });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      const sandbox = await getSandbox(env.SANDBOX);
      const response = await sandbox.clearRuntimeErrors(instanceId);

      if (response.success) {
        instance.errors = [];
      }

      return response;
    } catch (error) {
      this.logger.error('Error clearing runtime errors from sandbox', { error, instanceId });
      throw error;
    }
  }

  /**
   * Get static analysis results
   */
  async getStaticAnalysis(instanceId: string): Promise<StaticAnalysisResponse> {
    this.logger.debug('Getting static analysis from sandbox', { instanceId });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      const sandbox = await getSandbox(env.SANDBOX);
      const response = await sandbox.getStaticAnalysis(instanceId);

      return response;
    } catch (error) {
      this.logger.error('Error getting static analysis from sandbox', { error, instanceId });
      throw error;
    }
  }

  /**
   * Deploy sandbox to production
   */
  async deploy(instanceId: string, config?: Record<string, unknown>): Promise<DeploymentResult> {
    this.logger.info('Deploying sandbox to production', { instanceId, config });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      // Get files from sandbox
      const filesResponse = await this.getFiles(instanceId);
      if (!filesResponse.success || !filesResponse.files) {
        throw new Error('Failed to get files for deployment');
      }

      // Deploy using deployer service
      const deploymentResult = await this.deployerService.deploy({
        files: filesResponse.files,
        config: config || {},
        instanceId,
      });

      this.logger.info('Sandbox deployed successfully', { instanceId, deploymentId: deploymentResult.deploymentId });

      return deploymentResult;
    } catch (error) {
      this.logger.error('Failed to deploy sandbox', { error, instanceId });
      throw error;
    }
  }

  /**
   * Export to GitHub
   */
  async exportToGitHub(instanceId: string, request: GitHubExportRequest): Promise<GitHubExportResponse> {
    this.logger.info('Exporting sandbox to GitHub', { instanceId, repository: request.repository });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      // Get files from sandbox
      const filesResponse = await this.getFiles(instanceId);
      if (!filesResponse.success || !filesResponse.files) {
        throw new Error('Failed to get files for GitHub export');
      }

      // Export using GitHub service
      const exportResult = await this.githubService.exportToRepository({
        repository: request.repository,
        files: filesResponse.files,
        commitMessage: request.commitMessage || 'Export from sandbox',
        branch: request.branch || 'main',
      });

      this.logger.info('Sandbox exported to GitHub successfully', { instanceId, repository: request.repository });

      return exportResult;
    } catch (error) {
      this.logger.error('Failed to export sandbox to GitHub', { error, instanceId });
      throw error;
    }
  }

  /**
   * Shutdown sandbox instance
   */
  async shutdown(instanceId: string): Promise<ShutdownResponse> {
    this.logger.info('Shutting down sandbox instance', { instanceId });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      const sandbox = await getSandbox(env.SANDBOX);
      const response = await sandbox.shutdown(instanceId);

      if (response.success) {
        instance.status = 'stopped';
        this.logger.info('Sandbox instance shut down successfully', { instanceId });
      } else {
        this.logger.warn('Failed to shutdown sandbox instance', { instanceId, error: response.error });
      }

      return response;
    } catch (error) {
      this.logger.error('Error shutting down sandbox instance', { error, instanceId });
      throw error;
    }
  }

  /**
   * Delete sandbox instance
   */
  async deleteInstance(instanceId: string): Promise<boolean> {
    this.logger.info('Deleting sandbox instance', { instanceId });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        return false;
      }

      // Shutdown first if running
      if (instance.status === 'running') {
        await this.shutdown(instanceId);
      }

      // Remove from instances map
      this.instances.delete(instanceId);

      this.logger.info('Sandbox instance deleted successfully', { instanceId });
      return true;
    } catch (error) {
      this.logger.error('Error deleting sandbox instance', { error, instanceId });
      return false;
    }
  }

  /**
   * Fix code issues in sandbox
   */
  async fixCodeIssues(instanceId: string): Promise<{ success: boolean; fixedIssues: number }> {
    this.logger.info('Fixing code issues in sandbox', { instanceId });

    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
      }

      // Get files and static analysis
      const [filesResponse, analysisResponse] = await Promise.all([
        this.getFiles(instanceId),
        this.getStaticAnalysis(instanceId),
      ]);

      if (!filesResponse.success || !filesResponse.files || !analysisResponse.success || !analysisResponse.issues) {
        throw new Error('Failed to get files or analysis for code fixing');
      }

      // Fix issues using code fixer service
      const fixResult = await this.codeFixerService.fixIssues({
        files: filesResponse.files,
        issues: analysisResponse.issues,
      });

      if (fixResult.success && fixResult.fixedFiles.length > 0) {
        // Write fixed files back to sandbox
        await this.writeFiles(instanceId, {
          files: fixResult.fixedFiles,
        });

        this.logger.info('Code issues fixed successfully', { 
          instanceId, 
          fixedIssues: fixResult.fixedIssues.length,
          fixedFiles: fixResult.fixedFiles.length,
        });
      }

      return {
        success: fixResult.success,
        fixedIssues: fixResult.fixedIssues.length,
      };
    } catch (error) {
      this.logger.error('Failed to fix code issues in sandbox', { error, instanceId });
      throw error;
    }
  }

  /**
   * Generate unique instance ID
   */
  private generateInstanceId(): string {
    return `sandbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up old instances
   */
  async cleanupOldInstances(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    const instancesToDelete: string[] = [];

    for (const [instanceId, instance] of this.instances.entries()) {
      if (now - instance.lastAccessed > maxAge) {
        instancesToDelete.push(instanceId);
      }
    }

    for (const instanceId of instancesToDelete) {
      await this.deleteInstance(instanceId);
    }

    this.logger.info('Cleaned up old sandbox instances', { 
      deletedCount: instancesToDelete.length,
      remainingCount: this.instances.size,
    });

    return instancesToDelete.length;
  }
}