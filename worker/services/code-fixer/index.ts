/**
 * Main functional entry point for the deterministic code fixer
 * Stateless, functional approach to fixing TypeScript compilation issues
 */

import { FileObject } from './types';
import { CodeIssue } from '../sandbox/sandboxTypes';
import { 
    CodeFixResult, 
    FileFetcher, 
    FixerContext, 
    FileMap, 
    ProjectFile,
    FixerRegistry,
    FixResult
} from './types';
import { isScriptFile } from './utils/ast';
import { canModifyFile } from './utils/modules';

// Import all fixers
import { fixModuleNotFound } from './fixers/ts2307';
import { fixModuleIsNotModule } from './fixers/ts2613';
import { fixUndefinedName } from './fixers/ts2304';
import { fixMissingExportedMember } from './fixers/ts2305';
import { fixImportExportTypeMismatch } from './fixers/ts2614';
import { fixIncorrectNamedImport } from './fixers/ts2724';

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Fix TypeScript compilation issues across the entire project
 * This is the main stateless functional API
 * 
 * @param allFiles - Initial files to work with
 * @param issues - TypeScript compilation issues to fix
 * @param fileFetcher - Optional callback to fetch additional files on-demand
 * @returns Promise containing fix results with modified/new files
 */
export async function fixProjectIssues(
    allFiles: FileObject[],
    issues: CodeIssue[],
    fileFetcher?: FileFetcher
): Promise<CodeFixResult> {
    try {
        // Build file map (mutable for caching fetched files)
        const fileMap = createFileMap(allFiles);
        
        // Create fixer context with mutable fetchedFiles set
        const fetchedFiles = new Set<string>();
        const context: FixerContext = {
            files: fileMap,
            fileFetcher,
            fetchedFiles
        };
        
        // Get fixer registry
        const fixerRegistry = createFixerRegistry();
        
        // Separate fixable and unfixable issues
        const { fixableIssues, unfixableIssues } = separateIssues(issues, fixerRegistry);
        
        // Group fixable issues by fixer
        const issuesByFixer = groupIssuesByFixer(fixableIssues, fixerRegistry);
        
        // Apply all fixes
        const results = await applyFixes(context, issuesByFixer, fixerRegistry);
        
        // Merge and deduplicate results, including pre-separated unfixable issues
        const mergedResult = mergeFixResults(results, unfixableIssues);
        
        return mergedResult;
        
    } catch (error) {
        // If there's a global error, mark all issues as unfixable
        return {
            fixedIssues: [],
            unfixableIssues: issues.map(issue => ({
                issueCode: issue.ruleId || 'UNKNOWN',
                filePath: issue.filePath,
                line: issue.line,
                column: issue.column,
                originalMessage: issue.message,
                reason: `Global fixer error: ${error instanceof Error ? error.message : 'Unknown error'}`
            })),
            modifiedFiles: []
        };
    }
}

// ============================================================================
// FILE MAP CREATION
// ============================================================================

/**
 * Create file map from input files (mutable for caching fetched files)
 */
function createFileMap(files: FileObject[]): FileMap {
    const fileMap = new Map<string, ProjectFile>();
    
    for (const file of files) {
        // Only include script files
        if (isScriptFile(file.filePath)) {
            fileMap.set(file.filePath, {
                filePath: file.filePath,
                content: file.fileContents,
                ast: undefined // Lazy-loaded
            });
        }
    }
    
    return fileMap;
}

// ============================================================================
// FIXER REGISTRY
// ============================================================================

/**
 * Create registry of all available fixers
 */
function createFixerRegistry(): FixerRegistry {
    const registry = new Map();
    
    // Register fixers with their detection functions
    registry.set('TS2307', fixModuleNotFound);
    registry.set('TS2613', fixModuleIsNotModule);
    registry.set('TS2304', fixUndefinedName);
    registry.set('TS2305', fixMissingExportedMember);
    registry.set('TS2614', fixImportExportTypeMismatch);
    registry.set('TS2724', fixIncorrectNamedImport);
    
    return registry;
}


// ============================================================================
// ISSUE GROUPING
// ============================================================================

/**
 * Separate issues into fixable and unfixable based on available fixers
 */
function separateIssues(
    issues: CodeIssue[],
    fixerRegistry: FixerRegistry
): { fixableIssues: CodeIssue[]; unfixableIssues: CodeIssue[] } {
    const fixableIssues: CodeIssue[] = [];
    const unfixableIssues: CodeIssue[] = [];
    
    for (const issue of issues) {
        if (issue.ruleId && fixerRegistry.has(issue.ruleId)) {
            fixableIssues.push(issue);
        } else {
            unfixableIssues.push(issue);
        }
    }
    
    return { fixableIssues, unfixableIssues };
}

/**
 * Group fixable issues by fixer based on ruleId - simple direct lookup
 */
function groupIssuesByFixer(
    issues: CodeIssue[], 
    fixerRegistry: FixerRegistry
): Map<string, CodeIssue[]> {
    const issuesByFixer = new Map<string, CodeIssue[]>();
    
    for (const issue of issues) {
        // Direct lookup: all issues here should have fixers (pre-filtered)
        if (issue.ruleId && fixerRegistry.has(issue.ruleId)) {
            const fixerIssues = issuesByFixer.get(issue.ruleId) || [];
            fixerIssues.push(issue);
            issuesByFixer.set(issue.ruleId, fixerIssues);
        }
    }
    
    return issuesByFixer;
}

// ============================================================================
// FIX APPLICATION
// ============================================================================

/**
 * Apply all fixes using the appropriate fixers
 */
async function applyFixes(
    context: FixerContext,
    issuesByFixer: Map<string, CodeIssue[]>,
    fixerRegistry: FixerRegistry
): Promise<FixResult[]> {
    const results: FixResult[] = [];
    
    for (const [fixerType, issues] of issuesByFixer) {
        const fixer = fixerRegistry.get(fixerType);
        if (!fixer) {
            continue;
        }
        
        try {
            const result = await fixer(context, issues);
            results.push(result);
        } catch (error) {
            // Handle fixer errors
            results.push({
                fixedIssues: [],
                unfixableIssues: issues.map(issue => ({
                    issueCode: issue.ruleId || 'UNKNOWN',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `Fixer ${fixerType} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                })),
                modifiedFiles: [],
                newFiles: []
            });
        }
    }
    
    return results;
}

// ============================================================================
// RESULT MERGING
// ============================================================================

/**
 * Merge results from all fixers and deduplicate files
 */
function mergeFixResults(results: FixResult[], preSeparatedUnfixableIssues: CodeIssue[]): CodeFixResult {
    const fixedIssues = results.flatMap(r => r.fixedIssues);
    const fixerUnfixableIssues = results.flatMap(r => r.unfixableIssues);
    const allModifiedFiles = results.flatMap(r => r.modifiedFiles);
    const allNewFiles = results.flatMap(r => r.newFiles);
    
    // Convert pre-separated unfixable issues to proper format with validation
    const noFixerAvailableIssues = preSeparatedUnfixableIssues.map(issue => {
        let reason = 'No fixer available for this issue type';
        
        // Add additional context for safety
        if (!canModifyFile(issue.filePath)) {
            reason += ' (file outside project boundaries)';
        }
        
        return {
            issueCode: issue.ruleId || 'UNKNOWN',
            filePath: issue.filePath,
            line: issue.line,
            column: issue.column,
            originalMessage: issue.message,
            reason
        };
    });
    
    // Combine all unfixable issues
    const unfixableIssues = [...fixerUnfixableIssues, ...noFixerAvailableIssues];
    
    // Deduplicate files by path (last one wins) with safety validation
    const filesByPath = new Map<string, FileObject>();
    
    // Add modified files (with validation)
    for (const file of allModifiedFiles) {
        if (canModifyFile(file.filePath)) {
            filesByPath.set(file.filePath, file);
        }
    }
    
    // Add new files (with validation)
    for (const file of allNewFiles) {
        if (canModifyFile(file.filePath)) {
            filesByPath.set(file.filePath, file);
        }
    }
    
    const modifiedFiles = Array.from(filesByPath.values());
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles
    };
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

// Re-export types for easy importing
export type {
    CodeFixResult,
    FixedIssue,
    UnfixableIssue,
    FileFetcher,
    FixerContext,
    FileMap,
    ProjectFile
} from './types';

// Re-export utility functions that might be useful
export { isScriptFile } from './utils/ast';
export { resolvePathAlias, makeRelativeImport } from './utils/paths';
export { analyzeImportUsage } from './utils/imports';
export { generateStubFileContent } from './utils/stubs';