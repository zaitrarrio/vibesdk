/**
 * TS2614: Module has no exported member (import/export mismatch) fixer
 * Handles cases where imports use wrong syntax (named vs default)
 */

import { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, UnfixableIssue, FileObject } from '../types';
import { generateCode, traverseAST } from '../utils/ast';
import { findImportAtLocation, getFileAST, getFileExports } from '../utils/imports';
import { findModuleFile } from '../utils/paths';
import { createObjectLogger } from '../../../logger';
import * as t from '@babel/types';
import { handleFixerError } from '../utils/helpers';

const logger = createObjectLogger({ name: 'TS2614Fixer' }, 'TS2614Fixer');

/**
 * Fix TS2614 "Module has no exported member" errors (import/export mismatch)
 * Corrects import statements to match actual export types
 */
export async function fixImportExportTypeMismatch(
    context: FixerContext,
    issues: CodeIssue[]
): Promise<FixResult> {
    logger.info(`Starting TS2614 fixer with ${issues.length} issues`);
    
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues: UnfixableIssue[] = [];
    const modifiedFiles: FileObject[] = [];
    const newFiles: FileObject[] = [];
    const fetchedFiles = new Set(context.fetchedFiles);

    for (const issue of issues) {
        logger.info(`Processing TS2614 issue: ${issue.message} at ${issue.filePath}:${issue.line}`);
        
        try {
            // Get AST for the file with the import issue
            logger.info(`Getting AST for source file: ${issue.filePath}`);
            const sourceAST = await getFileAST(issue.filePath, context.files, context.fileFetcher, fetchedFiles);
            if (!sourceAST) {
                logger.warn(`Failed to get AST for ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'Failed to parse source file AST'
                });
                continue;
            }

            // Find the import at the error location
            logger.info(`Finding import at line ${issue.line} in ${issue.filePath}`);
            const importInfo = findImportAtLocation(sourceAST, issue.line);
            if (!importInfo) {
                logger.warn(`No import found at line ${issue.line} in ${issue.filePath}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'No import found at specified location'
                });
                continue;
            }
            
            logger.info(`Found import: ${importInfo.moduleSpecifier}, default: ${importInfo.defaultImport}, named: [${importInfo.namedImports.join(', ')}]`);

            // Find the target file
            logger.info(`Searching for target file: ${importInfo.moduleSpecifier}`);
            const targetFile = await findModuleFile(
                importInfo.moduleSpecifier, 
                issue.filePath, 
                context.files,
                context.fileFetcher,
                fetchedFiles
            );
            
            if (!targetFile) {
                logger.warn(`Target file not found for module: ${importInfo.moduleSpecifier}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `Target file not found for module: ${importInfo.moduleSpecifier}`
                });
                continue;
            }
            logger.info(`Found target file: ${targetFile}`);

            // Get AST for target file to analyze actual exports
            logger.info(`Getting AST for target file: ${targetFile}`);
            const targetAST = await getFileAST(targetFile, context.files, context.fileFetcher, fetchedFiles);
            if (!targetAST) {
                logger.warn(`Failed to parse target file: ${targetFile}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `Failed to parse target file: ${targetFile}`
                });
                continue;
            }

            // Analyze target file's exports
            logger.info(`Analyzing exports in target file: ${targetFile}`);
            const targetExports = getFileExports(targetAST);
            logger.info(`Found exports - defaultExport: ${targetExports.defaultExport || 'none'}, named: [${targetExports.namedExports.join(', ')}]`);

            // Determine the mismatch type and fix it
            const mismatchAnalysis = analyzeMismatch(importInfo, targetExports);
            if (!mismatchAnalysis) {
                logger.warn(`Could not determine mismatch type for ${importInfo.moduleSpecifier}`);
                unfixableIssues.push({
                    issueCode: 'TS2614',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'Could not determine import/export mismatch type'
                });
                continue;
            }

            logger.info(`Mismatch analysis: ${mismatchAnalysis.type} - ${mismatchAnalysis.description}`);

            // Apply the fix to the import statement
            const fixedAST = fixImportStatement(sourceAST, importInfo, mismatchAnalysis);
            const generatedCode = generateCode(fixedAST);
            
            modifiedFiles.push({
                filePath: issue.filePath,
                fileContents: generatedCode.code,
            });
            
            fixedIssues.push({
                issueCode: 'TS2614',
                filePath: issue.filePath,
                line: issue.line,
                column: issue.column,
                originalMessage: issue.message,
                fixApplied: mismatchAnalysis.description,
                fixType: 'import_fix',
            });
            logger.info(`Successfully fixed import/export mismatch in ${issue.filePath}`);
            
        } catch (error) {
            logger.error(`Failed to fix TS2614 issue at ${issue.filePath}:${issue.line}: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
            unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2614Fixer'));
        }
    }

    logger.info(`TS2614 fixer completed: ${fixedIssues.length} fixed, ${unfixableIssues.length} unfixable, ${modifiedFiles.length} modified files, ${newFiles.length} new files`);
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles,
        newFiles
    };
}

interface MismatchAnalysis {
    type: 'named-to-default' | 'default-to-named' | 'partial-match';
    description: string;
    targetName?: string;
    sourceNames?: string[];
}

/**
 * Analyze the type of import/export mismatch
 */
function analyzeMismatch(
    importInfo: { defaultImport?: string; namedImports: string[]; moduleSpecifier: string }, 
    targetExports: { defaultExport?: string; namedExports: string[] }
): MismatchAnalysis | null {
    
    // Case 1: Trying to import something as named when it's actually default export
    if (importInfo.namedImports.length > 0 && !importInfo.defaultImport && targetExports.defaultExport) {
        // Check if any named import matches the default export name
        const matchingNamedImport = importInfo.namedImports.find(name => 
            name === targetExports.defaultExport || 
            name.toLowerCase() === targetExports.defaultExport?.toLowerCase()
        );
        
        if (matchingNamedImport) {
            return {
                type: 'named-to-default',
                description: `Changed import from named '${matchingNamedImport}' to default import`,
                targetName: matchingNamedImport
            };
        }
    }
    
    // Case 2: Trying to import as default when it's actually a named export
    if (importInfo.defaultImport && !targetExports.defaultExport && targetExports.namedExports.length > 0) {
        // Check if the default import name matches any named export
        const matchingNamedExport = targetExports.namedExports.find(name => 
            name === importInfo.defaultImport || 
            name.toLowerCase() === importInfo.defaultImport?.toLowerCase()
        );
        
        if (matchingNamedExport) {
            return {
                type: 'default-to-named',
                description: `Changed import from default '${importInfo.defaultImport}' to named import '${matchingNamedExport}'`,
                targetName: matchingNamedExport
            };
        }
    }
    
    // Case 3: Mixed scenario - some imports might be correct, others not
    if (importInfo.namedImports.length > 0 && targetExports.namedExports.length > 0) {
        const validImports = importInfo.namedImports.filter(name => 
            targetExports.namedExports.includes(name)
        );
        const invalidImports = importInfo.namedImports.filter(name => 
            !targetExports.namedExports.includes(name)
        );
        
        if (invalidImports.length > 0 && targetExports.defaultExport) {
            // Some named imports are invalid but there's a default export
            const matchingInvalidImport = invalidImports.find(name =>
                name === targetExports.defaultExport || 
                name.toLowerCase() === targetExports.defaultExport?.toLowerCase()
            );
            
            if (matchingInvalidImport) {
                return {
                    type: 'partial-match',
                    description: `Converted invalid named import '${matchingInvalidImport}' to default import while preserving valid named imports`,
                    targetName: matchingInvalidImport,
                    sourceNames: validImports
                };
            }
        }
    }
    
    return null;
}

/**
 * Fix the import statement based on mismatch analysis
 */
function fixImportStatement(
    ast: t.File, 
    importInfo: { moduleSpecifier: string; defaultImport?: string; namedImports: string[] },
    mismatchAnalysis: MismatchAnalysis
): t.File {
    
    traverseAST(ast, {
        ImportDeclaration(path) {
            if (t.isStringLiteral(path.node.source) && path.node.source.value === importInfo.moduleSpecifier) {
                
                switch (mismatchAnalysis.type) {
                    case 'named-to-default':
                        // Convert named import to default import
                        if (mismatchAnalysis.targetName) {
                            path.node.specifiers = [
                                t.importDefaultSpecifier(t.identifier(mismatchAnalysis.targetName))
                            ];
                        }
                        break;
                        
                    case 'default-to-named':
                        // Convert default import to named import
                        if (mismatchAnalysis.targetName && importInfo.defaultImport) {
                            path.node.specifiers = [
                                t.importSpecifier(
                                    t.identifier(importInfo.defaultImport),
                                    t.identifier(mismatchAnalysis.targetName)
                                )
                            ];
                        }
                        break;
                        
                    case 'partial-match':
                        // Convert invalid named import to default while keeping valid named imports
                        if (mismatchAnalysis.targetName && mismatchAnalysis.sourceNames) {
                            const newSpecifiers: (t.ImportDefaultSpecifier | t.ImportSpecifier)[] = [];
                            
                            // Add default import for the converted name
                            newSpecifiers.push(t.importDefaultSpecifier(t.identifier(mismatchAnalysis.targetName)));
                            
                            // Keep valid named imports
                            for (const validName of mismatchAnalysis.sourceNames) {
                                newSpecifiers.push(
                                    t.importSpecifier(t.identifier(validName), t.identifier(validName))
                                );
                            }
                            
                            path.node.specifiers = newSpecifiers;
                        }
                        break;
                }
            }
        }
    });
    
    return ast;
}

