#!/usr/bin/env tsx

import { readdir, rename, stat } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

async function renameFilesInDirectory(dirPath: string): Promise<void> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively process subdirectories
        await renameFilesInDirectory(fullPath);
        
        // Rename directory if it contains uppercase letters
        if (/[A-Z]/.test(entry.name)) {
          const newDirName = toKebabCase(entry.name);
          const newDirPath = join(dirname(fullPath), newDirName);
          console.log(`Renaming directory: ${fullPath} -> ${newDirPath}`);
          await rename(fullPath, newDirPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        // Rename file if it contains uppercase letters
        if (/[A-Z]/.test(entry.name)) {
          const ext = extname(entry.name);
          const baseName = basename(entry.name, ext);
          const newFileName = toKebabCase(baseName) + ext;
          const newFilePath = join(dirname(fullPath), newFileName);
          
          console.log(`Renaming file: ${fullPath} -> ${newFilePath}`);
          await rename(fullPath, newFilePath);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }
}

async function main() {
  const directories = [
    '/workspace/src',
    '/workspace/worker',
    '/workspace/shared'
  ];
  
  for (const dir of directories) {
    console.log(`Processing directory: ${dir}`);
    await renameFilesInDirectory(dir);
  }
  
  console.log('File renaming completed!');
}

main().catch(console.error);