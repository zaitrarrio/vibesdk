import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileManagerService } from '@worker/agents/services/file-manager-service';
import { StructuredLogger } from '@worker/logger';

// Mock logger
vi.mock('@worker/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('FileManagerService', () => {
  let fileManager: FileManagerService;
  let mockLogger: StructuredLogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    fileManager = new FileManagerService({
      logger: mockLogger,
      maxFileSize: 1000000, // 1MB
      allowedExtensions: ['js', 'ts', 'tsx', 'jsx', 'json', 'md', 'css', 'html'],
    });
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      expect(fileManager).toBeInstanceOf(FileManagerService);
    });
  });

  describe('createFile', () => {
    it('should create a new file', () => {
      const operation = fileManager.createFile('test.js', 'console.log("hello");');

      expect(operation.path).toBe('test.js');
      expect(operation.content).toBe('console.log("hello");');
      expect(operation.operation).toBe('create');
      expect(operation.timestamp).toBeGreaterThan(0);
    });

    it('should throw error for invalid file path', () => {
      expect(() => {
        fileManager.createFile('', 'content');
      }).toThrow('Invalid file path');
    });

    it('should throw error for file path too long', () => {
      const longPath = 'a'.repeat(501);
      expect(() => {
        fileManager.createFile(longPath, 'content');
      }).toThrow('File path too long');
    });

    it('should throw error for disallowed file extension', () => {
      expect(() => {
        fileManager.createFile('test.exe', 'content');
      }).toThrow('File extension not allowed: exe');
    });

    it('should throw error for content too large', () => {
      const largeContent = 'a'.repeat(1000001);
      expect(() => {
        fileManager.createFile('test.js', largeContent);
      }).toThrow('File content too large');
    });

    it('should throw error for non-string content', () => {
      expect(() => {
        fileManager.createFile('test.js', 123 as any);
      }).toThrow('File content must be a string');
    });
  });

  describe('updateFile', () => {
    beforeEach(() => {
      fileManager.createFile('test.js', 'original content');
    });

    it('should update an existing file', () => {
      const operation = fileManager.updateFile('test.js', 'updated content');

      expect(operation.path).toBe('test.js');
      expect(operation.content).toBe('updated content');
      expect(operation.operation).toBe('update');
      expect(operation.timestamp).toBeGreaterThan(0);
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        fileManager.updateFile('nonexistent.js', 'content');
      }).toThrow('File not found: nonexistent.js');
    });
  });

  describe('deleteFile', () => {
    beforeEach(() => {
      fileManager.createFile('test.js', 'content');
    });

    it('should delete an existing file', () => {
      const operation = fileManager.deleteFile('test.js');

      expect(operation.path).toBe('test.js');
      expect(operation.operation).toBe('delete');
      expect(operation.timestamp).toBeGreaterThan(0);
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        fileManager.deleteFile('nonexistent.js');
      }).toThrow('File not found: nonexistent.js');
    });
  });

  describe('getFile', () => {
    it('should return undefined for non-existent file', () => {
      const file = fileManager.getFile('nonexistent.js');
      expect(file).toBeUndefined();
    });

    it('should return file for existing file', () => {
      fileManager.createFile('test.js', 'content');
      const file = fileManager.getFile('test.js');

      expect(file).toBeDefined();
      expect(file?.path).toBe('test.js');
      expect(file?.content).toBe('content');
      expect(file?.status).toBe('created');
    });
  });

  describe('getAllFiles', () => {
    it('should return empty array when no files', () => {
      const files = fileManager.getAllFiles();
      expect(files).toEqual([]);
    });

    it('should return all files', () => {
      fileManager.createFile('file1.js', 'content1');
      fileManager.createFile('file2.ts', 'content2');

      const files = fileManager.getAllFiles();
      expect(files).toHaveLength(2);
      expect(files.map(f => f.path)).toContain('file1.js');
      expect(files.map(f => f.path)).toContain('file2.ts');
    });
  });

  describe('getFilesByStatus', () => {
    beforeEach(() => {
      fileManager.createFile('file1.js', 'content1');
      fileManager.createFile('file2.ts', 'content2');
      fileManager.updateFile('file1.js', 'updated content');
    });

    it('should return files by status', () => {
      const createdFiles = fileManager.getFilesByStatus('created');
      const modifiedFiles = fileManager.getFilesByStatus('modified');

      expect(createdFiles).toHaveLength(1);
      expect(createdFiles[0].path).toBe('file2.ts');

      expect(modifiedFiles).toHaveLength(1);
      expect(modifiedFiles[0].path).toBe('file1.js');
    });
  });

  describe('fileExists', () => {
    it('should return false for non-existent file', () => {
      expect(fileManager.fileExists('nonexistent.js')).toBe(false);
    });

    it('should return true for existing file', () => {
      fileManager.createFile('test.js', 'content');
      expect(fileManager.fileExists('test.js')).toBe(true);
    });
  });

  describe('getFileCount', () => {
    it('should return 0 when no files', () => {
      expect(fileManager.getFileCount()).toBe(0);
    });

    it('should return correct count', () => {
      fileManager.createFile('file1.js', 'content1');
      fileManager.createFile('file2.ts', 'content2');
      fileManager.createFile('file3.json', 'content3');

      expect(fileManager.getFileCount()).toBe(3);
    });
  });

  describe('clearAllFiles', () => {
    it('should clear all files', () => {
      fileManager.createFile('file1.js', 'content1');
      fileManager.createFile('file2.ts', 'content2');

      expect(fileManager.getFileCount()).toBe(2);

      fileManager.clearAllFiles();

      expect(fileManager.getFileCount()).toBe(0);
    });
  });

  describe('exportToJson', () => {
    it('should export files to JSON', () => {
      fileManager.createFile('test.js', 'console.log("hello");');
      fileManager.createFile('readme.md', '# Test Project');

      const json = fileManager.exportToJson();
      const data = JSON.parse(json);

      expect(data).toHaveLength(2);
      expect(data[0].path).toBe('test.js');
      expect(data[0].content).toBe('console.log("hello");');
      expect(data[1].path).toBe('readme.md');
      expect(data[1].content).toBe('# Test Project');
    });

    it('should export empty array when no files', () => {
      const json = fileManager.exportToJson();
      const data = JSON.parse(json);

      expect(data).toEqual([]);
    });
  });

  describe('importFromJson', () => {
    it('should import files from JSON', () => {
      const jsonData = JSON.stringify([
        { path: 'test.js', content: 'console.log("hello");', status: 'created', lastModified: Date.now(), size: 20 },
        { path: 'readme.md', content: '# Test Project', status: 'created', lastModified: Date.now(), size: 15 },
      ]);

      fileManager.importFromJson(jsonData);

      expect(fileManager.getFileCount()).toBe(2);
      expect(fileManager.fileExists('test.js')).toBe(true);
      expect(fileManager.fileExists('readme.md')).toBe(true);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => {
        fileManager.importFromJson('invalid json');
      }).toThrow('Failed to import files');
    });

    it('should throw error for invalid data format', () => {
      const invalidData = JSON.stringify({ not: 'an array' });
      expect(() => {
        fileManager.importFromJson(invalidData);
      }).toThrow('Failed to import files');
    });

    it('should clear existing files before import', () => {
      fileManager.createFile('existing.js', 'content');
      expect(fileManager.getFileCount()).toBe(1);

      const jsonData = JSON.stringify([
        { path: 'new.js', content: 'new content', status: 'created', lastModified: Date.now(), size: 11 },
      ]);

      fileManager.importFromJson(jsonData);

      expect(fileManager.getFileCount()).toBe(1);
      expect(fileManager.fileExists('existing.js')).toBe(false);
      expect(fileManager.fileExists('new.js')).toBe(true);
    });
  });
});