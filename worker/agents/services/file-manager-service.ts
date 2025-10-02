import { StructuredLogger } from '@worker/logger';
import { FileState } from '../core/state';
import { CodeGenState } from '../core/state';

export interface FileManagerConfig {
  logger: StructuredLogger;
  maxFileSize: number;
  allowedExtensions: string[];
}

export interface FileOperation {
  path: string;
  content: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: number;
}

export class FileManagerService {
  private readonly logger: StructuredLogger;
  private readonly config: FileManagerConfig;
  private files: Map<string, FileState> = new Map();

  constructor(config: FileManagerConfig) {
    this.logger = config.logger;
    this.config = config;
  }

  /**
   * Create a new file
   */
  createFile(path: string, content: string): FileOperation {
    this.validateFilePath(path);
    this.validateFileContent(content);

    const fileState: FileState = {
      path,
      content,
      status: 'created',
      lastModified: Date.now(),
      size: content.length,
    };

    this.files.set(path, fileState);
    
    this.logger.debug('File created', { path, size: content.length });
    
    return {
      path,
      content,
      operation: 'create',
      timestamp: Date.now(),
    };
  }

  /**
   * Update an existing file
   */
  updateFile(path: string, content: string): FileOperation {
    this.validateFilePath(path);
    this.validateFileContent(content);

    const existingFile = this.files.get(path);
    if (!existingFile) {
      throw new Error(`File not found: ${path}`);
    }

    const fileState: FileState = {
      ...existingFile,
      content,
      status: 'modified',
      lastModified: Date.now(),
      size: content.length,
    };

    this.files.set(path, fileState);
    
    this.logger.debug('File updated', { path, size: content.length });
    
    return {
      path,
      content,
      operation: 'update',
      timestamp: Date.now(),
    };
  }

  /**
   * Delete a file
   */
  deleteFile(path: string): FileOperation {
    const existingFile = this.files.get(path);
    if (!existingFile) {
      throw new Error(`File not found: ${path}`);
    }

    this.files.delete(path);
    
    this.logger.debug('File deleted', { path });
    
    return {
      path,
      content: '',
      operation: 'delete',
      timestamp: Date.now(),
    };
  }

  /**
   * Get file content
   */
  getFile(path: string): FileState | undefined {
    return this.files.get(path);
  }

  /**
   * Get all files
   */
  getAllFiles(): FileState[] {
    return Array.from(this.files.values());
  }

  /**
   * Get files by status
   */
  getFilesByStatus(status: FileState['status']): FileState[] {
    return this.getAllFiles().filter(file => file.status === status);
  }

  /**
   * Check if file exists
   */
  fileExists(path: string): boolean {
    return this.files.has(path);
  }

  /**
   * Get file count
   */
  getFileCount(): number {
    return this.files.size;
  }

  /**
   * Clear all files
   */
  clearAllFiles(): void {
    this.files.clear();
    this.logger.info('All files cleared');
  }

  /**
   * Validate file path
   */
  private validateFilePath(path: string): void {
    if (!path || typeof path !== 'string') {
      throw new Error('Invalid file path');
    }

    if (path.length > 500) {
      throw new Error('File path too long');
    }

    // Check for allowed extensions
    const extension = path.split('.').pop()?.toLowerCase();
    if (extension && !this.config.allowedExtensions.includes(extension)) {
      throw new Error(`File extension not allowed: ${extension}`);
    }
  }

  /**
   * Validate file content
   */
  private validateFileContent(content: string): void {
    if (typeof content !== 'string') {
      throw new Error('File content must be a string');
    }

    if (content.length > this.config.maxFileSize) {
      throw new Error(`File content too large: ${content.length} bytes`);
    }
  }

  /**
   * Export files to JSON
   */
  exportToJson(): string {
    const filesData = this.getAllFiles().map(file => ({
      path: file.path,
      content: file.content,
      status: file.status,
      lastModified: file.lastModified,
      size: file.size,
    }));

    return JSON.stringify(filesData, null, 2);
  }

  /**
   * Import files from JSON
   */
  importFromJson(jsonData: string): void {
    try {
      const filesData = JSON.parse(jsonData);
      
      if (!Array.isArray(filesData)) {
        throw new Error('Invalid file data format');
      }

      this.clearAllFiles();

      for (const fileData of filesData) {
        if (fileData.path && fileData.content) {
          this.createFile(fileData.path, fileData.content);
        }
      }

      this.logger.info('Files imported successfully', { count: filesData.length });
    } catch (error) {
      this.logger.error('Failed to import files', { error });
      throw new Error('Failed to import files');
    }
  }
}