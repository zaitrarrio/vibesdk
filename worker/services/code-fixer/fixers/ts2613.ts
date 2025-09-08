/**
 * TS2613: Module is not a module fixer
 * Handles import/export mismatches by converting between default and named imports
 */

import { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, UnfixableIssue, FileObject } from '../types';
import { generateCode } from '../utils/ast';
import { findImportAtLocation, getFileAST, getFileExports, fixImportExportMismatch } from '../utils/imports';
import { findModuleFile } from '../utils/paths';
import { createObjectLogger } from '../../../logger';
import { handleFixerError } from '../utils/helpers';

const logger = createObjectLogger({ name: 'TS2613Fixer' }, 'TS2613Fixer');

/**
 * Fix TS2613 "Module is not a module" errors
 * Preserves exact logic from working ImportExportFixer.fixModuleIsNotModule
 */
export async function fixModuleIsNotModule(
    context: FixerContext,
    issues: CodeIssue[]
): Promise<FixResult> {
    logger.info(`Starting TS2613 fixer with ${issues.length} issues`);
    
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues: UnfixableIssue[] = [];
    const modifiedFiles: FileObject[] = [];
    const newFiles: FileObject[] = [];
    const fetchedFiles = new Set(context.fetchedFiles);

    for (const issue of issues) {
        logger.info(`Processing TS2613 issue: ${issue.message} at ${issue.filePath}:${issue.line}`);
        
        try {
            logger.info(`Getting AST for file: ${issue.filePath}`);
            const ast = await getFileAST(issue.filePath, context.files, context.fileFetcher, fetchedFiles);
            if (!ast) {
                logger.warn(`Failed to get AST for ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'Failed to parse file AST'
                });
                continue;
            }

            logger.info(`Finding import at line ${issue.line} in ${issue.filePath}`);
            const importInfo = findImportAtLocation(ast, issue.line);
            if (!importInfo) {
                logger.warn(`No import found at line ${issue.line} in ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'No import found at specified location'
                });
                continue;
            }
            
            logger.info(`Found import: ${importInfo.moduleSpecifier}, default: ${importInfo.defaultImport}, named: [${importInfo.namedImports.join(', ')}]`);

            const moduleSpecifier = importInfo.moduleSpecifier;
            logger.info(`Searching for target file: ${moduleSpecifier}`);
            const targetFile = await findModuleFile(
                moduleSpecifier, 
                issue.filePath, 
                context.files,
                context.fileFetcher,
                fetchedFiles
            );
            
            if (!targetFile) {
                logger.warn(`Target file not found for module: ${moduleSpecifier}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `Target file not found for module: ${moduleSpecifier}`
                });
                continue;
            }
            logger.info(`Found target file: ${targetFile}`);

            logger.info(`Getting AST for target file: ${targetFile}`);
            logger.info(`Files in context: ${Array.from(context.files.keys()).join(', ')}`);
            logger.info(`FetchedFiles: ${Array.from(fetchedFiles).join(', ')}`);
            logger.info(`FileFetcher available: ${!!context.fileFetcher}`);
            const targetAST = await getFileAST(targetFile, context.files, context.fileFetcher, fetchedFiles);
            logger.info(`getFileAST result for ${targetFile}: ${!!targetAST}`);
            if (!targetAST) {
                logger.warn(`Failed to parse target file: ${targetFile}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `Failed to parse target file: ${targetFile}`
                });
                continue;
            }

            logger.info(`Analyzing exports in target file: ${targetFile}`);
            const exports = getFileExports(targetAST);
            exports.filePath = targetFile;
            logger.info(`Found exports - defaultExport: ${exports.defaultExport || 'none'}, named: [${exports.namedExports.join(', ')}]`);

            // Fix import/export mismatches using AST manipulation
            logger.info(`Attempting to fix import/export mismatch for "${moduleSpecifier}"`);
            const { fixed, changes } = fixImportExportMismatch(ast, moduleSpecifier, exports);
            logger.info(`Mismatch fix result: fixed=${fixed}, changes: [${changes.join(', ')}]`);

            if (fixed) {
                logger.info(`Generating updated code for ${issue.filePath}`);
                const generatedCode = generateCode(ast);
                logger.info(`Generated updated code (${generatedCode.code.length} characters)`);
                
                modifiedFiles.push({
                    filePath: issue.filePath,
                    fileContents: generatedCode.code,
                });
                
                fixedIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    fixApplied: changes.join('. '),
                    fixType: 'export_fix',
                });
                logger.info(`Successfully fixed TS2613 issue for ${issue.filePath}`);
            } else {
                logger.warn(`No suitable fix found for import/export mismatch in ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2613',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'No suitable fix found for import/export mismatch'
                });
            }
        } catch (error) {
            logger.error(`Failed to fix TS2613 issue at ${issue.filePath}:${issue.line}: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2613Fixer'));
        }
    }

    logger.info(`TS2613 fixer completed: ${fixedIssues.length} fixed, ${unfixableIssues.length} unfixable, ${modifiedFiles.length} modified files, ${newFiles.length} new files`);
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles,
        newFiles
    };
}

