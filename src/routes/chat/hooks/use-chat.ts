import { WebSocket } from 'partysocket';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    RateLimitExceededError,
	type BlueprintType,
	type WebSocketMessage,
	type CodeFixEdits} from '@/api-types';
import {
	createRepairingJSONParser,
	ndjsonStream,
} from '@/utils/ndjson-parser/ndjson-parser';
import { getFileType } from '@/utils/string';
import { logger } from '@/utils/logger';
import { getPreviewUrl } from '@/lib/utils';
import { generateId } from '@/utils/id-generator';
import { apiClient } from '@/lib/api-client';
import { appEvents } from '@/lib/app-events';
import { toast } from 'sonner';

export interface FileType {
	filePath: string;
	fileContents: string;
	explanation?: string;
	isGenerating?: boolean;
	needsFixing?: boolean;
	hasErrors?: boolean;
	language?: string;
}

export interface ProjectStage {
	id: 'bootstrap' | 'blueprint' | 'code' | 'validate' | 'fix';
	title: string;
	status: 'pending' | 'active' | 'completed' | 'error';
	metadata?: string;
}

// New interface for phase timeline tracking
export interface PhaseTimelineItem {
	id: string;
	name: string;
	description: string;
	files: {
		path: string;
		purpose: string;
		status: 'generating' | 'completed' | 'error' | 'validating';
		contents?: string;
	}[];
	status: 'generating' | 'completed' | 'error' | 'validating';
	timestamp: number;
}

const initialStages: ProjectStage[] = [
	{
		id: 'bootstrap',
		title: 'Bootstrapping project',
		status: 'active',
	},
	{
		id: 'blueprint',
		title: 'Generating Blueprint',
		status: 'pending',
	},
	{ id: 'code', title: 'Generating code', status: 'pending' },
	{ id: 'validate', title: 'Reviewing & fixing code', status: 'pending' },
	{ id: 'fix', title: 'Fixing issues', status: 'pending' },
];

type ChatMessage = {
	type: 'user' | 'ai';
	id: string;
	message: string;
	isThinking?: boolean;
};

// Session token management is now handled by the API client automatically

export function useChat({
	chatId: urlChatId,
	query: userQuery,
	agentMode = 'deterministic',
	onDebugMessage,
	onTerminalMessage,
}: {
	chatId?: string;
	query: string | null;
	agentMode?: 'deterministic' | 'smart';
	onDebugMessage?: (type: 'error' | 'warning' | 'info' | 'websocket', message: string, details?: string, source?: string, messageType?: string, rawMessage?: unknown) => void;
	onTerminalMessage?: (log: { id: string; content: string; type: 'command' | 'stdout' | 'stderr' | 'info' | 'error' | 'warn' | 'debug'; timestamp: number; source?: string }) => void;
}) {
	const connectionStatus = useRef<'idle' | 'connecting' | 'connected' | 'failed' | 'retrying'>('idle');
	const retryCount = useRef(0);
	const maxRetries = 5;
	const retryTimeouts = useRef<NodeJS.Timeout[]>([]);
	const [chatId, setChatId] = useState<string>();
	const [messages, setMessages] = useState<ChatMessage[]>([
		{ type: 'ai', id: 'main', message: 'Thinking...', isThinking: true },
	]);

	const [bootstrapFiles, setBootstrapFiles] = useState<FileType[]>([]);
	const [blueprint, setBlueprint] = useState<BlueprintType>();
	const [previewUrl, setPreviewUrl] = useState<string>();
	const [query, setQuery] = useState<string>();

	const [websocket, setWebsocket] = useState<WebSocket>();

	const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false);
	const [isBootstrapping, setIsBootstrapping] = useState(true);

	const [projectStages, setProjectStages] = useState<ProjectStage[]>(initialStages);

	// New state for phase timeline tracking
	const [phaseTimeline, setPhaseTimeline] = useState<PhaseTimelineItem[]>([]);

	const [files, setFiles] = useState<FileType[]>([]);

	const [totalFiles, setTotalFiles] = useState<number>();

	const [edit, setEdit] = useState<Omit<CodeFixEdits, 'type'>>();

	// Deployment and generation control state
	const [isDeploying, setIsDeploying] = useState(false);
	const [cloudflareDeploymentUrl, setCloudflareDeploymentUrl] = useState<string>('');
	const [deploymentError, setDeploymentError] = useState<string>();
	
	// Preview deployment state
	const [isPreviewDeploying, setIsPreviewDeploying] = useState(false);
	
	// Redeployment state - tracks when redeploy button should be enabled
	const [isRedeployReady, setIsRedeployReady] = useState(false);
	// const [lastDeploymentPhaseCount, setLastDeploymentPhaseCount] = useState(0);
	const [isGenerationPaused, setIsGenerationPaused] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);

	const [isThinking, setIsThinking] = useState(false);
	
	// Preview refresh state - triggers preview reload after deployment
	const [shouldRefreshPreview, setShouldRefreshPreview] = useState(false);
	
	// Track whether we've completed initial state restoration to avoid disrupting active sessions
	const [isInitialStateRestored, setIsInitialStateRestored] = useState(false);

	const updateStage = useCallback(
		(stageId: ProjectStage['id'], data: Partial<Omit<ProjectStage, 'id'>>) => {
			logger.debug('updateStage', { stageId, ...data });
			setProjectStages((prevStages) =>
				prevStages.map((stage) =>
					stage.id === stageId ? { ...stage, ...data } : stage,
				),
			);
		},
		[],
	);

	const onCompleteBootstrap = useCallback(() => {
		updateStage('bootstrap', { status: 'completed' });
	}, [updateStage]);

	const clearEdit = useCallback(() => {
		setEdit(undefined);
	}, []);

	// Define which message IDs should appear in the conversational chat
	const isConversationalMessage = useCallback((messageId: string) => {
		const conversationalIds = [
			'main',
			'creating-blueprint', 
			'conversation_response',
			'fetching-chat',
			'chat-not-found',
			'resuming-chat',
			'chat-welcome',
            'deployment-status',
            'code_reviewed',
		];
		
		// Allow all conversation IDs that start with 'conv-' OR are in the static list
		return conversationalIds.includes(messageId) || messageId.startsWith('conv-');
	}, []);

	const sendMessage = useCallback((message: Omit<ChatMessage, 'type'>) => {
		// Only add conversational messages to the chat UI
		if (!isConversationalMessage(message.id)) {
			return; // System messages are handled by other UI components
		}

		setMessages((prev) => {
			// Special case: Update the initial "Thinking..." message with id 'main' only once
			if (message.id === 'main') {
				const mainMessageIndex = prev.findIndex(m => m.id === 'main' && m.isThinking);
				if (mainMessageIndex !== -1) {
					// Replace the thinking message with the actual response
					return prev.map((msg, index) =>
						index === mainMessageIndex ? { ...msg, ...message, type: 'ai' as const } : msg
					);
				}
			}
			
			// For all other conversational messages, always append chronologically
			return [...prev, { type: 'ai' as const, ...message }];
		});
	}, [isConversationalMessage]);

	const sendUserMessage = useCallback((message: string) => {
		setMessages((prev) => [
			...prev,
			{ type: 'user', id: generateId(), message },
		]);
	}, []);

	const loadBootstrapFiles = (files: FileType[]) => {
		setBootstrapFiles((prev) => [
			...prev,
			...files.map((file) => ({
				...file,
				language: getFileType(file.filePath),
			})),
		]);
	};

	const addFile = (file: FileType) => {
		// add file to files if it doesn't exist, else replace old file with new one
		setFiles((prev) => {
			const fileExists = prev.some((f) => f.filePath === file.filePath);
			if (fileExists) {
				return prev.map((f) => (f.filePath === file.filePath ? file : f));
			}
			return [...prev, file];
		});
	};

	const handleWebSocketMessage = (websocket: WebSocket, message: WebSocketMessage) => {
		if (message.type !== 'file_chunk_generated' && message.type !== 'cf_agent_state' && message.type.length <= 50) {
			logger.info('received message', message.type, message);
			// Capture ALL WebSocket messages for debug panel (lightweight when not open)
			onDebugMessage?.('websocket', 
				`${message.type}`,
				JSON.stringify(message, null, 2),
				'WebSocket',
				message.type,
				message
			);
		}
		
		switch (message.type) {
			case 'cf_agent_state': {
				const { state } = message;
				console.log('🔄 Agent state update received:', state);

				// Only do full state restoration on initial load or when explicitly needed
				if (!isInitialStateRestored) {
					console.log('📥 Performing initial state restoration');
					
					// Restore blueprint
					if (state.blueprint && !blueprint) {
						setBlueprint(state.blueprint);
						updateStage('blueprint', { status: 'completed' });
					}

					// Restore query
					if (state.query && !query) {
						setQuery(state.query);
					}

					// Restore template/bootstrap files
					if (state.templateDetails?.files && bootstrapFiles.length === 0) {
						loadBootstrapFiles(state.templateDetails.files);
					}

					// Restore generated files
					if (state.generatedFilesMap && files.length === 0) {
						setFiles(
							Object.values(state.generatedFilesMap).map((file) => ({
								filePath: file.filePath,
								fileContents: file.fileContents,
								isGenerating: false,
								needsFixing: false,
								hasErrors: false,
								language: getFileType(file.filePath),
							})),
						);
					}

					// Restore phase timeline from generatedPhases
					if (state.generatedPhases && state.generatedPhases.length > 0 && phaseTimeline.length === 0) {
						console.log('📋 Restoring phase timeline:', state.generatedPhases);
						const timeline = state.generatedPhases.map((phase, index) => ({
							id: `phase-${index}`,
							name: phase.name,
							description: phase.description,
							status: phase.completed ? 'completed' as const : 'generating' as const,
                            files: phase.files.map((filesConcept) => {
                                const file = state.generatedFilesMap?.[filesConcept.path];
                                return {
                                    path: filesConcept.path,
                                    purpose: filesConcept.purpose,
                                    status: (file? 'completed' as const : 'generating' as const),
                                    contents: file?.fileContents
                                };
                            }),
                            timestamp: Date.now(),
                        }));
						setPhaseTimeline(timeline);
					}

					// Restore conversation messages
					if (state.conversationMessages && state.conversationMessages.length > 0) {
						console.log('💬 Restoring conversation messages:', state.conversationMessages.length);
						const restoredMessages = state.conversationMessages.map((msg) => ({
							type: msg.role === 'user' ? 'user' as const : 'ai' as const,
							id: (msg.conversationId || generateId()),
							message: msg.content as string,
							isThinking: false
						}));

                        // Filter out internal memos - If the message contains '<Internal Memo>'
                        const filteredMessages = restoredMessages.filter((msg) => !msg.message.includes('<Internal Memo>'));
						
						// Only replace messages if we have actual conversation content to restore
						if (filteredMessages.length > 0) {
							console.log('💬 Replacing messages with restored conversation:', filteredMessages.length);
							setMessages(filteredMessages);
						}
					}
					// Update project stages based on current state
					updateStage('bootstrap', { status: 'completed' });
					
					if (state.blueprint) {
						updateStage('blueprint', { status: 'completed' });
					}
					
					if (state.generatedFilesMap && Object.keys(state.generatedFilesMap).length > 0) {
						updateStage('code', { status: 'completed' });
						updateStage('validate', { status: 'completed' });
					}

					// Mark initial restoration as complete
					setIsInitialStateRestored(true);

					// Request preview deployment for existing chats with files
					// This ensures the preview is deployed when navigating to existing chats or reconnecting
					if (state.generatedFilesMap && Object.keys(state.generatedFilesMap).length > 0 && 
						websocket && websocket.readyState === WebSocket.OPEN && 
						urlChatId !== 'new') {
						console.log('🚀 Requesting preview deployment for existing chat with files');
						websocket.send(JSON.stringify({ type: 'preview' }));
					} else {
                        // Print all the arguments to check
                        console.log('🚀 Requesting preview deployment for existing chat with files', state.generatedFilesMap, Object.keys(state.generatedFilesMap).length, websocket, urlChatId);
                    }
				}

				// Preview URLs are now only set from deployment_completed websocket messages
				// No longer using potentially stale URLs from agent state

				// Always handle shouldBeGenerating flag for auto-resume (this is important for reconnects)
				if (state.shouldBeGenerating) {
					console.log('🔄 shouldBeGenerating=true detected, auto-resuming generation');
					updateStage('code', { status: 'active' });
					
					// Auto-send generate_all message to resume generation
					if (websocket && websocket.readyState === WebSocket.OPEN) {
						console.log('📡 Sending auto-resume generate_all message');
						websocket.send(JSON.stringify({ type: 'generate_all' }));
					}
				} else {
					// If shouldBeGenerating is false, ensure code stage is not active (unless currently generating)
					const codeStage = projectStages.find(stage => stage.id === 'code');
					if (codeStage?.status === 'active' && !isGenerating) {
						if (state.generatedFilesMap && Object.keys(state.generatedFilesMap).length > 0) {
							updateStage('code', { status: 'completed' });
							updateStage('validate', { status: 'completed' });

							// Auto-deploy preview if we have generated files but no preview URL
							if (!previewUrl && websocket && websocket.readyState === WebSocket.OPEN) {
								console.log('🚀 Generated files exist but no preview URL - auto-deploying preview');
								websocket.send(JSON.stringify({ type: 'preview' }));
							}
						}
					}
				}

				console.log('✅ Agent state update processed');
				break;
			}

			case 'file_generating': {
				addFile({
					filePath: message.filePath,
					fileContents: '',
					explanation: '',
					isGenerating: true,
					needsFixing: false,
					hasErrors: false,
					language: getFileType(message.filePath),
				});
				break;
			}

			case 'file_chunk_generated': {
				// update the file
				setFiles((prev) => {
					const file = prev.find(
						(file) => file.filePath === message.filePath,
					);
					if (!file)
						return [
							...prev,
							{
								filePath: message.filePath,
								fileContents: message.chunk,
								explanation: '',
								isGenerating: true,
								needsFixing: false,
								hasErrors: false,
								language: getFileType(message.filePath),
							},
						];
					file.fileContents += message.chunk;
					return [...prev];
				});
				break;
			}

			case 'file_generated': {
				// setIsRedeployReady(true);
				// find the file and change isGenerating to false with the file in same index
				setFiles((prev) => {
					const file = prev.find(
						(file) => file.filePath === message.file.filePath,
					);
					if (!file)
						return [
							...prev,
							{
								filePath: message.file.filePath,
								fileContents: message.file.fileContents,
								isGenerating: false,
								needsFixing: false,
								hasErrors: false,
								language: getFileType(message.file.filePath),
							},
						];
					file.isGenerating = false;
					file.fileContents = message.file.fileContents;
					return [...prev];
				});
				
				// Update file status in phase timeline from generating to completed
				setPhaseTimeline(prev => {
					const updated = [...prev];
					
					// Find the active phase (not completed) and update the specific file
					for (let i = updated.length - 1; i >= 0; i--) {
						if (updated[i].status !== 'completed') {
							const fileInPhase = updated[i].files.find(f => f.path === message.file.filePath);
							if (fileInPhase) {
								fileInPhase.status = 'completed';
								// Store the final contents of the file for this phase
								fileInPhase.contents = message.file.fileContents;
								console.log(`File completed in phase ${updated[i].name}: ${message.file.filePath}`);
								break;
							}
						}
					}
					
					return updated;
				});
				break;
			}

			case 'file_regenerated': {
				setIsRedeployReady(true);
				// update the file
				setFiles((prev) => {
					const file = prev.find(
						(file) => file.filePath === message.file.filePath,
					);
					if (!file) return prev;
					file.fileContents = message.file.fileContents;
					// Clear regenerating flags
					file.isGenerating = false;
					file.needsFixing = false;
					file.hasErrors = false;
					return [...prev];
				});
				
				// Update phase timeline to show file regeneration completed
				setPhaseTimeline(prev => {
					const updated = [...prev];
					
					// Find the most recent phase that contains this file and mark as completed
					for (let i = updated.length - 1; i >= 0; i--) {
						const fileInPhase = updated[i].files.find(f => f.path === message.file.filePath);
						if (fileInPhase) {
							fileInPhase.status = 'completed';
							// Store the updated contents for this phase
							fileInPhase.contents = message.file.fileContents;
							console.log(`File regeneration completed in phase ${updated[i].name}: ${message.file.filePath}`);
							break;
						}
					}
					
					return updated;
				});
				break;
			}

			case 'generation_started': {
				updateStage('code', { status: 'active' });
				setTotalFiles(message.totalFiles);
				break;
			}

			case 'generation_complete': {
				setIsRedeployReady(true);
				// update the file
				setFiles((prev) =>
					prev.map((file) => {
						file.isGenerating = false;
						file.needsFixing = false;
						file.hasErrors = false;
						return file;
					}),
				);
				updateStage('code', { status: 'completed' });
				updateStage('validate', { status: 'completed' });
				updateStage('fix', { status: 'completed' });

				sendMessage({
					id: 'generation-complete',
					message: 'Code generation has been completed.',
					isThinking: false,
				});
				break;
			}

			case 'deployment_started': {
				setIsPreviewDeploying(true);
				break;
			}

			case 'deployment_completed': {
				setIsPreviewDeploying(false);
				const finalPreviewURL = getPreviewUrl(message.previewURL, message.tunnelURL);
				setPreviewUrl(finalPreviewURL);
				// sendMessage({
				// 	id: 'deployment-status',
				// 	message: 'Your project has been deployed to ' + finalPreviewURL,
				// });

				break;
			}

			case 'code_reviewed': {
				const reviewData = message.review;
				const totalIssues = reviewData?.filesToFix?.reduce((count, file) => count + file.issues.length, 0) || 0;
				
				let reviewMessage = 'Code review complete';
				if (reviewData?.issuesFound) {
					reviewMessage = `Code review complete - ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found across ${reviewData.filesToFix?.length || 0} file${reviewData.filesToFix?.length !== 1 ? 's' : ''}`;
				} else {
					reviewMessage = 'Code review complete - no issues found';
				}
				
				sendMessage({
					id: 'code_review',
					message: reviewMessage,
				});
				break;
			}

			case 'file_regenerating': {
				// Mark file as being regenerated (similar to file_generating)
				setFiles((prev) => {
					const existingFile = prev.find(f => f.filePath === message.filePath);
					if (existingFile) {
						existingFile.isGenerating = true;
						existingFile.needsFixing = true; // Indicate this is a regeneration
						return [...prev];
					}
					// If file doesn't exist, add it
					return [...prev, {
						filePath: message.filePath,
						fileContents: '',
						explanation: 'File being regenerated...',
						isGenerating: true,
						needsFixing: true,
						hasErrors: false,
						language: getFileType(message.filePath),
					}];
				});
				
				// Update phase timeline to show file being regenerated
				setPhaseTimeline(prev => {
					const updated = [...prev];
					
					// Find the most recent phase that contains this file
					for (let i = updated.length - 1; i >= 0; i--) {
						const fileInPhase = updated[i].files.find(f => f.path === message.filePath);
						if (fileInPhase) {
							fileInPhase.status = 'generating'; // Show as regenerating
							console.log(`File regenerating in phase ${updated[i].name}: ${message.filePath}`);
							break;
						}
					}
					
					return updated;
				});
				break;
			}

			case 'runtime_error_found': {
				const errorMessage = `I detected a runtime error, will work on it: 
Count: ${message.count}
Message: ${message.errors.map((e) => e.message).join('\n').trim()}`;
                // Truncate the message to 100 characters
                const truncatedMessage = errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage;
				setMessages((prev) => [
					...prev,
					{
						type: 'ai',
						id: 'runtime_error',
						message: truncatedMessage,
					},
				]);
				logger.info('Runtime error found', message.errors);
				
				// Capture for debug panel
				onDebugMessage?.('error', 
					`Runtime Error (${message.count} errors)`,
					message.errors.map(e => `${e.message}\nStack: ${e.stack || 'N/A'}`).join('\n\n'),
					'Runtime Detection'
				);
				break;
			}

			case 'code_reviewing': {
				const totalIssues =
					(message.staticAnalysis?.lint?.issues?.length || 0) +
					(message.staticAnalysis?.typecheck?.issues?.length || 0) +
					(message.runtimeErrors.length || 0);

				updateStage('validate', { status: 'active' });

				if (totalIssues > 0) {
                    updateStage('fix', { status: 'active', metadata: `Fixing ${totalIssues} issues` });
					
					// Capture for debug panel
					const errorDetails = [
						`Lint Issues: ${JSON.stringify(message.staticAnalysis?.lint?.issues)}`,
						`Type Errors: ${JSON.stringify(message.staticAnalysis?.typecheck?.issues)}`,
						`Runtime Errors: ${JSON.stringify(message.runtimeErrors)}`,
						`Client Errors: ${JSON.stringify(message.clientErrors)}`,
					].filter(Boolean).join('\n');
					
					onDebugMessage?.('warning', 
						`Generation Issues Found (${totalIssues} total)`,
						errorDetails,
						'Code Generation'
					);
				}
				break;
			}

			case 'phase_generating': {
				updateStage('validate', { status: 'completed' });
				updateStage('fix', { status: 'completed' });
				sendMessage({
					id: 'phase_generating',
					message: message.message,
				});
				setIsThinking(true);
				break;
			}

			case 'phase_generated': {
				sendMessage({
					id: 'phase_generated',
					message: message.message,
				});
				setIsThinking(false);
				break;
			}

			case 'phase_implementing': {
				sendMessage({
					id: 'phase_implementing',
					message: message.message,
				});
				updateStage('code', { status: 'active' });
				
				// Add phase to timeline with duplicate checking
				if (message.phase) {
					setPhaseTimeline(prev => {
						// Check if phase already exists
						const existingPhase = prev.find(p => p.name === message.phase.name);
						if (existingPhase) {
							console.log('Phase already exists in timeline:', message.phase.name);
							return prev; // Don't add duplicate
						}
						
						// Add new phase
						const newPhase = {
							id: `${message.phase.name}-${Date.now()}`,
							name: message.phase.name,
							description: message.phase.description,
							files: message.phase.files?.map(f => {
								// Capture current file contents for incremental calculation
								// const existingFile = files.find(file => file.filePath === f.path);
								return {
									path: f.path,
									purpose: f.purpose,
									status: 'generating' as const,
									// contents: existingFile?.fileContents || '' // Store current contents
								};
							}) || [],
							status: 'generating' as const,
							timestamp: Date.now()
						};
						
						console.log('Added new phase to timeline:', message.phase.name);
						return [...prev, newPhase];
					});
				}
				break;
			}

			case 'phase_validating': {
				sendMessage({
					id: 'phase_validating',
					message: message.message,
				});
				updateStage('validate', { status: 'active' });
				
				// Update phase timeline to show validation state
				setPhaseTimeline(prev => {
					const updated = [...prev];
					if (updated.length > 0) {
						const lastPhase = updated[updated.length - 1];
						lastPhase.status = 'validating';
						console.log(`Phase validating: ${lastPhase.name}`);
					}
					return updated;
				});
				
				// Clear preview deploying state when validation starts
				setIsPreviewDeploying(false);
				break;
			}

			case 'phase_validated': {
				sendMessage({
					id: 'phase_validated',
					message: message.message,
				});
				updateStage('validate', { status: 'completed' });
				
				// No need to update phase timeline here - it will be updated when deployment starts
				break;
			}

			case 'phase_implemented': {
				sendMessage({
					id: 'phase_implemented',
					message: message.message,
				});

				updateStage('code', { status: 'completed' });
				setIsRedeployReady(true);
				
				// Update phase timeline
				if (message.phase) {
					setPhaseTimeline(prev => {
						const updated = [...prev];
						if (updated.length > 0) {
							const lastPhase = updated[updated.length - 1];
							lastPhase.status = 'completed';
							lastPhase.files = lastPhase.files.map(f => ({ ...f, status: 'completed' as const }));
							console.log(`Phase completed: ${lastPhase.name}`);
						}
						return updated;
					});
				}

				console.log('🔄 Scheduling preview refresh in 1 second after deployment completion');
				setTimeout(() => {
					console.log('🔄 Triggering preview refresh after deployment completion');
					setShouldRefreshPreview(true);
					
					// Reset the refresh trigger after a brief delay
					setTimeout(() => {
						setShouldRefreshPreview(false);
					}, 100);
					
					// Debug logging for preview refresh
					onDebugMessage?.('info',
						'Preview Auto-Refresh Triggered',
						`Preview refreshed 1 second after deployment completion`,
						'Preview Auto-Refresh'
					);
				}, 1000); // 1 second delay
				break;
			}

			case 'generation_stopped': {
				setIsGenerating(false);
				setIsGenerationPaused(true);
				sendMessage({
					id: 'generation_stopped',
					message: message.message,
				});
				break;
			}

			case 'generation_resumed': {
				setIsGenerating(true);
				setIsGenerationPaused(false);
				sendMessage({
					id: 'generation_resumed',
					message: message.message,
				});
				break;
			}

			case 'cloudflare_deployment_started': {
				setIsDeploying(true);
				sendMessage({
					id: 'cloudflare_deployment_started',
					message: message.message,
				});
				break;
			}

			case 'cloudflare_deployment_completed': {
				setIsDeploying(false);
				setCloudflareDeploymentUrl(message.deploymentUrl);
				
				// Clear any previous deployment error
				setDeploymentError('');
				
				// Disable redeploy button after successful deployment until next phase
				setIsRedeployReady(false);
				
				sendMessage({
					id: 'cloudflare_deployment_completed',
					message: `Your project has been permanently deployed to Cloudflare Workers: ${message.deploymentUrl}`,
				});
				
				// Debug logging for redeployment state
				onDebugMessage?.('info', 
					'Deployment Completed - Redeploy Reset',
					`Deployment URL: ${message.deploymentUrl}\nPhase count at deployment: ${phaseTimeline.length}\nRedeploy button disabled until next phase`,
					'Redeployment Management'
				);
				break;
			}

			case 'cloudflare_deployment_error': {
				// Reset deployment state for retry
				setIsDeploying(false);
				
				// Set deployment error for UI display
				setDeploymentError(message.error || 'Unknown deployment error');
				
				// Clear deployment URL to allow button to show "Deploy to Cloudflare" again
				setCloudflareDeploymentUrl('');
				
				// Reset redeploy state to allow fresh deployment attempt
				setIsRedeployReady(true);
				
				sendMessage({
					id: 'cloudflare_deployment_error',
					message: `❌ Deployment failed: ${message.error}\n\n🔄 You can try deploying again.`,
				});
				
				// Debug logging for deployment failure
				onDebugMessage?.('error', 
					'Deployment Failed - State Reset',
					`Error: ${message.error}\nDeployment button reset for retry`,
					'Deployment Error Recovery'
				);
				break;
			}

			case 'github_export_started': {
				sendMessage({
					id: 'github_export_started',
					message: message.message,
				});
				break;
			}

			case 'github_export_progress': {
				sendMessage({
					id: 'github_export_progress',
					message: message.message,
				});
				break;
			}

			case 'github_export_completed': {
				sendMessage({
					id: 'github_export_completed',
					message: message.message,
				});
				break;
			}

			case 'github_export_error': {
				sendMessage({
					id: 'github_export_error',
					message: `❌ GitHub export failed: ${message.error}`,
				});
				break;
			}

			case 'conversation_response': {
				// Use unique conversation ID or fallback for backward compatibility
				const messageId = message.conversationId || 'conversation_response';
				
				if (message.isStreaming) {
					// Handle streaming chunks - append to existing conversation message
					setMessages((prev) => {
						const existingMessageIndex = prev.findIndex(m => m.id === messageId && m.type === 'ai');
						
						if (existingMessageIndex !== -1) {
							// Append chunk to existing message
							return prev.map((msg, index) => 
								index === existingMessageIndex 
									? { ...msg, message: msg.message + message.message }
									: msg
							);
						} else {
							// Create new streaming message with unique ID
							return [...prev, {
								type: 'ai' as const,
								id: messageId,
								message: message.message,
								isThinking: false
							}];
						}
					});
				} else {
					// Handle complete message (fallback) - always create new message
					sendMessage({
						id: messageId,
						message: message.message,
					});
				}
				break;
			}

			case 'terminal_output': {
				// Handle terminal output from server
				const terminalLog = {
					id: `terminal-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					content: message.output,
					type: message.outputType as 'stdout' | 'stderr' | 'info',
					timestamp: message.timestamp
				};
				if (onTerminalMessage) {
					onTerminalMessage(terminalLog);
				}
				break;
			}

			case 'server_log': {
				// Handle server logs
				const serverLog = {
					id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
					content: message.message,
					type: message.level as 'info' | 'warn' | 'error' | 'debug',
					timestamp: message.timestamp,
					source: message.source
				};
				if (onTerminalMessage) {
					onTerminalMessage(serverLog);
				}
				break;
			}

			case 'error': {
				const errorData = message;
				// Handle generic errors
				setMessages(prev => [
					...prev,
					{
						type: 'ai',
						id: `error_${Date.now()}`,
						message: `❌ ${errorData.error}`,
					},
				]);
				
				onDebugMessage?.(
					'error',
					'WebSocket Error',
					errorData.error,
					'WebSocket',
					'error',
					errorData
				);
				break;
			}

            case 'rate_limit_error' : {
                const rateLimitError = message.error;
                let displayMessage = rateLimitError.message;
                
                // Add helpful suggestions for rate limiting
                if (rateLimitError.suggestions && rateLimitError.suggestions.length > 0) {
                    displayMessage += `\n\n💡 Suggestions:\n${rateLimitError.suggestions.map(s => `• ${s}`).join('\n')}`;
                }
                
                // Add a system message for rate limits
                setMessages(prev => [
                    ...prev,
                    {
                        type: 'ai',
                        id: `rate_limit_${Date.now()}`,
                        message: `⏱️ ${displayMessage}`,
                    },
                ]);

                // Add toast notification for rate limit
                toast.error(displayMessage);
                
                // Notify debug handler about rate limit
                onDebugMessage?.(
                    'error',
                    `Rate Limit: ${rateLimitError.limitType.replace('_', ' ')} limit exceeded`,
                    `Limit: ${rateLimitError.limit} per ${Math.floor((rateLimitError.period || 0) / 3600)}h\nRetry after: ${(rateLimitError.period || 0) / 3600}h\n\nSuggestions:\n${rateLimitError.suggestions?.join('\n') || 'None'}`,
                    'Rate Limiting',
                    rateLimitError.limitType,
                    rateLimitError
                );
                break;
            }

			default:
				console.warn('Unhandled message:', message);
		}
		 
	};

	// Enhanced WebSocket connection with retry logic
	const connectWithRetry = useCallback(
		(
			wsUrl: string,
			{ disableGenerate = false, isRetry = false }: { disableGenerate?: boolean; isRetry?: boolean } = {},
		) => {
			logger.debug(`🔌 ${isRetry ? 'Retrying' : 'Attempting'} WebSocket connection (attempt ${retryCount.current + 1}/${maxRetries + 1}):`, wsUrl);
			
			if (!wsUrl) {
				console.error('❌ WebSocket URL is required');
				return;
			}

			connectionStatus.current = isRetry ? 'retrying' : 'connecting';

			try {
				console.log('🔗 Attempting WebSocket connection to:', wsUrl);
				const ws = new WebSocket(wsUrl);
				setWebsocket(ws);

				// Connection timeout - if connection doesn't open within 10 seconds
				const connectionTimeout = setTimeout(() => {
					if (ws.readyState === WebSocket.CONNECTING) {
						console.warn('⏰ WebSocket connection timeout');
						ws.close();
						handleConnectionFailure(wsUrl, disableGenerate, 'Connection timeout');
					}
				}, 30000);

				ws.addEventListener('open', () => {
					clearTimeout(connectionTimeout);
					logger.info('✅ WebSocket connection established successfully!');
					connectionStatus.current = 'connected';
					
					// Reset retry count on successful connection
					retryCount.current = 0;
					
					// Clear any pending retry timeouts
					retryTimeouts.current.forEach(clearTimeout);
					retryTimeouts.current = [];

					// Send success message to user
					if (isRetry) {
						sendMessage({
							id: 'websocket_reconnected',
							message: '🔌 Connection restored! Continuing with code generation...',
						});
					}

					// Request file generation for new chats only
					if (!disableGenerate && urlChatId === 'new') {
						console.log('🔄 Starting code generation for new chat');
						ws.send(JSON.stringify({ type: 'generate_all' }));
					}
					// For existing chats, auto-resume will be handled by cf_agent_state message
				});

				ws.addEventListener('message', (event) => {
					try {
						const message: WebSocketMessage = JSON.parse(event.data);
						handleWebSocketMessage(ws, message);
					} catch (parseError) {
						console.error('❌ Error parsing WebSocket message:', parseError, event.data);
					}
				});

				ws.addEventListener('error', (error) => {
					clearTimeout(connectionTimeout);
					console.error('❌ WebSocket error:', error);
					handleConnectionFailure(wsUrl, disableGenerate, 'WebSocket error');
				});

				ws.addEventListener('close', (event) => {
					clearTimeout(connectionTimeout);
					logger.info(
						`🔌 WebSocket connection closed with code ${event.code}: ${event.reason || 'No reason provided'}`,
						event,
					);
					
					// Only retry if this wasn't an intentional close (code 1000)
					if (event.code !== 1000 && connectionStatus.current === 'connected') {
						handleConnectionFailure(wsUrl, disableGenerate, `Connection closed (code: ${event.code})`);
					}
				});

				return function disconnect() {
					clearTimeout(connectionTimeout);
					ws.close();
				};
			} catch (error) {
				console.error('❌ Error establishing WebSocket connection:', error);
				handleConnectionFailure(wsUrl, disableGenerate, 'Connection setup failed');
			}
		},
		[retryCount, maxRetries, retryTimeouts],
	);

	// Handle connection failures with exponential backoff retry
	const handleConnectionFailure = useCallback(
		(wsUrl: string, disableGenerate: boolean, reason: string) => {
			connectionStatus.current = 'failed';
			
			if (retryCount.current >= maxRetries) {
				console.error(`💥 WebSocket connection failed permanently after ${maxRetries + 1} attempts`);
				sendMessage({
					id: 'websocket_failed',
					message: `🚨 Connection failed permanently after ${maxRetries + 1} attempts.\n\n❌ Reason: ${reason}\n\n🔄 Please refresh the page to try again.`,
				});
				
				// Debug logging for permanent failure
				onDebugMessage?.('error',
					'WebSocket Connection Failed Permanently',
					`Failed after ${maxRetries + 1} attempts. Reason: ${reason}`,
					'WebSocket Resilience'
				);
				return;
			}

			retryCount.current++;
			
			// Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s, 8s, 16s)
			const retryDelay = Math.pow(2, retryCount.current) * 1000;
			const maxDelay = 30000; // Cap at 30 seconds
			const actualDelay = Math.min(retryDelay, maxDelay);

			console.warn(`🔄 Retrying WebSocket connection in ${actualDelay / 1000}s (attempt ${retryCount.current + 1}/${maxRetries + 1})`);
			
			sendMessage({
				id: 'websocket_retrying',
				message: `🔄 Connection failed. Retrying in ${Math.ceil(actualDelay / 1000)} seconds... (attempt ${retryCount.current + 1}/${maxRetries + 1})\n\n❌ Reason: ${reason}`,
				isThinking: true,
			});

			const timeoutId = setTimeout(() => {
				connectWithRetry(wsUrl, { disableGenerate, isRetry: true });
			}, actualDelay);
			
			retryTimeouts.current.push(timeoutId);
			
			// Debug logging for retry attempt
			onDebugMessage?.('warning',
				'WebSocket Connection Retry',
				`Retry ${retryCount.current}/${maxRetries} in ${actualDelay / 1000}s. Reason: ${reason}`,
				'WebSocket Resilience'
			);
		},
		[maxRetries, retryCount, retryTimeouts, onDebugMessage, sendMessage],
	);

	// Legacy connect function for compatibility
	const connect = useCallback(
		(
			wsUrl: string,
			options: { disableGenerate?: boolean } = {},
		) => {
			retryCount.current = 0; // Reset retry count for new connection attempts
			return connectWithRetry(wsUrl, options);
		},
		[connectWithRetry],
	);

	useEffect(() => {
		async function init() {
			if (!urlChatId || connectionStatus.current !== 'idle') return;

			try {
				if (urlChatId === 'new') {
					if (!userQuery) {
						console.error('Query is required for new code generation');
						return;
					}

					// Start new code generation using API client
					const response = await apiClient.createAgentSession({
						query: userQuery,
						agentMode,
					});

					const parser = createRepairingJSONParser();

					const result: {
						websocketUrl: string;
						agentId: string;
						template: {
							files: FileType[];
						};
					} = {
						websocketUrl: '',
						agentId: '',
						template: {
							files: [],
						},
					};

					let startedBlueprintStream = false;
					sendMessage({
						id: 'main',
						message: "Sure, let's get started. Bootstrapping the project first...",
						isThinking: true,
					});

					for await (const obj of ndjsonStream(response.stream)) {
                        console.log('Received chunk from server:', obj);
						if (obj.chunk) {
							if (!startedBlueprintStream) {
								sendMessage({
									id: 'main',
									message: 'Blueprint is being generated...',
									isThinking: true,
								});
								logger.info('Blueprint stream has started');
								setIsBootstrapping(false);
								setIsGeneratingBlueprint(true);
								startedBlueprintStream = true;
								updateStage('bootstrap', { status: 'completed' });
								updateStage('blueprint', { status: 'active' });
							}
							parser.feed(obj.chunk);
							try {
								const partial = parser.finalize();
								setBlueprint(partial);
							} catch (e) {
								console.error('Error parsing JSON:', e, obj.chunk);
							}
						} 
						if (obj.agentId) {
							result.agentId = obj.agentId;
						}
						if (obj.websocketUrl) {
							result.websocketUrl = obj.websocketUrl;
							console.log('📡 Received WebSocket URL from server:', result.websocketUrl)
						}
						if (obj.template) {
                            console.log('Received template from server:', obj.template);
							result.template = obj.template;
							if (obj.template.files) {
								loadBootstrapFiles(obj.template.files);
							}
						}
					}

					updateStage('blueprint', { status: 'completed' });
					setIsGeneratingBlueprint(false);
					sendMessage({
						id: 'main',
						message:
							'Blueprint generation complete. Now starting the code generation...',
						isThinking: true,
					});

					// Connect to WebSocket
					logger.debug('connecting to ws with created id');
					connect(result.websocketUrl);
					setChatId(result.agentId); // This comes from the server response
					
					// Emit app-created event for sidebar updates
					appEvents.emitAppCreated(result.agentId, {
						title: userQuery || 'New App',
						description: userQuery,
					});
				} else if (connectionStatus.current === 'idle') {
					setIsBootstrapping(false);
					// Get existing progress
					sendMessage({
						id: 'fetching-chat',
						message: 'Fetching your previous chat...',
					});

					const response = await apiClient.connectToAgent(urlChatId);
                    if (!response.success || !response.data) {
                        console.error('Failed to fetch existing chat:', { chatId: urlChatId, error: response.error });
                        throw new Error(response.error?.message || 'Failed to connect to agent');
                    }
					logger.debug('Existing agentId API result', response.data);

					// Set the chatId for existing chat - this enables the chat input
					setChatId(urlChatId);

					sendMessage({
						id: 'resuming-chat',
						message: 'Starting from where you left off...',
						isThinking: false,
					});

					logger.debug('connecting from init for existing chatId');
                    connect(response.data.websocketUrl, {
                        disableGenerate: true, // We'll handle generation resume in the WebSocket open handler
                    });
				}
			} catch (error) {
				console.error('Error initializing code generation:', error);
                if (error instanceof RateLimitExceededError) {
                    const rateLimitError = error.details;
                    let displayMessage = rateLimitError.message;
                    if (rateLimitError.suggestions && rateLimitError.suggestions.length > 0) {
                        displayMessage += `\n\n💡 Suggestions:\n${rateLimitError.suggestions.map(s => `• ${s}`).join('\n')}`;
                    }
                    
                    // Add rate limit error as a system message
                    setMessages(prev => [
                        ...prev,
                        {
                            type: 'ai',
                            id: `rate_limit_${Date.now()}`,
                            message: `⏱️ ${displayMessage}`,
                        },
                    ]);

                    toast.error(displayMessage);
                    
                    onDebugMessage?.(
                        'error',
                        `Rate Limit: ${rateLimitError.limitType.replace('_', ' ')} limit exceeded`,
                        `Limit: ${rateLimitError.limit} per ${Math.floor((rateLimitError.period || 0) / 3600)}h\nRetry after: ${(rateLimitError.period || 0) / 3600}h\n\nSuggestions:\n${rateLimitError.suggestions?.join('\n') || 'None'}`,
                        'Rate Limiting',
                        rateLimitError.limitType,
                        rateLimitError
                    );
			    }
		    }
        }
		init();
	}, []);

	useEffect(() => {
		return () => {
			websocket?.close();
		};
	}, [websocket]);

	useEffect(() => {
		if (edit) {
			// When edit is cleared, write the edit changes
			return () => {
				setFiles((prev) =>
					prev.map((file) => {
						if (file.filePath === edit.filePath) {
							file.fileContents = file.fileContents.replace(
								edit.search,
								edit.replacement,
							);
						}
						return file;
					}),
				);
			};
		}
	}, [edit]);

	// Control functions for deployment and generation
	const handleStopGeneration = useCallback(() => {
		if (websocket && websocket.readyState === WebSocket.OPEN) {
			websocket.send(JSON.stringify({ type: 'stop_generation' }));
		}
	}, [websocket]);

	const handleResumeGeneration = useCallback(() => {
		if (websocket && websocket.readyState === WebSocket.OPEN) {
			websocket.send(JSON.stringify({ type: 'resume_generation' }));
		}
	}, [websocket]);

	const handleDeployToCloudflare = useCallback(async (instanceId: string) => {
		try {
			// Send deployment command via WebSocket instead of HTTP request
			if (websocket && websocket.readyState === WebSocket.OPEN) {
				websocket.send(JSON.stringify({ 
					type: 'deploy',
					instanceId 
				}));
				console.log('🚀 Deployment WebSocket message sent:', instanceId);
				
				// Set 1-minute timeout for deployment
				setTimeout(() => {
					if (isDeploying) {
						console.warn('⏰ Deployment timeout after 1 minute');
						
						// Reset deployment state
						setIsDeploying(false);
						setCloudflareDeploymentUrl('');
						setIsRedeployReady(false);
						
						// Show timeout message
						sendMessage({
							id: 'deployment_timeout',
							message: `⏰ Deployment timed out after 1 minute.\n\n🔄 Please try deploying again. The server may be busy.`,
						});
						
						// Debug logging for timeout
						onDebugMessage?.('warning', 
							'Deployment Timeout',
							`Deployment for ${instanceId} timed out after 60 seconds`,
							'Deployment Timeout Management'
						);
					}
				}, 60000); // 1 minute = 60,000ms
				
				// Store timeout ID for cleanup if deployment completes early
				// Note: In a real implementation, you'd want to clear this timeout
				// when deployment completes successfully
				
			} else {
				throw new Error('WebSocket connection not available');
			}
		} catch (error) {
			console.error('❌ Error sending deployment WebSocket message:', error);
			
			// Set deployment state immediately for UI feedback
			setIsDeploying(true);
			// Clear any previous deployment error
			setDeploymentError('');
			setCloudflareDeploymentUrl('');
			setIsRedeployReady(false);
			
			sendMessage({
				id: 'deployment_error',
				message: `❌ Failed to initiate deployment: ${error instanceof Error ? error.message : 'Unknown error'}\n\n🔄 You can try again.`,
			});
		}
	}, [websocket, sendMessage, isDeploying, onDebugMessage]);

	return {
		messages,
		edit,
		bootstrapFiles,
		chatId,
		query,
		files,
		blueprint,
		previewUrl,
		isGeneratingBlueprint,
		isBootstrapping,
		totalFiles,
		websocket,
		sendUserMessage,
		sendAiMessage: sendMessage,
		clearEdit,
		projectStages,
		phaseTimeline,
		isThinking,
		onCompleteBootstrap,
		// Deployment and generation control
		isDeploying,
		cloudflareDeploymentUrl,
		deploymentError,
		isRedeployReady,
		isGenerationPaused,
		isGenerating,
		handleStopGeneration,
		handleResumeGeneration,
		handleDeployToCloudflare,
		// Preview refresh control
		shouldRefreshPreview,
		// Preview deployment state
		isPreviewDeploying,
	};
}
