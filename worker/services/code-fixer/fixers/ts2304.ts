/**
 * TS2304: Cannot find name fixer
 * Handles undefined names by creating placeholder declarations
 */

import * as t from '@babel/types';
import type { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, UnfixableIssue, FileObject } from '../types';
import { generateCode, parseCode } from '../utils/ast';
import { getFileContent } from '../utils/imports';
import { handleFixerError } from '../utils/helpers';

/**
 * Fix TS2304 "Cannot find name" errors
 * Preserves exact logic from working DeclarationFixer.fixUndefinedName
 */
export async function fixUndefinedName(
    context: FixerContext,
    issues: CodeIssue[]
): Promise<FixResult> {
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues: UnfixableIssue[] = [];
    const modifiedFiles: FileObject[] = [];
    const newFiles: FileObject[] = [];
    const fetchedFiles = new Set(context.fetchedFiles);

    for (const issue of issues) {
        try {
            const fileContent = await getFileContent(
                issue.filePath, 
                context.files, 
                context.fileFetcher, 
                fetchedFiles
            );
            
            if (!fileContent) {
                unfixableIssues.push({
                    issueCode: 'TS2304',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'File content not available'
                });
                continue;
            }

            const ast = parseCode(fileContent);

            // Extract the undefined name from the error message
            const undefinedName = extractUndefinedName(issue.message);
            if (!undefinedName) {
                unfixableIssues.push({
                    issueCode: 'TS2304',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: 'Could not extract undefined name from error message'
                });
                continue;
            }

            // Skip common global variables that shouldn't be declared
            if (isGlobalVariable(undefinedName)) {
                unfixableIssues.push({
                    issueCode: 'TS2304',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    reason: `${undefinedName} is a global variable and should not be declared`
                });
                continue;
            }

            // Analyze how the name is used to infer the appropriate declaration
            const usageContext = analyzeUsageContext(fileContent, undefinedName, issue.line);
            const declaration = generateDeclaration(undefinedName, usageContext);

            // Add declaration at the top of the file after imports
            const updatedAST = addDeclarationToAST(ast, declaration);
            const generatedCode = generateCode(updatedAST);

            modifiedFiles.push({
                filePath: issue.filePath,
                fileContents: generatedCode.code,
            });

            fixedIssues.push({
                issueCode: 'TS2304',
                filePath: issue.filePath,
                line: issue.line,
                column: issue.column,
                originalMessage: issue.message,
                fixApplied: `Added declaration: ${declaration}`,
                fixType: 'declaration_fix',
            });
        } catch (error) {
            unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2304Fixer'));
        }
    }

    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles,
        newFiles
    };
}

/**
 * Extract undefined name from error message
 */
function extractUndefinedName(message: string): string | null {
    // Extract name from messages like "Cannot find name 'SomeName'"
    const match = message.match(/Cannot find name '([^']+)'/);
    return match ? match[1] : null;
}

/**
 * Check if a name is a global variable that shouldn't be declared
 */
function isGlobalVariable(name: string): boolean {
    const globalVars = [
        'window', 'document', 'console', 'process', 'global', 'Buffer',
        'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        'fetch', 'localStorage', 'sessionStorage', 'location', 'history'
    ];
    return globalVars.includes(name);
}

/**
 * Analyze usage context to infer the appropriate declaration type
 */
function analyzeUsageContext(fileContent: string, name: string, line: number): string {
    // Get the line where the error occurs
    const lines = fileContent.split('\n');
    const errorLine = lines[line - 1] || '';
    
    // Analyze patterns to infer type
    if (errorLine.includes(`<${name}`)) {
        return 'react_component';
    }
    if (errorLine.includes(`${name}(`)) {
        return 'function';
    }
    if (errorLine.includes(`new ${name}(`)) {
        return 'class';
    }
    if (errorLine.includes(`${name}.`)) {
        return 'object';
    }
    if (errorLine.includes(`${name}[`)) {
        return 'array_or_object';
    }
    if (errorLine.match(new RegExp(`\\b${name}\\s*=`))) {
        return 'variable';
    }
    
    return 'unknown';
}

/**
 * Generate appropriate declaration based on usage context
 */
function generateDeclaration(name: string, context: string): string {
    switch (context) {
        case 'react_component':
            return `const ${name}: React.FC<any> = () => <div>Placeholder ${name}</div>;`;
        case 'function':
            return `const ${name} = (...args: any[]) => { /* TODO: Implement ${name} */ return null; };`;
        case 'class':
            return `class ${name} { constructor(...args: any[]) { /* TODO: Implement ${name} */ } }`;
        case 'object':
            return `const ${name}: Record<string, any> = { /* TODO: Implement ${name} */ };`;
        case 'array_or_object':
            return `const ${name}: any[] | Record<string, any> = [];`;
        case 'variable':
            return `let ${name}: any = null; // TODO: Set proper type and value`;
        default:
            return `const ${name}: any = null; // TODO: Implement ${name}`;
    }
}

/**
 * Add declaration to AST at appropriate location
 */
function addDeclarationToAST(ast: t.File, declaration: string): t.File {
    try {
        // Parse the declaration as a statement
        const declarationAst = parseCode(declaration);
        const declarationStatement = declarationAst.program.body[0];
        
        if (declarationStatement) {
            // Find the position after imports to insert the declaration
            let insertIndex = 0;
            for (let i = 0; i < ast.program.body.length; i++) {
                const statement = ast.program.body[i];
                if (t.isImportDeclaration(statement)) {
                    insertIndex = i + 1;
                } else {
                    break;
                }
            }
            
            // Insert the declaration
            ast.program.body.splice(insertIndex, 0, declarationStatement);
        }
    } catch (error) {
        // Fallback: just add as comment if parsing fails
        const commentStatement = t.expressionStatement(
            t.identifier(`/* ${declaration} */`)
        );
        ast.program.body.unshift(commentStatement);
    }
    
    return ast;
}

