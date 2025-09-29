import { describe, expect, it } from 'vitest';
import { GenerationContext } from './GenerationContext';
import type { Blueprint } from '../../schemas';
import type { FileTreeNode, TemplateDetails } from '../../../services/sandbox/sandboxTypes';
import type { FileOutputType } from '../../schemas';
import type { PhaseState } from '../../core/state';

const baseBlueprint = {} as Blueprint;

function createTemplateDetails(fileTree: FileTreeNode, files: FileOutputType[] = []): TemplateDetails {
    return {
        name: 'test-template',
        description: {
            selection: 'selection',
            usage: 'usage'
        },
        fileTree,
        files: files.map(file => ({
            filePath: file.filePath,
            fileContents: file.fileContents
        })),
        language: 'typescript',
        deps: {},
        frameworks: [],
        dontTouchFiles: [],
        redactedFiles: []
    };
}

function createContext({
    templateTree,
    allFiles = []
}: {
    templateTree: FileTreeNode;
    allFiles?: FileOutputType[];
}): GenerationContext {
    const templateDetails = createTemplateDetails(templateTree, allFiles);

    return new GenerationContext(
        'query',
        baseBlueprint,
        templateDetails,
        {},
        allFiles,
        [] as PhaseState[],
        []
    );
}

function fileOutput(path: string): FileOutputType {
    return {
        filePath: path,
        fileContents: '// test',
        filePurpose: 'test'
    };
}

function collectPaths(tree: FileTreeNode) {
    const directories: string[] = [];
    const files: string[] = [];

    const visit = (node: FileTreeNode) => {
        if (node.type === 'directory') {
            directories.push(node.path);
            node.children?.forEach(visit);
            return;
        }

        files.push(node.path);
    };

    visit(tree);

    return { directories, files };
}

describe('GenerationContext.getFileTree', () => {
    it('clones the template tree without mutating the original', () => {
        const templateTree: FileTreeNode = {
            path: '',
            type: 'directory',
            children: [
                {
                    path: 'README.md',
                    type: 'file'
                },
                {
                    path: 'src',
                    type: 'directory',
                    children: [
                        {
                            path: 'src/App.tsx',
                            type: 'file'
                        },
                        {
                            path: 'src/lib',
                            type: 'directory',
                            children: []
                        }
                    ]
                }
            ]
        };

        const templateSnapshot = JSON.parse(JSON.stringify(templateTree));

        const context = createContext({
            templateTree,
            allFiles: [fileOutput('README.md'), fileOutput('src/App.tsx')]
        });

        const tree = context.getFileTree();

        expect(tree).toEqual({
            path: '',
            type: 'directory',
            children: [
                {
                    path: 'src',
                    type: 'directory',
                    children: [
                        {
                            path: 'src/lib',
                            type: 'directory',
                            children: []
                        },
                        {
                            path: 'src/App.tsx',
                            type: 'file'
                        }
                    ]
                },
                {
                    path: 'README.md',
                    type: 'file'
                }
            ]
        });

        expect(templateTree).toEqual(templateSnapshot);
    });

    it('creates missing directories for generated files not present in the template tree', () => {
        const context = createContext({
            templateTree: {
                path: '',
                type: 'directory',
                children: []
            },
            allFiles: [
                fileOutput('src/features/dashboard/view/index.tsx'),
                fileOutput('src/features/dashboard/view/utils/helpers.ts')
            ]
        });

        const tree = context.getFileTree();
        const { directories, files } = collectPaths(tree);

        expect(directories).toEqual([
            '',
            'src',
            'src/features',
            'src/features/dashboard',
            'src/features/dashboard/view',
            'src/features/dashboard/view/utils'
        ]);

        expect(files).toEqual([
            'src/features/dashboard/view/utils/helpers.ts',
            'src/features/dashboard/view/index.tsx'
        ]);
    });

    it('normalizes different path formats and prevents duplicates', () => {
        const context = createContext({
            templateTree: {
                path: '',
                type: 'directory',
                children: []
            },
            allFiles: [
                fileOutput('./src/Components/Button.tsx'),
                fileOutput('src/Components/Button.tsx'),
                fileOutput('src/Components/../Components/Input.tsx'),
                fileOutput('src\\Components\\Card.tsx'),
                fileOutput('/src/Components/Badge.tsx')
            ]
        });

        const tree = context.getFileTree();
        const { directories, files } = collectPaths(tree);

        expect(directories).toEqual(['', 'src', 'src/Components']);

        expect(files).toEqual([
            'src/Components/Badge.tsx',
            'src/Components/Button.tsx',
            'src/Components/Card.tsx',
            'src/Components/Input.tsx'
        ]);

        expect(files.filter(path => path === 'src/Components/Button.tsx')).toHaveLength(1);
    });

    it('ignores paths that attempt to escape the project root', () => {
        const context = createContext({
            templateTree: {
                path: '',
                type: 'directory',
                children: []
            },
            allFiles: [
                fileOutput('../secrets.env'),
                fileOutput('../../etc/passwd'),
                fileOutput('./../outside.txt')
            ]
        });

        const tree = context.getFileTree();
        const { directories, files } = collectPaths(tree);

        expect(directories).toEqual(['']);
        expect(files).toEqual([]);
    });

    it('merges template directories with generated files while keeping directory-first sorting', () => {
        const templateTree: FileTreeNode = {
            path: '',
            type: 'directory',
            children: [
                {
                    path: 'docs',
                    type: 'directory',
                    children: [
                        {
                            path: 'docs/intro.md',
                            type: 'file'
                        }
                    ]
                },
                {
                    path: 'package.json',
                    type: 'file'
                }
            ]
        };

        const context = createContext({
            templateTree,
            allFiles: [
                fileOutput('docs/intro.md'),
                fileOutput('CHANGELOG.md'),
                fileOutput('src/main.ts')
            ]
        });

        const tree = context.getFileTree();

        expect(tree.children).toEqual([
            {
                path: 'docs',
                type: 'directory',
                children: [
                    {
                        path: 'docs/intro.md',
                        type: 'file'
                    }
                ]
            },
            {
                path: 'src',
                type: 'directory',
                children: [
                    {
                        path: 'src/main.ts',
                        type: 'file'
                    }
                ]
            },
            {
                path: 'CHANGELOG.md',
                type: 'file'
            },
            {
                path: 'package.json',
                type: 'file'
            }
        ]);
    });
});
