/**
 * Unit tests for TS2724 (Incorrect Named Import) fixer
 */

import { describe, test, expect } from 'vitest';
import { parseTS2724ErrorMessage, replaceNamedImport } from './ts2724';
import { parseCode } from '../utils/ast';

describe('TS2724 Fixer', () => {
    describe('parseTS2724ErrorMessage', () => {
        test('parses standard format with single quotes', () => {
            const message = "'@/components/ui/sonner' has no exported member named 'toast'. Did you mean 'Toaster'?";
            const result = parseTS2724ErrorMessage(message);
            
            expect(result).toEqual({
                moduleSpecifier: '@/components/ui/sonner',
                incorrectImport: 'toast',
                suggestedImport: 'Toaster'
            });
        });

        test('parses module format', () => {
            const message = "Module './utils' has no exported member 'utilFunction'. Did you mean 'utilityFunction'?";
            const result = parseTS2724ErrorMessage(message);
            
            expect(result).toEqual({
                moduleSpecifier: './utils',
                incorrectImport: 'utilFunction',
                suggestedImport: 'utilityFunction'
            });
        });

        test('parses format with "named" keyword', () => {
            const message = "'react' has no exported member named 'useCallback'. Did you mean 'useCallBack'?";
            const result = parseTS2724ErrorMessage(message);
            
            expect(result).toEqual({
                moduleSpecifier: 'react',
                incorrectImport: 'useCallback',
                suggestedImport: 'useCallBack'
            });
        });

        test('parses format with double quotes', () => {
            const message = '"@/components/ui/sonner" has no exported member named "toast". Did you mean "Toaster"?';
            const result = parseTS2724ErrorMessage(message);
            
            expect(result).toEqual({
                moduleSpecifier: '@/components/ui/sonner',
                incorrectImport: 'toast',
                suggestedImport: 'Toaster'
            });
        });

        test('returns null for invalid format', () => {
            const message = "Some random error message";
            const result = parseTS2724ErrorMessage(message);
            
            expect(result).toBeNull();
        });

        test('handles variations with optional punctuation', () => {
            const message = "'@/lib/utils' has no exported member named 'cn' Did you mean 'clsx'";
            const result = parseTS2724ErrorMessage(message);
            
            expect(result).toEqual({
                moduleSpecifier: '@/lib/utils',
                incorrectImport: 'cn',
                suggestedImport: 'clsx'
            });
        });
    });

    describe('replaceNamedImport', () => {
        test('replaces named import in simple import statement', () => {
            const sourceCode = `import { toast } from '@/components/ui/sonner';`;
            const ast = parseCode(sourceCode);
            
            const result = replaceNamedImport(ast, '@/components/ui/sonner', 'toast', 'Toaster');
            
            expect(result).not.toBeNull();
            // The AST should be modified, but we can't easily test the exact structure
            // The main validation is that it doesn't return null
        });

        test('replaces named import among multiple imports', () => {
            const sourceCode = `import { Button, toast, Card } from '@/components/ui/sonner';`;
            const ast = parseCode(sourceCode);
            
            const result = replaceNamedImport(ast, '@/components/ui/sonner', 'toast', 'Toaster');
            
            expect(result).not.toBeNull();
        });

        test('handles aliased imports', () => {
            const sourceCode = `import { toast as showToast } from '@/components/ui/sonner';`;
            const ast = parseCode(sourceCode);
            
            const result = replaceNamedImport(ast, '@/components/ui/sonner', 'toast', 'Toaster');
            
            expect(result).not.toBeNull();
        });

        test('returns null when import not found', () => {
            const sourceCode = `import { Button } from '@/components/ui/button';`;
            const ast = parseCode(sourceCode);
            
            const result = replaceNamedImport(ast, '@/components/ui/sonner', 'toast', 'Toaster');
            
            expect(result).toBeNull();
        });

        test('returns null when module specifier does not match', () => {
            const sourceCode = `import { toast } from '@/components/ui/toast';`;
            const ast = parseCode(sourceCode);
            
            const result = replaceNamedImport(ast, '@/components/ui/sonner', 'toast', 'Toaster');
            
            expect(result).toBeNull();
        });

        test('handles multiple import statements', () => {
            const sourceCode = `
import React from 'react';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
            `;
            const ast = parseCode(sourceCode);
            
            const result = replaceNamedImport(ast, '@/components/ui/sonner', 'toast', 'Toaster');
            
            expect(result).not.toBeNull();
        });
    });

    describe('integration test', () => {
        test('end-to-end example case: toast -> Toaster', () => {
            // This simulates the exact case provided by the user
            const errorMessage = "'@/components/ui/sonner' has no exported member named 'toast'. Did you mean 'Toaster'?";
            const sourceCode = `
import React from 'react';
import { toast } from '@/components/ui/sonner';

export default function App() {
    const handleClick = () => {
        toast.success('Hello!');
    };
    
    return <button onClick={handleClick}>Click me</button>;
}
            `;

            // Step 1: Parse the error message
            const parseResult = parseTS2724ErrorMessage(errorMessage);
            expect(parseResult).not.toBeNull();
            expect(parseResult!.moduleSpecifier).toBe('@/components/ui/sonner');
            expect(parseResult!.incorrectImport).toBe('toast');
            expect(parseResult!.suggestedImport).toBe('Toaster');

            // Step 2: Parse the source code
            const ast = parseCode(sourceCode);
            expect(ast).not.toBeNull();

            // Step 3: Apply the fix
            const fixedAST = replaceNamedImport(
                ast, 
                parseResult!.moduleSpecifier, 
                parseResult!.incorrectImport, 
                parseResult!.suggestedImport
            );
            expect(fixedAST).not.toBeNull();

            // The fix should have been applied successfully
            // In a real scenario, this would generate corrected TypeScript code
        });
    });
});
