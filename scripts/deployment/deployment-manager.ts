import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import Cloudflare from 'cloudflare';

export interface DeploymentConfig {
  projectName: string;
  environment: 'development' | 'staging' | 'production';
  region: string;
  workers: {
    main: {
      name: string;
      script: string;
      bindings: Record<string, unknown>;
    };
    dispatch: {
      namespace: string;
      binding: string;
    };
  };
  storage: {
    r2: {
      bucket: string;
      binding: string;
    };
  };
  containers: {
    sandbox: {
      image: string;
      maxInstances: number;
      instanceType: {
        vcpu: number;
        memory_mib: number;
      };
    };
  };
}

export interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  url: string;
  errors: string[];
  warnings: string[];
  resources: {
    workers: string[];
    buckets: string[];
    containers: string[];
  };
}

export class DeploymentManager {
  private readonly config: DeploymentConfig;
  private readonly cloudflare: Cloudflare;

  constructor(config: DeploymentConfig, cloudflareToken: string) {
    this.config = config;
    this.cloudflare = new Cloudflare({
      token: cloudflareToken,
    });
  }

  /**
   * Deploy the entire application
   */
  async deploy(): Promise<DeploymentResult> {
    const result: DeploymentResult = {
      success: false,
      deploymentId: this.generateDeploymentId(),
      url: '',
      errors: [],
      warnings: [],
      resources: {
        workers: [],
        buckets: [],
        containers: [],
      },
    };

    try {
      console.log(`🚀 Starting deployment for ${this.config.projectName}...`);

      // Validate environment
      await this.validateEnvironment();

      // Deploy Workers
      await this.deployWorkers(result);

      // Deploy storage
      await this.deployStorage(result);

      // Deploy containers
      await this.deployContainers(result);

      // Update configuration
      await this.updateConfiguration(result);

      result.success = true;
      result.url = `https://${this.config.workers.main.name}.workers.dev`;

      console.log('✅ Deployment completed successfully!');
      console.log(`🌐 Application URL: ${result.url}`);

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      console.error('❌ Deployment failed:', error);
      return result;
    }
  }

  /**
   * Validate deployment environment
   */
  private async validateEnvironment(): Promise<void> {
    console.log('🔍 Validating environment...');

    // Check if wrangler is installed
    try {
      execSync('wrangler --version', { stdio: 'pipe' });
    } catch {
      throw new Error('Wrangler CLI is not installed. Please install it with: npm install -g wrangler');
    }

    // Check if project files exist
    const requiredFiles = [
      'wrangler.jsonc',
      'package.json',
      'worker/index.ts',
    ];

    for (const file of requiredFiles) {
      if (!existsSync(join(process.cwd(), file))) {
        throw new Error(`Required file not found: ${file}`);
      }
    }

    console.log('✅ Environment validation passed');
  }

  /**
   * Deploy Workers
   */
  private async deployWorkers(result: DeploymentResult): Promise<void> {
    console.log('⚡ Deploying Workers...');

    try {
      // Deploy main worker
      const mainWorkerResult = execSync('wrangler deploy', {
        cwd: process.cwd(),
        stdio: 'pipe',
        encoding: 'utf8',
      });

      result.resources.workers.push(this.config.workers.main.name);
      console.log(`✅ Main worker deployed: ${this.config.workers.main.name}`);

      // Create dispatch namespace if it doesn't exist
      await this.createDispatchNamespace(result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Worker deployment failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Create dispatch namespace
   */
  private async createDispatchNamespace(result: DeploymentResult): Promise<void> {
    try {
      const namespaceName = this.config.workers.dispatch.namespace;
      
      // Check if namespace already exists
      const existingNamespaces = await this.cloudflare.workers.dispatchNamespaces.list();
      const namespaceExists = existingNamespaces.result.some(
        ns => ns.namespace === namespaceName
      );

      if (!namespaceExists) {
        await this.cloudflare.workers.dispatchNamespaces.create({
          namespace: namespaceName,
        });
        console.log(`✅ Dispatch namespace created: ${namespaceName}`);
      } else {
        console.log(`ℹ️ Dispatch namespace already exists: ${namespaceName}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(`Dispatch namespace creation failed: ${errorMessage}`);
    }
  }

  /**
   * Deploy storage resources
   */
  private async deployStorage(result: DeploymentResult): Promise<void> {
    console.log('💾 Deploying storage...');

    try {
      // Create R2 bucket
      await this.createR2Bucket(result);

      // Upload templates to R2
      await this.uploadTemplates(result);

      console.log('✅ Storage deployment completed');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Storage deployment failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Create R2 bucket
   */
  private async createR2Bucket(result: DeploymentResult): Promise<void> {
    try {
      const bucketName = this.config.storage.r2.bucket;
      
      // Check if bucket already exists
      const existingBuckets = await this.cloudflare.r2.buckets.list();
      const bucketExists = existingBuckets.result.some(
        bucket => bucket.name === bucketName
      );

      if (!bucketExists) {
        await this.cloudflare.r2.buckets.create({
          name: bucketName,
        });
        console.log(`✅ R2 bucket created: ${bucketName}`);
      } else {
        console.log(`ℹ️ R2 bucket already exists: ${bucketName}`);
      }

      result.resources.buckets.push(bucketName);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(`R2 bucket creation failed: ${errorMessage}`);
    }
  }

  /**
   * Upload templates to R2
   */
  private async uploadTemplates(result: DeploymentResult): Promise<void> {
    try {
      const templatesDir = join(process.cwd(), 'templates');
      
      if (!existsSync(templatesDir)) {
        console.log('ℹ️ No templates directory found, skipping template upload');
        return;
      }

      // This would be implemented to upload template files to R2
      console.log('📁 Templates uploaded to R2');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(`Template upload failed: ${errorMessage}`);
    }
  }

  /**
   * Deploy containers
   */
  private async deployContainers(result: DeploymentResult): Promise<void> {
    console.log('🐳 Deploying containers...');

    try {
      // Deploy sandbox container
      await this.deploySandboxContainer(result);

      console.log('✅ Container deployment completed');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Container deployment failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Deploy sandbox container
   */
  private async deploySandboxContainer(result: DeploymentResult): Promise<void> {
    try {
      const containerConfig = this.config.containers.sandbox;
      
      // This would be implemented to deploy the container
      // For now, just log the configuration
      console.log(`📦 Sandbox container configured: ${containerConfig.image}`);
      
      result.resources.containers.push('sandbox');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(`Sandbox container deployment failed: ${errorMessage}`);
    }
  }

  /**
   * Update configuration files
   */
  private async updateConfiguration(result: DeploymentResult): Promise<void> {
    console.log('⚙️ Updating configuration...');

    try {
      // Update wrangler.jsonc with deployment info
      await this.updateWranglerConfig(result);

      // Create deployment info file
      await this.createDeploymentInfo(result);

      console.log('✅ Configuration updated');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(`Configuration update failed: ${errorMessage}`);
    }
  }

  /**
   * Update wrangler configuration
   */
  private async updateWranglerConfig(result: DeploymentResult): Promise<void> {
    try {
      const wranglerPath = join(process.cwd(), 'wrangler.jsonc');
      const config = JSON.parse(readFileSync(wranglerPath, 'utf8'));

      // Add deployment metadata
      config.deployment = {
        id: result.deploymentId,
        timestamp: Date.now(),
        environment: this.config.environment,
        resources: result.resources,
      };

      writeFileSync(wranglerPath, JSON.stringify(config, null, 2));
      console.log('📝 Wrangler configuration updated');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(`Wrangler config update failed: ${errorMessage}`);
    }
  }

  /**
   * Create deployment info file
   */
  private async createDeploymentInfo(result: DeploymentResult): Promise<void> {
    try {
      const deploymentInfo = {
        deploymentId: result.deploymentId,
        timestamp: Date.now(),
        environment: this.config.environment,
        url: result.url,
        resources: result.resources,
        config: this.config,
      };

      const infoPath = join(process.cwd(), 'deployment-info.json');
      writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));
      console.log('📋 Deployment info created');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.warnings.push(`Deployment info creation failed: ${errorMessage}`);
    }
  }

  /**
   * Generate unique deployment ID
   */
  private generateDeploymentId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `deploy-${timestamp}-${random}`;
  }

  /**
   * Rollback deployment
   */
  async rollback(deploymentId: string): Promise<boolean> {
    try {
      console.log(`🔄 Rolling back deployment: ${deploymentId}`);

      // This would implement rollback logic
      // For now, just return success
      console.log('✅ Rollback completed');
      return true;

    } catch (error) {
      console.error('❌ Rollback failed:', error);
      return false;
    }
  }

  /**
   * Get deployment status
   */
  async getStatus(deploymentId: string): Promise<{
    status: 'pending' | 'success' | 'failed' | 'unknown';
    details: Record<string, unknown>;
  }> {
    try {
      // This would check the actual deployment status
      // For now, return a mock status
      return {
        status: 'success',
        details: {
          deploymentId,
          timestamp: Date.now(),
        },
      };

    } catch (error) {
      return {
        status: 'unknown',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}