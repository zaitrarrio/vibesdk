/**
 * TS2724: Incorrect named import fixer
 * Handles cases where a named import doesn't exist but TypeScript suggests alternatives
 * Example: "'@/components/ui/sonner' has no exported member named 'toast'. Did you mean 'Toaster'?"
 */

import { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, UnfixableIssue, FileObject } from '../types';
import { generateCode } from '../utils/ast';
import { getFileAST, findImportAtLocation } from '../utils/imports';
import { createObjectLogger } from '../../../logger';
import * as t from '@babel/types';
import {
    createUnfixableIssue,
    createExternalModuleError,
    handleFixerError,
    createFixerLogMessages,
    createSourceFileParseError,
    createMissingImportError
} from '../utils/helpers';
import { isExternalModule } from '../utils/modules';

const logger = createObjectLogger({ name: 'TS2724Fixer' }, 'TS2724Fixer');

/**
 * Fix TS2724 "Incorrect named import" errors
 * Replaces incorrect named imports with the suggested correct ones from TypeScript
 */
export async function fixIncorrectNamedImport(
    context: FixerContext,
    issues: CodeIssue[]
): Promise<FixResult> {
    const logs = createFixerLogMessages('TS2724Fixer', issues.length);
    logger.info(logs.start);
    
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues: UnfixableIssue[] = [];
    const modifiedFiles: FileObject[] = [];
    const newFiles: FileObject[] = [];

    for (const issue of issues) {
        logger.info(logs.processing(issue));
        
        try {
            // Parse the error message to extract module, incorrect import, and suggested import
            const parseResult = parseTS2724ErrorMessage(issue.message);
            if (!parseResult) {
                logger.warn(`Could not parse TS2724 error message: ${issue.message}`);
                unfixableIssues.push(createUnfixableIssue(issue, 'Could not parse error message to extract import names'));
                continue;
            }

            const { moduleSpecifier, incorrectImport, suggestedImport } = parseResult;
            
            // Check for external modules - we can't fix imports from external modules
            if (isExternalModule(moduleSpecifier)) {
                logger.info(`Skipping external module: ${moduleSpecifier}`);
                unfixableIssues.push(createExternalModuleError(issue, moduleSpecifier));
                continue;
            }
            
            // Get source file AST
            const sourceAST = await getFileAST(
                issue.filePath,
                context.files,
                context.fileFetcher,
                context.fetchedFiles as Set<string>
            );
            
            if (!sourceAST) {
                logger.error(`Failed to parse source file: ${issue.filePath}`);
                unfixableIssues.push(createSourceFileParseError(issue));
                continue;
            }
            
            // Find the import statement at the error location
            const importInfo = findImportAtLocation(sourceAST, issue.line);
            if (!importInfo) {
                logger.warn(`No import found at line ${issue.line} in ${issue.filePath}`);
                unfixableIssues.push(createMissingImportError(issue));
                continue;
            }
            
            // Verify the import matches our expected module and incorrect import name
            if (importInfo.moduleSpecifier !== moduleSpecifier) {
                logger.warn(`Module specifier mismatch. Expected: ${moduleSpecifier}, Found: ${importInfo.moduleSpecifier}`);
                unfixableIssues.push(createUnfixableIssue(issue, 'Module specifier does not match error message'));
                continue;
            }
            
            if (!importInfo.namedImports.includes(incorrectImport)) {
                logger.warn(`Incorrect import '${incorrectImport}' not found in named imports: ${importInfo.namedImports.join(', ')}`);
                unfixableIssues.push(createUnfixableIssue(issue, `Named import '${incorrectImport}' not found in import statement`));
                continue;
            }
            
            // Apply the fix: replace incorrect import with suggested import
            const fixedAST = replaceNamedImport(sourceAST, moduleSpecifier, incorrectImport, suggestedImport);
            if (!fixedAST) {
                logger.error(`Failed to replace named import '${incorrectImport}' with '${suggestedImport}'`);
                unfixableIssues.push(createUnfixableIssue(issue, 'Failed to apply import replacement'));
                continue;
            }
            
            // Generate the fixed code
            const { code: fixedCode } = generateCode(fixedAST);
            
            // Create the result
            modifiedFiles.push({
                filePath: issue.filePath,
                fileContents: fixedCode
            });
            
            fixedIssues.push({
                issueCode: issue.ruleId || 'TS2724',
                filePath: issue.filePath,
                line: issue.line,
                column: issue.column,
                originalMessage: issue.message,
                fixApplied: `Replaced incorrect named import '${incorrectImport}' with '${suggestedImport}' in module '${moduleSpecifier}'`,
                fixType: 'import_fix'
            });
            
            logger.info(`Successfully fixed TS2724 issue: replaced '${incorrectImport}' with '${suggestedImport}' in ${issue.filePath}`);
            
        } catch (error) {
            logger.error(`Error fixing TS2724 issue in ${issue.filePath}:`, error);
            unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2724Fixer'));
        }
    }
    
    logger.info(logs.completed(fixedIssues.length, unfixableIssues.length, modifiedFiles.length, newFiles.length));
    
    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles,
        newFiles
    };
}

/**
 * Parse TS2724 error message to extract module specifier, incorrect import, and suggested import
 * 
 * Examples:
 * - "'@/components/ui/sonner' has no exported member named 'toast'. Did you mean 'Toaster'?"
 * - "Module './utils' has no exported member 'utilFunction'. Did you mean 'utilityFunction'?"
 * - "'react' has no exported member named 'useCallback'. Did you mean 'useCallBack'?"
 */
export function parseTS2724ErrorMessage(errorMessage: string): {
    moduleSpecifier: string;
    incorrectImport: string;
    suggestedImport: string;
} | null {
    // Pattern 1: Standard format with single quotes around module
    // "'@/components/ui/sonner' has no exported member named 'toast'. Did you mean 'Toaster'?"
    const pattern1 = /^'([^']+)'\s+has no exported member named\s+'([^']+)'\.?\s+Did you mean\s+'([^']+)'\??\s*$/i;
    const match1 = errorMessage.match(pattern1);
    
    if (match1) {
        return {
            moduleSpecifier: match1[1],
            incorrectImport: match1[2],
            suggestedImport: match1[3]
        };
    }
    
    // Pattern 2: Module format
    // "Module './utils' has no exported member 'utilFunction'. Did you mean 'utilityFunction'?"
    const pattern2 = /^Module\s+'([^']+)'\s+has no exported member\s+'([^']+)'\.?\s+Did you mean\s+'([^']+)'\??\s*$/i;
    const match2 = errorMessage.match(pattern2);
    
    if (match2) {
        return {
            moduleSpecifier: match2[1],
            incorrectImport: match2[2],
            suggestedImport: match2[3]
        };
    }
    
    // Pattern 3: Alternative format with "named" keyword
    // "'react' has no exported member named 'useCallback'. Did you mean 'useCallBack'?"
    const pattern3 = /^'([^']+)'\s+has no exported member\s+named\s+'([^']+)'\.?\s+Did you mean\s+'([^']+)'\??\s*$/i;
    const match3 = errorMessage.match(pattern3);
    
    if (match3) {
        return {
            moduleSpecifier: match3[1],
            incorrectImport: match3[2],
            suggestedImport: match3[3]
        };
    }
    
    // Pattern 4: Handle double quotes instead of single quotes
    // '"@/components/ui/sonner" has no exported member named "toast". Did you mean "Toaster"?'
    const pattern4 = /^"([^"]+)"\s+has no exported member named\s+"([^"]+)"\.?\s+Did you mean\s+"([^"]+)"\??\s*$/i;
    const match4 = errorMessage.match(pattern4);
    
    if (match4) {
        return {
            moduleSpecifier: match4[1],
            incorrectImport: match4[2],
            suggestedImport: match4[3]
        };
    }
    
    return null;
}

/**
 * Replace a named import in the AST with a different named import
 */
export function replaceNamedImport(
    ast: t.File,
    moduleSpecifier: string,
    oldImportName: string,
    newImportName: string
): t.File | null {
    let importReplaced = false;
    
    // Create a copy of the AST to avoid mutating the original
    const newAST = t.cloneNode(ast, true, true);
    
    // Traverse the AST to find and replace the import
    t.traverseFast(newAST, (node) => {
        if (t.isImportDeclaration(node) && node.source.value === moduleSpecifier) {
            // Find the specific named import to replace
            node.specifiers = node.specifiers.map(specifier => {
                if (t.isImportSpecifier(specifier)) {
                    // Handle both regular named imports and aliased imports
                    const importedName = t.isIdentifier(specifier.imported) 
                        ? specifier.imported.name 
                        : specifier.imported.value;
                    
                    if (importedName === oldImportName) {
                        // Replace with the new import name
                        const newSpecifier = t.importSpecifier(
                            specifier.local, // Keep the same local name
                            t.identifier(newImportName) // Use the new imported name
                        );
                        importReplaced = true;
                        return newSpecifier;
                    }
                }
                return specifier;
            });
        }
    });
    
    return importReplaced ? newAST : null;
}
