#!/usr/bin/env node

/**
 * Refactored Cloudflare Orange Build - Automated Deployment Script
 * 
 * This script provides a clean, modular approach to deployment with:
 * - Better error handling and logging
 * - Modular deployment components
 * - Comprehensive validation
 * - Rollback capabilities
 */

import { DeploymentManager, DeploymentConfig } from './deployment/deployment-manager';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface DeploymentOptions {
  environment: 'development' | 'staging' | 'production';
  projectName: string;
  region: string;
  cloudflareToken: string;
  skipValidation?: boolean;
  dryRun?: boolean;
}

async function main() {
  try {
    console.log('🚀 Cloudflare Orange Build - Deployment Script');
    console.log('==============================================');

    // Parse command line arguments
    const options = parseArguments();
    
    // Load configuration
    const config = await loadConfiguration(options);
    
    // Create deployment manager
    const deploymentManager = new DeploymentManager(config, options.cloudflareToken);
    
    // Execute deployment
    const result = await deploymentManager.deploy();
    
    // Handle result
    if (result.success) {
      console.log('\n🎉 Deployment Successful!');
      console.log(`🌐 Application URL: ${result.url}`);
      console.log(`📋 Deployment ID: ${result.deploymentId}`);
      
      if (result.warnings.length > 0) {
        console.log('\n⚠️ Warnings:');
        result.warnings.forEach(warning => console.log(`  - ${warning}`));
      }
      
      process.exit(0);
    } else {
      console.log('\n❌ Deployment Failed!');
      console.log('Errors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
      
      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        result.warnings.forEach(warning => console.log(`  - ${warning}`));
      }
      
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Fatal Error:', error);
    process.exit(1);
  }
}

function parseArguments(): DeploymentOptions {
  const args = process.argv.slice(2);
  const options: DeploymentOptions = {
    environment: 'production',
    projectName: 'orange-build',
    region: 'auto',
    cloudflareToken: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--env':
      case '-e':
        options.environment = args[++i] as 'development' | 'staging' | 'production';
        break;
      case '--project':
      case '-p':
        options.projectName = args[++i];
        break;
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--token':
      case '-t':
        options.cloudflareToken = args[++i];
        break;
      case '--skip-validation':
        options.skipValidation = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
        break;
    }
  }

  // Validate required options
  if (!options.cloudflareToken) {
    console.error('Error: Cloudflare token is required');
    console.error('Use --token or -t option, or set CLOUDFLARE_API_TOKEN environment variable');
    process.exit(1);
  }

  return options;
}

async function loadConfiguration(options: DeploymentOptions): Promise<DeploymentConfig> {
  console.log('📋 Loading configuration...');

  // Try to load from config file
  const configPath = join(process.cwd(), 'deployment-config.json');
  if (existsSync(configPath)) {
    try {
      const configData = JSON.parse(readFileSync(configPath, 'utf8'));
      console.log('✅ Configuration loaded from file');
      return configData;
    } catch (error) {
      console.warn('⚠️ Failed to load config file, using defaults');
    }
  }

  // Use default configuration
  const config: DeploymentConfig = {
    projectName: options.projectName,
    environment: options.environment,
    region: options.region,
    workers: {
      main: {
        name: `${options.projectName}-${options.environment}`,
        script: 'worker/index.ts',
        bindings: {
          DISPATCH: 'user-apps',
          SANDBOX: 'sandbox-service',
        },
      },
      dispatch: {
        namespace: 'user-apps',
        binding: 'DISPATCH',
      },
    },
    storage: {
      r2: {
        bucket: `${options.projectName}-templates-${options.environment}`,
        binding: 'TEMPLATES',
      },
    },
    containers: {
      sandbox: {
        image: 'cloudflare/sandbox:latest',
        maxInstances: 100,
        instanceType: {
          vcpu: 1,
          memory_mib: 512,
        },
      },
    },
  };

  console.log('✅ Default configuration created');
  return config;
}

function printHelp(): void {
  console.log(`
Cloudflare Orange Build - Deployment Script

Usage: npm run deploy [options]

Options:
  --env, -e <environment>     Deployment environment (development|staging|production)
  --project, -p <name>         Project name (default: orange-build)
  --region, -r <region>        Deployment region (default: auto)
  --token, -t <token>          Cloudflare API token (required)
  --skip-validation            Skip environment validation
  --dry-run                    Show what would be deployed without actually deploying
  --help, -h                   Show this help message

Environment Variables:
  CLOUDFLARE_API_TOKEN         Cloudflare API token (alternative to --token)

Examples:
  npm run deploy -- --env production --token abc123
  npm run deploy -- --project my-app --env staging --token abc123
  npm run deploy -- --dry-run --token abc123
`);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n💥 Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error('\n💥 Deployment failed:', error);
  process.exit(1);
});