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
 * Enhanced with better pattern detection and multi-line context
 */
function analyzeUsageContext(fileContent: string, name: string, line: number): string {
    const lines = fileContent.split('\n');
    
    // Get context: current line and surrounding lines
    const startLine = Math.max(0, line - 3);
    const endLine = Math.min(lines.length, line + 2);
    const contextLines = lines.slice(startLine, endLine).join('\n');
    const errorLine = lines[line - 1] || '';
    
    // Enhanced pattern detection with priority order
    
    // 1. Class instantiation - check for 'new' keyword
    // Look for: new Name( or new Name<T>( or new Name ()
    const classPattern = new RegExp(`new\\s+${name}\\s*[<(]`, 'g');
    if (classPattern.test(contextLines)) {
        return 'class';
    }
    
    // 2. React/JSX component - check for JSX usage
    // Look for: <Name or <Name> or <Name/> or <Name prop=
    const jsxPattern = new RegExp(`<${name}(?:\\s|>|\/>)`, 'g');
    if (jsxPattern.test(contextLines)) {
        return 'react_component';
    }
    
    // 3. Function call - check for invocation
    // Look for: Name( or Name.method( but not new Name(
    const functionPattern = new RegExp(`(?<!new\\s)\\b${name}\\s*\\(`, 'g');
    if (functionPattern.test(errorLine)) {
        return 'function';
    }
    
    // 4. Type usage - check for TypeScript type contexts
    // Look for: : Name or extends Name or implements Name or Name<
    const typePattern = new RegExp(`(?::|extends|implements)\\s+${name}\\b|\\b${name}\\s*<`, 'g');
    if (typePattern.test(contextLines)) {
        return 'type_or_interface';
    }
    
    // 5. Object property/method access
    // Look for: Name.property or Name.method() or Name?.property
    const objectPattern = new RegExp(`\\b${name}\\s*\\.\\??\\.`, 'g');
    if (objectPattern.test(errorLine)) {
        return 'object';
    }
    
    // 6. Array or object indexing
    // Look for: Name[index] or Name['key']
    const indexPattern = new RegExp(`\\b${name}\\s*\\[`, 'g');
    if (indexPattern.test(errorLine)) {
        return 'array_or_object';
    }
    
    // 7. Assignment target - check if being assigned to
    // Look for: Name = value or let/const/var Name
    const assignmentPattern = new RegExp(`\\b${name}\\s*=(?!=)`, 'g');
    const declarationPattern = new RegExp(`\\b(let|const|var)\\s+${name}\\b`, 'g');
    if (assignmentPattern.test(errorLine) && !declarationPattern.test(errorLine)) {
        return 'variable';
    }
    
    // 8. Enum or constant usage
    // Look for: Name.CONSTANT or usage in switch cases
    const enumPattern = new RegExp(`\\b${name}\\.[A-Z_][A-Z0-9_]*\\b`, 'g');
    if (enumPattern.test(contextLines)) {
        return 'enum_or_constants';
    }
    
    // 9. Check if used as a value in expressions
    // Look for usage in conditions, returns, etc.
    const valuePattern = new RegExp(`(return|if|while|for|switch|case|throw).*\\b${name}\\b`, 'g');
    if (valuePattern.test(errorLine)) {
        return 'value';
    }
    
    return 'unknown';
}

/**
 * Generate appropriate declaration based on usage context
 * Enhanced with better TypeScript declarations and proper AST nodes
 */
function generateDeclaration(name: string, context: string): string {
    switch (context) {
        case 'react_component':
            // Proper React component with props interface
            return `
interface ${name}Props {
    // TODO: Define props
    [key: string]: any;
}

const ${name}: React.FC<${name}Props> = (props) => {
    return <div>Placeholder ${name} component</div>;
};`;
        
        case 'function':
            // Function with proper typing and JSDoc
            return `
/**
 * TODO: Implement ${name} function
 * @param args - Function arguments
 * @returns Function result
 */
function ${name}(...args: any[]): any {
    // TODO: Implement ${name}
    console.warn('${name} is not implemented');
    return null;
}`;
        
        case 'class':
            // Proper class with constructor and common methods
            return `
/**
 * TODO: Implement ${name} class
 */
class ${name} {
    constructor(...args: any[]) {
        // TODO: Initialize ${name}
        console.warn('${name} constructor called with:', args);
    }
    
    // TODO: Add methods
}`;
        
        case 'type_or_interface':
            // TypeScript type or interface
            return `
/**
 * TODO: Define ${name} type
 */
type ${name} = {
    // TODO: Add type properties
    [key: string]: any;
};`;
        
        case 'object':
            // Object with common patterns
            return `
/**
 * TODO: Implement ${name} object
 */
const ${name} = {
    // TODO: Add properties and methods
    // Example method:
    someMethod: (...args: any[]) => {
        console.warn('${name}.someMethod not implemented');
        return null;
    }
} as const;`;
        
        case 'array_or_object':
            // Array or indexable object
            return `
/**
 * TODO: Initialize ${name} array/object
 */
const ${name}: any[] | Record<string, any> = [];
// If this should be an object instead, use: const ${name}: Record<string, any> = {};`;
        
        case 'enum_or_constants':
            // Enum-like object with constants
            return `
/**
 * TODO: Define ${name} constants
 */
const ${name} = {
    // TODO: Add constants
    DEFAULT: 'default',
    // Add more constants as needed
} as const;

export type ${name}Type = typeof ${name}[keyof typeof ${name}];`;
        
        case 'variable':
            // Mutable variable
            return `
/**
 * TODO: Initialize ${name} variable
 */
let ${name}: any = null;
// TODO: Set proper type and initial value`;
        
        case 'value':
            // Constant value
            return `
/**
 * TODO: Define ${name} value
 */
const ${name} = null; // TODO: Set actual value`;
        
        default:
            // Generic fallback with helpful comment
            return `
/**
 * TODO: Implement ${name}
 * Unable to determine the exact type from usage context.
 * Please update the type and implementation based on actual requirements.
 */
const ${name}: any = null;`;
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

