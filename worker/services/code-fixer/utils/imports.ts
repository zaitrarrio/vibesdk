/**
 * Import/export analysis utilities using Babel AST traversal
 * Extracted from working ImportExportAnalyzer to preserve exact functionality
 */

import * as t from '@babel/types';
import { ImportInfo, ExportInfo, ImportUsage, FileMap, FileFetcher } from '../types';
import { parseCode, traverseAST, isScriptFile } from './ast';
import { createObjectLogger } from '../../../logger';

const logger = createObjectLogger({ name: 'ImportUtils' }, 'ImportUtils');

// ============================================================================
// IMPORT ANALYSIS
// ============================================================================

/**
 * Find import information at a specific line number in the AST
 * Preserves exact logic from working implementation
 */
export function findImportAtLocation(ast: t.File, line: number): ImportInfo | null {
    logger.debug(`Finding import at line ${line}`);
    let foundImport: ImportInfo | null = null;
    const allImports: Array<{ line: number; moduleSpecifier: string; defaultImport: string | undefined; namedImports: string[]; }> = [];
    
    traverseAST(ast, {
        ImportDeclaration(path) {
            const moduleSpecifier = t.isStringLiteral(path.node.source) ? path.node.source.value : '';
            const defaultImport = path.node.specifiers.find(s => t.isImportDefaultSpecifier(s))?.local.name;
            const namedImports = path.node.specifiers
                .filter(s => t.isImportSpecifier(s))
                .map(s => t.isImportSpecifier(s) && t.isIdentifier(s.imported) ? s.imported.name : '')
                .filter(Boolean);
            
            const importData = {
                line: path.node.loc?.start.line || 0,
                moduleSpecifier,
                defaultImport,
                namedImports
            };
            
            allImports.push(importData);
            
            if (path.node.loc) {
                const startLine = path.node.loc.start.line;
                const endLine = path.node.loc.end.line;
                
                if (startLine <= line && endLine >= line) {
                    foundImport = {
                        specifier: moduleSpecifier,
                        moduleSpecifier: moduleSpecifier,
                        defaultImport,
                        namedImports,
                        filePath: '',
                    };
                }
            }
        }
    });
    
    if (foundImport) {
        logger.debug(`Found import at line ${line}: ${foundImport}`);
    } else {
        logger.debug(`No import found at line ${line}. Available imports: ${allImports.map(i => `${i.moduleSpecifier}:${i.line}`).join(', ')}`);
    }
    
    return foundImport;
}

/**
 * Get all imports from a file AST
 */
export function getAllImports(ast: t.File): ImportInfo[] {
    const imports: ImportInfo[] = [];
    
    traverseAST(ast, {
        ImportDeclaration(path) {
            const moduleSpecifier = t.isStringLiteral(path.node.source) ? path.node.source.value : '';
            const defaultImport = path.node.specifiers.find(s => t.isImportDefaultSpecifier(s))?.local.name;
            const namedImports = path.node.specifiers
                .filter(s => t.isImportSpecifier(s))
                .map(s => t.isImportSpecifier(s) && t.isIdentifier(s.imported) ? s.imported.name : '')
                .filter(Boolean);
            
            imports.push({
                specifier: moduleSpecifier,
                moduleSpecifier: moduleSpecifier,
                defaultImport,
                namedImports,
                filePath: '',
            });
        }
    });
    
    return imports;
}

// ============================================================================
// EXPORT ANALYSIS
// ============================================================================

/**
 * Get exports information from a file AST
 * Preserves exact logic from working implementation
 */
export function getFileExports(ast: t.File): ExportInfo {
    logger.debug(`Analyzing exports in file`);
    const namedExports: string[] = [];
    let defaultExport: string | undefined;

    traverseAST(ast, {
        ExportNamedDeclaration(path) {
            // Handle export { name1, name2 } from 'module'
            if (path.node.specifiers) {
                for (const spec of path.node.specifiers) {
                    if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
                        namedExports.push(spec.exported.name);
                    }
                }
            }
            
            // Handle export const/function/class declarations
            if (path.node.declaration) {
                if (t.isVariableDeclaration(path.node.declaration)) {
                    for (const declarator of path.node.declaration.declarations) {
                        if (t.isIdentifier(declarator.id)) {
                            namedExports.push(declarator.id.name);
                        }
                    }
                } else if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
                    namedExports.push(path.node.declaration.id.name);
                } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
                    namedExports.push(path.node.declaration.id.name);
                }
            }
        },
        
        ExportDefaultDeclaration(path) {
            // Handle default exports
            if (t.isIdentifier(path.node.declaration)) {
                defaultExport = path.node.declaration.name;
            } else if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
                defaultExport = path.node.declaration.id.name;
            } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
                defaultExport = path.node.declaration.id.name;
            } else {
                defaultExport = 'default';
            }
        }
    });

    return {
        defaultExport,
        namedExports,
        filePath: '',
    };
}

// ============================================================================
// USAGE ANALYSIS
// ============================================================================

/**
 * Analyze how imported names are used in the source file AST
 * Preserves exact logic from working implementation
 */
export function analyzeImportUsage(ast: t.File, importNames: string[]): ImportUsage[] {
    const usages: ImportUsage[] = [];

    for (const importName of importNames) {
        const usage = analyzeNameUsage(ast, importName);
        if (usage) {
            usages.push(usage);
        }
    }

    return usages;
}

/**
 * Analyze how a specific imported name is used in the AST
 * Preserves exact logic from working implementation
 */
export function analyzeNameUsage(ast: t.File, name: string): ImportUsage | null {
    let usage: ImportUsage | null = null;
    const properties: string[] = [];

    traverseAST(ast, {
        // Check for JSX component usage: <Name prop="value" />
        JSXElement: (path) => {
            if (t.isJSXIdentifier(path.node.openingElement.name) && 
                path.node.openingElement.name.name === name) {
                
                // Extract prop names from JSX attributes
                const propNames = path.node.openingElement.attributes
                    .filter(attr => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name))
                    .map(attr => {
                        const jsxAttr = attr as t.JSXAttribute;
                        return t.isJSXIdentifier(jsxAttr.name) ? jsxAttr.name.name : '';
                    })
                    .filter(name => name !== '');
                
                properties.push(...propNames);
                usage = {
                    name,
                    type: 'jsx-component',
                    properties: [...new Set(properties)] // Remove duplicates
                };
            }
        },

        // Check for function call usage: Name(arg1, arg2)
        CallExpression: (path) => {
            if (t.isIdentifier(path.node.callee) && path.node.callee.name === name) {
                // Analyze parameters
                const argTypes = path.node.arguments.map(arg => {
                    if (t.isStringLiteral(arg)) return 'string';
                    if (t.isNumericLiteral(arg)) return 'number';
                    if (t.isBooleanLiteral(arg)) return 'boolean';
                    if (t.isObjectExpression(arg)) return 'object';
                    if (t.isArrayExpression(arg)) return 'array';
                    return 'unknown';
                });

                usage = {
                    name,
                    type: 'function-call',
                    parameters: argTypes
                };
            }
        },

        // Check for object property access: Name.property
        MemberExpression: (path) => {
            if (t.isIdentifier(path.node.object) && path.node.object.name === name) {
                if (t.isIdentifier(path.node.property)) {
                    properties.push(path.node.property.name);
                }
                
                usage = {
                    name,
                    type: 'object-access',
                    properties: [...new Set(properties)] // Remove duplicates
                };
            }
        },

        // Check for simple variable reference: const x = Name;
        Identifier: (path) => {
            if (path.node.name === name && 
                !path.isBindingIdentifier() && 
                !usage) { // Only set as fallback if no specific usage found
                
                usage = {
                    name,
                    type: 'variable-reference'
                };
            }
        }
    });

    return usage;
}

// ============================================================================
// FILE READING WITH AST CACHING
// ============================================================================

/**
 * Get file content from FileMap or fetch it if not available
 */
export async function getFileContent(
    filePath: string, 
    files: FileMap, 
    fileFetcher?: FileFetcher,
    fetchedFiles?: Set<string>
): Promise<string | null> {
    logger.info(`ImportUtils: Getting content for file: ${filePath}`);
    
    const file = files.get(filePath);
    if (file) {
        logger.info(`ImportUtils: Found file in context: ${filePath}`);
        return file.content;
    }
    
    // Try to fetch if not available and we have a fetcher
    if (fileFetcher && fetchedFiles && !fetchedFiles.has(filePath)) {
        try {
            logger.info(`ImportUtils: Fetching file: ${filePath}`);
            fetchedFiles.add(filePath); // Mark as attempted
            const result = await fileFetcher(filePath);
            
            if (result && isScriptFile(result.filePath)) {
                logger.info(`ImportUtils: Successfully fetched ${filePath}, storing in files map`);
                // Store the fetched file in the mutable files map
                files.set(filePath, {
                    filePath: filePath,
                    content: result.fileContents,
                    ast: undefined
                });
                return result.fileContents;
            } else {
                logger.info(`ImportUtils: File ${filePath} was fetched but is not a script file or result is null`);
            }
        } catch (error) {
            logger.warn(`ImportUtils: Failed to fetch file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    } else {
        logger.info(`ImportUtils: Not fetching ${filePath} - fileFetcher: ${!!fileFetcher}, fetchedFiles: ${!!fetchedFiles}, alreadyFetched: ${fetchedFiles?.has(filePath)}`);
    }
    
    return null;
}

/**
 * Get file AST from FileMap with caching, or parse it if needed
 */
export async function getFileAST(
    filePath: string, 
    files: FileMap, 
    fileFetcher?: FileFetcher,
    fetchedFiles?: Set<string>
): Promise<t.File | null> {
    logger.info(`ImportUtils: Getting AST for file: ${filePath}`);
    
    const file = files.get(filePath);
    
    if (file?.ast) {
        logger.info(`ImportUtils: Using cached AST for ${filePath}`);
        return file.ast;
    }
    
    const content = await getFileContent(filePath, files, fileFetcher, fetchedFiles);
    if (!content) {
        logger.info(`ImportUtils: No content available for ${filePath}`);
        return null;
    }
    
    logger.info(`ImportUtils: Attempting to parse AST for ${filePath} (${content.length} characters)`);
    logger.info(`ImportUtils: First 200 characters: ${content.substring(0, 200)}`);
    
    try {
        const ast = parseCode(content);
        logger.info(`ImportUtils: Successfully parsed AST for ${filePath}`);
        return ast;
    } catch (error) {
        logger.warn(`ImportUtils: Failed to parse AST for ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}

// ============================================================================
// IMPORT PATH UPDATING
// ============================================================================

/**
 * Update import path in AST by modifying the source value
 */
export function updateImportPath(ast: t.File, oldPath: string, newPath: string): t.File {
    traverseAST(ast, {
        ImportDeclaration(path) {
            if (t.isStringLiteral(path.node.source) && path.node.source.value === oldPath) {
                path.node.source.value = newPath;
            }
        }
    });
    
    return ast;
}

/**
 * Fix import/export mismatches by converting between default and named imports
 */
export function fixImportExportMismatch(
    ast: t.File, 
    moduleSpecifier: string, 
    exports: ExportInfo
): { fixed: boolean; changes: string[] } {
    let fixed = false;
    const changes: string[] = [];

    traverseAST(ast, {
        ImportDeclaration(path) {
            if (t.isStringLiteral(path.node.source) && path.node.source.value === moduleSpecifier) {
                const defaultImport = path.node.specifiers.find(s => t.isImportDefaultSpecifier(s));
                const namedImports = path.node.specifiers.filter(s => t.isImportSpecifier(s));

                // Fix default import issues
                if (defaultImport && !exports.defaultExport) {
                    const defaultName = defaultImport.local.name;
                    if (exports.namedExports.includes(defaultName)) {
                        // Remove default import, add as named import
                        path.node.specifiers = path.node.specifiers.filter(s => s !== defaultImport);
                        path.node.specifiers.push(t.importSpecifier(t.identifier(defaultName), t.identifier(defaultName)));
                        changes.push(`Changed default import to named import for "${defaultName}"`);
                        fixed = true;
                    }
                }

                // Fix named import issues
                for (const namedImport of namedImports) {
                    if (t.isImportSpecifier(namedImport) && t.isIdentifier(namedImport.imported)) {
                        const namedImportName = namedImport.imported.name;
                        if (!exports.namedExports.includes(namedImportName) && exports.defaultExport === namedImportName) {
                            // Remove named import, add as default import
                            path.node.specifiers = path.node.specifiers.filter(s => s !== namedImport);
                            if (!defaultImport) {
                                path.node.specifiers.unshift(t.importDefaultSpecifier(t.identifier(namedImportName)));
                                changes.push(`Changed named import to default import for "${namedImportName}"`);
                                fixed = true;
                            }
                        }
                    }
                }
            }
        }
    });

    return { fixed, changes };
}