import type { ToolDefinition } from './types';

export async function executeToolWithDefinition<TArgs, TResult>(
	toolDef: ToolDefinition<TArgs, TResult>,
	args: TArgs
): Promise<TResult> {
	return toolDef.implementation(args);
}

// export async function executeTool(
// 	name: string,
// 	args: Record<string, unknown>,
// ): Promise<ToolResult> {
// 	try {
// 		switch (name) {
// 			case 'get_weather':
// 				return {
// 					location: args.location as string,
// 					temperature: Math.floor(Math.random() * 40) - 10,
// 					condition: ['Sunny', 'Cloudy', 'Rainy', 'Snowy'][
// 						Math.floor(Math.random() * 4)
// 					],
// 					humidity: Math.floor(Math.random() * 100),
// 				};

// 			case 'web_search': return toolWebSearch(args);

// 			default: {
// 				const content = await mcpManager.executeTool(name, args);
// 				return { content };
// 			}
// 		}
// 	} catch (error) {
// 		return {
// 			error: error instanceof Error ? error.message : 'Unknown error',
// 		};
// 	}
// }
