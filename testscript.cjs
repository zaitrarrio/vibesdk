// Script to test the agentic code generation process
const { setTimeout: setTimeoutPromise } = require('timers/promises');
const { setTimeout: setTimeoutCallback } = require('timers');
const { createInterface } = require('readline');

async function run() {
	const { default: fetch } = await import('node-fetch');
	const { default: chalk } = await import('chalk'); // Import chalk dynamically
	let agentId = null;
	let websocket = null;
	let runId = null; // For tracking the deployed application in runner_service

	// Configuration variables
	const config = {
		codegenURL: 'http://127.0.0.1:8787',
		runnerServiceURL: 'http://localhost:3000',
		autoShutdownTimeout: 60 * 60 * 1000, // 60 minutes in milliseconds
		enableFileEnhancement: false, // Enable the file enhancement feature
	};

	// Timing tracking
	const timings = {
		start: Date.now(),
		steps: {},
		currentStep: '',

		// Start tracking a new step
		startStep(name) {
			this.currentStep = name;
			this.steps[name] = {
				start: Date.now(),
				end: null,
				duration: null
			};
			console.log(`\n${chalk.cyan('⏱️ Starting step:')} ${chalk.bold(name)}`);
		},

		// End the current step
		endStep() {
			if (!this.currentStep) return;

			const stepData = this.steps[this.currentStep];
			if (stepData) {
				stepData.end = Date.now();
				stepData.duration = stepData.end - stepData.start;

				const totalElapsed = stepData.end - this.start;

				console.log(`${chalk.cyan('⏱️ Completed step:')} ${chalk.bold(this.currentStep)} in ${chalk.yellow(formatDuration(stepData.duration))}`);
				console.log(`${chalk.cyan('⏰ Total elapsed time:')} ${chalk.yellow(formatDuration(totalElapsed))}`);
			}

			this.currentStep = '';
		},

		// Track an event within the current step
		trackEvent(name) {
			const now = Date.now();
			const totalElapsed = now - this.start;
			console.log(`${chalk.magenta('🕒 Event:')} ${name} ${chalk.gray(`(Total elapsed: ${formatDuration(totalElapsed)})`)}`);
		},

		// Print a summary of all timings
		printSummary() {
			const totalTime = Date.now() - this.start;

			console.log('\n📊 ' + chalk.bold.bgBlue(' === TIMING SUMMARY === '));
			console.log(`${chalk.blue('🕒 Total execution time:')} ${chalk.yellow(formatDuration(totalTime))}`);

			console.log(chalk.blue('Step-by-step timing:'));
			Object.entries(this.steps)
				.filter(([_, data]) => data.duration !== null)
				.forEach(([name, data]) => {
					console.log(`  - ${chalk.bold(name)}: ${chalk.yellow(formatDuration(data.duration))}`);
				});
		}
	};

	// Format duration in milliseconds to a human-readable string
	function formatDuration(ms) {
		if (ms < 1000) return `${ms}ms`;

		const seconds = Math.floor(ms / 1000) % 60;
		const minutes = Math.floor(ms / (1000 * 60)) % 60;
		const hours = Math.floor(ms / (1000 * 60 * 60));

		if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
		if (minutes === 0) return `${seconds}s`;
		return `${minutes}m ${seconds}s`;
	}

	/**
	 * Visualize the blueprint being built in real-time
	 * This tracks chunks as they come in and displays a structured view
	 */
	class BlueprintStreamVisualizer {
		constructor() {
			this.chunks = [];
			this.currentBlueprintStr = '';
			this.blueprint = {};
			this.startTime = Date.now();
			this.lastUpdateTime = Date.now();
			this.chunkCount = 0;
			this.totalChars = 0;
			// Top level blueprint sections we're tracking for visualization
			this.keyProgress = {
				title: false,
				description: false,
				architecture: false,
				userFlow: false,
				dataFlow: false,
				implementationRoadmap: false,
				initialPhase: false,
				commands: false,
				frameworks: false
			};
		}

		addChunk(chunk) {
			const now = Date.now();
			this.chunks.push(chunk);
			this.chunkCount++;
			this.totalChars += chunk.length;
			this.currentBlueprintStr += chunk;
			
			this.lastUpdateTime = now;
			
			// Try to parse the blueprint from the accumulated chunks
			this.tryParseBlueprintChunk();
			
			// Render the current progress
			this.renderProgress();
		}

		tryParseBlueprintChunk() {
			try {
				// Try to parse accumulated chunks as JSON
				const tempBlueprint = JSON.parse(this.currentBlueprintStr);
				this.blueprint = tempBlueprint;
				
				// Update key progress tracking
				Object.keys(this.keyProgress).forEach(key => {
					if (this.blueprint[key] !== undefined && this.blueprint[key] !== null) {
						this.keyProgress[key] = true;
					}
				});
			} catch (error) {
				// Not valid JSON yet, which is expected during streaming
				// Just continue collecting chunks
			}
		}

		renderProgress() {
			// Clear previous output
			process.stdout.write('\r\x1b[K');
			
			// Calculate elapsed time
			const elapsedTime = Date.now() - this.startTime;
			const elapsedStr = formatDuration(elapsedTime);
			
			// Display current streaming stats
			process.stdout.write(
				`${chalk.blue('🔄 Blueprint streaming:')} ${chalk.yellow(this.chunkCount)} chunks, ` +
				`${chalk.yellow(this.totalChars)} chars, ` +
				`${chalk.yellow(elapsedStr)} elapsed\n`
			);

			// Render completed blueprint sections
			process.stdout.write(`${chalk.blue('Blueprint sections:')} `);
			
			Object.entries(this.keyProgress).forEach(([key, completed], index) => {
				if (index > 0) process.stdout.write(' | ');
				
				if (completed) {
					process.stdout.write(chalk.green(`✓ ${key}`));
				} else {
					process.stdout.write(chalk.gray(`${key}`));
				}
			});
			
			// Show partial preview if we have valid JSON
			if (Object.keys(this.blueprint).length > 0) {
				if (this.blueprint.title) {
					process.stdout.write(`\n${chalk.cyan('Title:')} ${chalk.yellow(this.blueprint.title)}`);
				}
				if (this.blueprint.description) {
					process.stdout.write(`\n${chalk.cyan('Description:')} ${chalk.yellow(this.blueprint.description)}`);
				}
				if (this.blueprint.frameworks && this.blueprint.frameworks.length > 0) {
					process.stdout.write(`\n${chalk.cyan('Frameworks:')} ${chalk.yellow(this.blueprint.frameworks.join(', '))}`);
				}
				
				if (this.blueprint.implementationRoadmap && this.blueprint.implementationRoadmap.length > 0) {
					process.stdout.write(`\n${chalk.cyan('Phases:')} ${chalk.yellow(this.blueprint.implementationRoadmap.length)}`);
				}

				if (this.blueprint.initialPhase && this.blueprint.initialPhase.files) {
					process.stdout.write(`\n${chalk.cyan('Files in initial phase:')} ${chalk.yellow(this.blueprint.initialPhase.files.length)}`);
				}
				if (this.blueprint.commands && this.blueprint.commands.length > 0) {
					process.stdout.write(`\n${chalk.cyan('Commands:')} ${chalk.yellow(this.blueprint.commands.length)}`);
				}
			}
		}

		getCompletedBlueprint() {
			return this.blueprint;
		}

		getSummary() {
			return {
				chunkCount: this.chunkCount,
				totalChars: this.totalChars,
				elapsedTime: Date.now() - this.startTime
			};
		}
	}

	async function testIncrementalCodegen() {
		try {
			console.log(chalk.green.bold('📋 Testing incremental code generation...'));

			// Step 1: Start the code generation process with POST request
			timings.startStep('Initial API Request');
			console.log('Step 1: Initiating code generation with a POST request...');
			const response = await fetch(`${config.codegenURL}/api/agent`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					// query:'Create a simple counter app in React with a button to increment the count and a button to reset it. The app should be responsive and look good on mobile devices.',
                    // 
					// query: 'Create the 2048 game in React with a 4x4 grid and the ability to move tiles up, down, left, and right. Make it beautiful and responsive. The tiles should merge when they have the same number. The game should end when there are no more moves left. The game should look like the original 2048 game.',
                    
					// query: `Create a file manager dashboard in next.js with a sidebar for navigation, a main area for file display, 
					// and a toolbar for actions. The sidebar should allow users to navigate between folders in a natural way.
					// The main area should show files and folders in a grid or list view. 
					// The toolbar should have buttons for creating, deleting, and renaming files and folders.
					// I should also be able to open, close, edit the files as well as upload and download files. 
					// The design should be clean and modern, with a focus on usability.`,
					
					// query: `Create a responsive, modern file-manager dashboard in Next.js featuring three key zones: (1) a persistent left-hand sidebar with breadcrumb-style, collapsible folder navigation; (2) a central workspace that toggles between grid and list views, rendering files/folders with icons, metadata, and thumbnail presets (e.g., XS/S/M/L) that auto-generate image or video previews; and (3) an upper action toolbar offering create, delete, rename, upload, download, open/close, in-place edit, and drag-and-drop capabilities. Integrate a fast, fuzzy search bar (with instant-filter results) above the file view, maintain multi-select and keyboard shortcuts, and apply optimistic UI updates to reflect all CRUD operations immediately. Design with ample whitespace, accessible color contrast, subtle shadows, and focus states to ensure a clean, highly usable experience on both desktop and mobile screens.`,
					
					// query: 'build a website uptime monitor',
					// query: `Build a full fledged chess website (chess.com clone) with a beautiful UI and a chess engine that can play against the user.
					// It should have all the features and functionalities of chess.com or lichess.org. The chess engine should be able to play at different levels of difficulty.
					// It should also have a multiplayer mode, timers, and a chat feature. 
					// `,
					// // 					
					query: `Create a full-fledged chess website in next.js with an elegant, responsive UI that matches the polish of Chess.com or lichess.org.
					Make a simple AI opponent (dont use stockfish) that can play at various levels of difficulty,
					Replicate core platform features—analysis board, puzzles, openings explorer, ratings, leaderboards, and user profiles—so nothing feels missing.
					Enable real-time multiplayer play with adjustable timers and in-game text chat to make every match feel lively and social.`,
					
                    // Pass runner service URL to use for testing
					runnerServiceURL: config.runnerServiceURL,
                    
                    // Pass the file enhancement flag
                    enableFileEnhancement: config.enableFileEnhancement
				}),
			});

			// Create blueprint visualizer to track streaming blueprint generation
			const blueprintVisualizer = new BlueprintStreamVisualizer();
			console.log(chalk.blue('\n🔄 Starting blueprint generation (streaming)...'));

			const rl = createInterface({
				input: response.body,
				crlfDelay: Infinity
			});

			const result = {
				data: {
					blueprint: '',
				}
			};

			for await (const line of rl) {
				if (line.trim()) {
				  try {
					const json = JSON.parse(line.trim());
					// console.log(`\n${chalk.blue('Received message:')} ${chalk.yellow(JSON.stringify(json))}`);
					if(json.chunk) {
						result.data.blueprint += json.chunk;
						// Add this chunk to the visualizer
						blueprintVisualizer.addChunk(json.chunk);
					} else {
						result.data = { ...result.data, ...json };
						// Log non-chunk messages
						console.log(`\n${chalk.blue('Received message:')} ${chalk.yellow(JSON.stringify(json))}`);

						// console.log("Current result data:", JSON.stringify(result.data, null, 2));
					}
				  } catch (e) {
					console.error('Failed to parse line:', line);
				  }
				}
			}
			
			// Clear the progress display and render the final state
			process.stdout.write('\n\n');

			// Print blueprint streaming summary
			const summary = blueprintVisualizer.getSummary();
			console.log(`\n${chalk.green('✅ Blueprint generation complete!')}`);
			console.log(`${chalk.blue('Blueprint received in:')} ${chalk.yellow(summary.chunkCount)} chunks, ${chalk.yellow(summary.totalChars)} chars, ${chalk.yellow(formatDuration(summary.elapsedTime))}`);

			timings.endStep();
			console.log(chalk.green('✅ Initial code generation request successful!'));
			console.log(`${chalk.blue('Agent ID:')} ${chalk.yellow(result.data.agentId)}`);
			console.log(`${chalk.blue('Template used:')} ${chalk.yellow(result.data.templateUsed || 'none')}`);
			console.log(`${chalk.blue('File Enhancement:')} ${config.enableFileEnhancement ? chalk.green('Enabled') : chalk.red('Disabled')}`);

			console.log(chalk.blue('\nFinal blueprint:'));
			if (result.data.blueprint) {
				// Parse and format the final blueprint JSON
				try {
					const blueprint = JSON.parse(result.data.blueprint);
					// Print a formatted summary of the blueprint for better readability
					console.log(`${chalk.cyan('Title:')} ${chalk.yellow(blueprint.title || 'N/A')}`);
					console.log(`${chalk.cyan('Language:')} ${chalk.yellow(blueprint.language || 'N/A')}`);
					console.log(`${chalk.cyan('Frameworks:')} ${chalk.yellow((blueprint.frameworks || []).join(', ') || 'N/A')}`);
					
					if (blueprint.implementationRoadmap && blueprint.implementationRoadmap.length > 0) {
						console.log(`${chalk.cyan('Implementation Phases:')}`);
						blueprint.implementationRoadmap.forEach((phase, i) => {
							console.log(`  ${i+1}. ${chalk.yellow(phase.phase || 'Unnamed phase')}`);
						});
					}
					
					// Check if initialPhase is defined
					if (blueprint.initialPhase) {
						console.log(`${chalk.cyan('Initial Phase:')} ${chalk.yellow(blueprint.initialPhase.name || 'Unnamed')}`);
						if (blueprint.initialPhase.files && blueprint.initialPhase.files.length > 0) {
							console.log(`  ${chalk.cyan('Files:')} ${blueprint.initialPhase.files.length}`);
						}
					}
					
					// Add command info if present
					if (blueprint.commands && blueprint.commands.length > 0) {
						console.log(`${chalk.cyan('Setup Commands:')} ${chalk.yellow(blueprint.commands.length)}`);
						blueprint.commands.forEach((cmd, i) => {
							console.log(`  ${i+1}. ${chalk.yellow(cmd)}`);
						});
					}
					
					// Optional: Store the complete blueprint in a file for reference
					const fs = require('fs');
					fs.writeFileSync('blueprint-latest.json', JSON.stringify(blueprint, null, 2));
					console.log(`${chalk.dim('Full blueprint saved to blueprint-latest.json')}`);
					
				} catch (error) {
					console.error(chalk.red('Error parsing final blueprint:'), error);
				}
			}

			// Ensure websocket URL uses the correct protocol for local testing
			let websocketUrl = result.data.websocketUrl;

			// Force websocket URL to be ws:// when testing locally at 127.0.0.1 or localhost
			if (websocketUrl.includes('127.0.0.1') || websocketUrl.includes('localhost')) {
				websocketUrl = websocketUrl
					.replace(/^wss:\/\//i, 'ws://')
					.replace(/^https:\/\//i, 'ws://')
					.replace(/^http:\/\//i, 'ws://');
				console.log(`${chalk.blue('Using local WebSocket URL:')} ${chalk.yellow(websocketUrl)}`);
			}

			console.log(`${chalk.blue('WebSocket URL:')} ${chalk.yellow(websocketUrl)}`);

			agentId = result.data.agentId;

			// Step 2: Check the agent status with a GET request
			timings.startStep('Status Check');
			console.log('\nStep 2: Checking the agent status with a GET request...');
			await setTimeoutPromise(2000); // Give the agent a moment to initialize

			const statusResponse = await fetch(`${config.codegenURL}/api/agent/${agentId}`, {
				method: 'GET',
			});

			if (!statusResponse.ok) {
				console.warn(chalk.yellow(`HTTP error ${statusResponse.status} when checking status. Will proceed with WebSocket anyway.`));
			} else {
				const statusResult = await statusResponse.json();
				console.log(chalk.green('✅ Status check successful!'));
				console.log(`${chalk.blue('Progress:')} ${chalk.yellow(statusResult.data.progress.completedFiles)}/${chalk.yellow(statusResult.data.progress.totalFiles)} files generated`);
			}
			timings.endStep();

			// Step 3: Connect to the WebSocket and request file generation
			// The code generator agent will deploy the code automatically as part of its generation process
			timings.startStep('WebSocket Connection & Generation');
			console.log('\nStep 3: Connecting to the WebSocket and requesting file generation...');
			const generatedFiles = await testWebSocketConnection(websocketUrl);
			timings.endStep();

			timings.printSummary();
			return result;
		} catch (error) {
			console.error(chalk.red('❌ Error testing incremental code generation:'), error);
			timings.printSummary();
			return null;
		}
	}

	async function testWebSocketConnection(wsUrl) {
		return new Promise((resolve, reject) => {
			try {
				console.log(`${chalk.blue('Connecting to WebSocket:')} ${chalk.yellow(wsUrl)}`);

				const WebSocket = require('ws');
				websocket = new WebSocket(wsUrl, {
					// Add options to help with local development connections
					rejectUnauthorized: false, // Don't reject self-signed certificates
					headers: {
						Origin: 'http://localhost:8787', // Set origin header for local development
					},
				});

				// Track generated files to display progress
				const generatedFiles = [];
				let totalFiles = 0;
				let connectionTimeout;
				let generationStart = 0;
				let lastEventTime = 0;
                let enhancedFiles = 0; // Track enhanced files count

				// Phase tracking
				const phases = {
					connection: {
						started: Date.now(),
						completed: null
					},
					blueprint: {
						started: null,
						completed: null
					},
                    phaseGeneration: {
                        started: null,
                        completed: null,
                        phases: []
                    },
                    phaseImplementation: {
                        started: null,
                        completed: null,
                        phases: {}
                    },
                    enhancement: {
                        started: null,
                        completed: null,
                        files: {}
                    },
					deployment: {
						started: null,
						completed: null
					},
					codeReview: {
						started: null,
						completed: null
					}
				};

				websocket.on('open', () => {
					phases.connection.completed = Date.now();
					const connectionTime = phases.connection.completed - phases.connection.started;
					console.log(chalk.green(`✅ WebSocket connection established in ${formatDuration(connectionTime)}!`));
					timings.trackEvent('WebSocket Connected');

					// Listen for messages
					websocket.on('message', (data) => {
						try {
							lastEventTime = Date.now();
							const message = JSON.parse(data.toString());

							// Filter out malformed messages where the type field is not a simple string
							// This happens when the cf_agent_state contains the entire serialized state
							if (typeof message.type !== 'string' || /[{}\[\]]/.test(message.type)) {
								// Skip processing if the type field is not a string or contains JSON objects
								return;
							}

							console.log(`\n${chalk.blue(`Received message: ${message.type}`)}`);

							switch (message.type) {
								case 'cf_agent_state':
									// Ignore state updates
									break;

                                // Phase Generation
                                case 'phase_generating':
                                    if (!phases.phaseGeneration.started) {
                                        phases.phaseGeneration.started = Date.now();
                                        timings.trackEvent('Phase Generation Started');
                                    }
                                    console.log(chalk.blue(`🔄 ${message.message || 'Generating phases'}`));
                                    break;

                                case 'phase_generated':
                                    phases.phaseGeneration.completed = Date.now();
                                    const phaseGenerationTime = phases.phaseGeneration.completed - phases.phaseGeneration.started;

                                    if (message.phases) {
                                        // All phases were generated at once
                                        console.log(chalk.green(`✅ All phases generated in ${formatDuration(phaseGenerationTime)}!`));
                                        console.log(chalk.blue('Phases:'));
                                        
                                        message.phases.phases.forEach((phase, i) => {
                                            console.log(`  ${chalk.yellow(`Phase ${i+1}:`)} ${chalk.bold(phase.name)} - ${phase.files.length} files`);
                                            phases.phaseGeneration.phases.push({
                                                name: phase.name,
                                                description: phase.description,
                                                files: phase.files.map(f => f.path)
                                            });
                                        });

                                        totalFiles = message.phases.phases.reduce((sum, phase) => sum + phase.files.length, 0);
                                        console.log(`${chalk.blue('Total files to generate:')} ${chalk.yellow(totalFiles)}`);

										const commands = message.phases.commands || [];
										if (commands.length > 0) {
											console.log(chalk.blue('Commands to run:'));
											commands.forEach((command, i) => {
												console.log(`  ${i + 1}. ${chalk.yellow(command)}`);
											});	
										} else {
											console.log(chalk.blue('No commands to run for phase generation'));
										}
                                    } 
                                    else if (message.phase) {
                                        // Single phase was generated
                                        console.log(chalk.green(`✅ Phase ${chalk.bold(message.phase.name)} generated`));
                                        
                                        phases.phaseGeneration.phases.push({
                                            name: message.phase.name,
                                            description: message.phase.description,
                                            files: message.phase.files.map(f => f.filePath)
                                        });
                                    }
                                    
                                    timings.trackEvent('Phase Generation Complete');
                                    break;
                                case 'file_generating':
									console.log(`${chalk.blue('Generating file:')} ${message.filePath}, purpose: ${message.filePurpose}`);
									break;
								case 'file_generated':
									console.log(`${chalk.green('✅')} ${message.file} generated`);
									break;
								case 'file_chunk_generated':
									// console.log(`${chalk.yellow('Generating file chunk:')} ${message.filePath} length: ${message.chunk.length}`);
									break;
                                // Phase Implementation 
                                case 'phase_implementing':
                                    if (!phases.phaseImplementation.started) {
                                        phases.phaseImplementation.started = Date.now();
                                        generationStart = Date.now();
                                        timings.trackEvent('Phase Implementation Started');
                                    }

                                    // Start tracking this phase
                                    const phaseStartTime = Date.now();
                                    const phaseName = message.phase || 'unknown';
                                    phases.phaseImplementation.phases[phaseName] = {
                                        started: phaseStartTime,
                                        completed: null,
                                        files: []
                                    };

                                    console.log(`\n${chalk.blue(`🛠️ Implementing phase: ${chalk.bold(phaseName)}`)}`);
                                    if (message.phase_description) {
                                        console.log(`${chalk.dim(`Description: ${message.phase_description}`)}`);
                                    }

                                    if (message.files && message.files.length > 0) {
                                        console.log(`${chalk.blue('Files in this phase:')}`);
                                        message.files.forEach((file, i) => {
                                            console.log(`  ${i+1}. ${chalk.yellow(file)}`);
                                        });
                                    }
                                    break;
                                
                                case 'phase_implemented':
                                    const implementedPhaseName = message.phase?.name || 'unknown';
                                    
                                    if (phases.phaseImplementation.phases[implementedPhaseName]) {
                                        phases.phaseImplementation.phases[implementedPhaseName].completed = Date.now();
                                        const phaseTime = phases.phaseImplementation.phases[implementedPhaseName].completed - 
                                                         phases.phaseImplementation.phases[implementedPhaseName].started;
                                        console.log(`${chalk.green(`⏱️ Phase ${chalk.bold(implementedPhaseName)} implemented in ${formatDuration(phaseTime)}`)}`);
                                    }

                                    console.log(`\n${chalk.green(`✅ Phase implemented: ${chalk.bold(implementedPhaseName)}`)}`);
                                    
                                    // Track all files in this phase
                                    if (message.phase?.files) {
                                        message.phase.files.forEach(file => {
                                            // Add to generatedFiles array for tracking
                                            generatedFiles.push({
                                                filePath: file.filePath,
                                                fileContents: file.fileContents,
                                            });
                                            
                                            // Add to phase tracking
                                            if (phases.phaseImplementation.phases[implementedPhaseName]) {
                                                phases.phaseImplementation.phases[implementedPhaseName].files.push(file.filePath);
                                            }

                                            console.log(`  - ${chalk.yellow(file.filePath)}: ${file.filePurpose || 'Generated successfully'}`);
                                        });
                                    }

									// Print phase summary
									const description = message.phase?.description || 'No description provided';
									console.log(`${chalk.blue('Phase description:')} ${description}`);
                                    
                                    // Check progress
                                    console.log(`${chalk.blue(`Progress: ${chalk.yellow(generatedFiles.length + '/' + totalFiles)} files`)}`);
                                    
                                    // Calculate timing info
                                    const totalTimeElapsed = Date.now() - timings.start;
                                    const generationTimeElapsed = Date.now() - generationStart;
                                    console.log(`${chalk.cyan('⏰ Total time elapsed:')} ${chalk.yellow(formatDuration(totalTimeElapsed))}`);
                                    console.log(`${chalk.cyan('⌛ Generation time so far:')} ${chalk.yellow(formatDuration(generationTimeElapsed))}`);
                                    break;

								case 'file_enhanced':
                                    if (!phases.enhancement.started) {
                                        phases.enhancement.started = Date.now();
                                        timings.trackEvent('First File Enhancement');
                                    }
                                    
                                    enhancedFiles++;
                                    console.log(`\n${chalk.magenta('🔍 Enhanced file:')} ${chalk.yellow(message.filePath)}`);
                                    
                                    if (message.issues_fixed && message.issues_fixed.length > 0) {
                                        console.log(chalk.magenta('Issues fixed:'));
                                        message.issues_fixed.forEach((issue, i) => {
                                            console.log(`  ${i+1}. ${chalk.dim(issue.description || issue)}`);
                                        });
                                    }
                                    
                                    // Track file enhancement time
                                    phases.enhancement.files[message.filePath] = {
                                        completed: Date.now()
                                    };
                                    break;

								case 'file_regenerated':
									console.log(`\n${chalk.yellow('🔄 File regenerated:')} ${chalk.bold(message.file.filePath)}`);
									console.log(`${chalk.dim('Original issues:')} ${message.original_issues || 'None'}`);
									timings.trackEvent('File Regenerated');

									// Update the file in generatedFiles array
									const existingIndex = generatedFiles.findIndex(f => f.filePath === message.file.filePath);
									if (existingIndex !== -1) {
										generatedFiles[existingIndex] = {
											filePath: message.file.filePath,
											fileContents: message.file.fileContents,
										};
										console.log(`${chalk.dim('Updated file in our local collection.')}`);
									} else {
										generatedFiles.push({
											filePath: message.file.filePath,
											fileContents: message.file.fileContents,
										});
										console.log(`${chalk.dim('Added regenerated file to our local collection.')}`);
									}
									break;

								case 'generation_started':
									phases.blueprint.completed = Date.now();
									timings.trackEvent('Generation Started');
									console.log(chalk.blue('Starting code generation process...'));

									if (message.totalFiles) {
										totalFiles = message.totalFiles;
										console.log(`${chalk.blue('Total files to generate:')} ${chalk.yellow(totalFiles)}`);
									}
									break;

								case 'generation_complete':
									phases.phaseImplementation.completed = Date.now();
									const generationTime = phases.phaseImplementation.completed - phases.phaseImplementation.started;

									console.log(`\n${chalk.green(`✅ Generation completed in ${formatDuration(generationTime)}!`)}`);
									console.log(`${chalk.green(`Generated ${generatedFiles.length}/${totalFiles || generatedFiles.length} files`)}`);
                                    
                                    if (enhancedFiles > 0) {
                                        phases.enhancement.completed = Date.now();
                                        console.log(`${chalk.magenta(`Enhanced ${enhancedFiles} files during generation`)}`);
                                    }
                                    
									timings.trackEvent('Generation Complete');
									break;

								case 'deployment_completed':
                                    if (!phases.deployment.started) {
                                        phases.deployment.started = Date.now();
                                        timings.trackEvent('Deployment Started');
                                    }
                                    
									phases.deployment.completed = Date.now();
									const deployTime = phases.deployment.completed - phases.deployment.started;

									console.log(`\n${chalk.green(`✅ Deployment completed in ${formatDuration(deployTime)}!`)}`);
									timings.trackEvent('Deployment Complete');

									runId = message.instanceId;
									console.log(`${chalk.blue('Runner instance ID:')} ${chalk.yellow(runId)}`);

									if (message.previewURL) {
										console.log(`${chalk.blue('Preview URL:')} ${chalk.green.underline(message.previewURL)}`);
									}
                                    
                                    // Print summary after successful deployment
                                    printPhaseSummary(phases);
                                    
                                    // If this is the final deployment (after all fixed), close the connection
                                    if (phases.codeReview.completed && !phases.codeReview.hasIssues) {
                                        clearTimeout(connectionTimeout);
                                        websocket.close(1000, 'Generation and deployment complete');
                                        resolve(generatedFiles);
                                    }
									break;
								case 'command_executing':
									const commands = message.commands || [];
									if (commands.length > 0) {
										console.log(chalk.blue('Executing commands:'));
										commands.forEach((command, i) => {
											console.log(`  ${i + 1}. ${chalk.yellow(command)}`);
										});
									} else {
										console.log(chalk.blue('No commands to execute'));
									}
									break;
								case 'code_review':
									if (!phases.codeReview.started) {
										phases.codeReview.started = Date.now();
										timings.trackEvent('Code Review Started');
									}

									console.log(`\n${chalk.magenta('🔍 Code review results received')}`);
									if (message.review) {
										console.log(`${chalk.blue('Issues found:')} ${message.review.issuesFound ? chalk.red('Yes') : chalk.green('No')}`);
										console.log(`${chalk.blue('Summary:')} ${chalk.dim(message.review.summary)}`);
                                        
                                        // Store if issues were found to track review cycles
                                        phases.codeReview.hasIssues = message.review.issuesFound;

										if (message.review.issuesFound && message.review.filesToFix) {
											console.log(`${chalk.yellow(`Files that need fixing: ${message.review.filesToFix.length}`)}`);
											message.review.filesToFix.forEach(fileFix => {
												console.log(`  - ${chalk.yellow(fileFix.filePath)}: ${chalk.red(`${fileFix.issues.length} issues`)}`);
											});
										} else {
                                            // No issues found, we can close connection after final deployment
                                            console.log(`${chalk.green('No issues found in code review')}`);
                                        }

										const commands = message.review.commands || [];
										if (commands.length > 0) {
											console.log(chalk.blue('Commands to run:'));
											commands.forEach((command, i) => {
												console.log(`  ${i + 1}. ${chalk.yellow(command)}`);
											});	
										} else {
											console.log(chalk.blue('No commands to run for code review'));
										}

										if (message.review.dependencies_already_installed) {
											console.log(chalk.blue('Dependencies already installed:'));
											message.review.dependencies_already_installed.forEach((dep, i) => {
												console.log(`  ${i + 1}. ${chalk.yellow(dep)}`);
											});
										}

										if (message.review.dependenciesNotMet) {
											console.log(chalk.red('Dependencies not met:'));
											message.review.dependenciesNotMet.forEach((dep, i) => {
												console.log(`  ${i + 1}. ${chalk.red(dep)}`);
											});
										}

										phases.codeReview.completed = Date.now();
										const reviewTime = phases.codeReview.completed - phases.codeReview.started;
										console.log(`${chalk.cyan(`⏱️ Code review completed in ${formatDuration(reviewTime)}`)}`);
										timings.trackEvent('Code Review Complete');
									}
									break;

								case 'runtime_error_found':
									console.log(`\n${chalk.red('⚠️ Runtime errors detected!')}`);
									timings.trackEvent('Runtime Errors Found');

									if (message.errors && message.errors.length > 0) {
										message.errors.forEach((err, i) => {
											console.log(`${chalk.red(`${i + 1}. ${err.message}`)}`);
											if (err.filePath) {
												console.log(`   ${chalk.yellow(`File: ${err.filePath}${err.lineNumber ? `:${err.lineNumber}` : ''}`)}`);
											}
										});
									}
									break;

								case 'error':
									console.error(`${chalk.red(`❌ Error from WebSocket: ${message.error}`)}`);
									timings.trackEvent(`Error: ${message.error.substring(0, 30)}...`);

									// Some errors are recoverable
									if (message.error.includes('No more files')) {
										console.log(chalk.yellow('All files have been generated!'));
									}
									break;

								default:
									console.log(`${chalk.yellow(`Unknown message type: ${message.type}`)}`);
									console.log('Message content:', message);
							}
						} catch (parseError) {
							console.error(chalk.red('Error parsing WebSocket message:'), parseError);
							console.log(chalk.dim(`Raw message: ${data.toString().substring(0, 200)}...`));
						}
					});

					// Send request to generate all files
					console.log(chalk.blue('Requesting file generation...'));
					websocket.send(JSON.stringify({ type: 'generate_all' }));
					phases.blueprint.started = Date.now();
					timings.trackEvent('Generation Request Sent');

					// Set up ping interval to keep connection alive
					const pingInterval = setInterval(() => {
						if (websocket.readyState === WebSocket.OPEN) {
							try {
								// Send empty ping
								websocket.ping();
							} catch (pingError) {
								console.warn(chalk.yellow('Error sending ping:'), pingError);
							}
						} else {
							clearInterval(pingInterval);
						}
					}, 30000); // Ping every 30 seconds
                    
                    // Set auto-timeout for connection (in case of hanging)
                    connectionTimeout = setTimeoutCallback(() => {
                        console.log(`\n${chalk.yellow(`⚠️ Auto-closing connection after ${formatDuration(config.autoShutdownTimeout)} timeout`)}`);
                        websocket.close(1000, 'Auto-shutdown due to timeout');
                        resolve(generatedFiles);
                    }, config.autoShutdownTimeout);
				});

				websocket.on('error', (error) => {
					console.error(chalk.red('❌ WebSocket error:'), error);
					clearTimeout(connectionTimeout);
					timings.trackEvent('WebSocket Error');
					reject(error);
				});

				websocket.on('close', (code, reason) => {
					console.log(chalk.dim(`WebSocket connection closed with code ${code}: ${reason || 'No reason provided'}`));
					clearTimeout(connectionTimeout);

					const totalTime = Date.now() - phases.connection.started;
					console.log(`${chalk.cyan(`⏱️ Total WebSocket session time: ${formatDuration(totalTime)}`)}`);
					timings.trackEvent('WebSocket Closed');

					resolve(generatedFiles);
				});

			} catch (error) {
				console.error(chalk.red('❌ Error establishing WebSocket connection:'), error);
				timings.trackEvent('WebSocket Connection Failed');
				reject(error);
			}
		});
	}

	// Print a summary of phase timings
	function printPhaseSummary(phases) {
		console.log('\n⏱️ ' + chalk.bold.bgBlue(' === PHASE TIMING SUMMARY === '));

		if (phases.connection.completed) {
			const connectionTime = phases.connection.completed - phases.connection.started;
			console.log(`${chalk.blue('WebSocket connection:')} ${chalk.yellow(formatDuration(connectionTime))}`);
		}

		if (phases.blueprint.completed && phases.blueprint.started) {
			const blueprintTime = phases.blueprint.completed - phases.blueprint.started;
			console.log(`${chalk.blue('Blueprint analysis:')} ${chalk.yellow(formatDuration(blueprintTime))}`);
		}
        
        // Show phase generation time
        if (phases.phaseGeneration.completed && phases.phaseGeneration.started) {
            const phaseGenTime = phases.phaseGeneration.completed - phases.phaseGeneration.started;
            console.log(`${chalk.blue('Phase generation:')} ${chalk.yellow(formatDuration(phaseGenTime))}`);
            console.log(`${chalk.blue('Phases generated:')} ${chalk.yellow(phases.phaseGeneration.phases.length)}`);
        }

        // Show phase implementation time
		if (phases.phaseImplementation.completed && phases.phaseImplementation.started) {
			const implementationTime = phases.phaseImplementation.completed - phases.phaseImplementation.started;
			console.log(`${chalk.blue('Phase implementation:')} ${chalk.yellow(formatDuration(implementationTime))}`);

			// Count completed phases
			const phasesWithTiming = Object.entries(phases.phaseImplementation.phases)
				.filter(([_, data]) => data.completed)
				.sort((a, b) => (a[1].started || 0) - (b[1].started || 0));

			if (phasesWithTiming.length > 0) {
				console.log(`${chalk.blue('Phases implemented:')} ${chalk.yellow(phasesWithTiming.length)}`);
				console.log(chalk.blue('Phase implementation times:'));
				phasesWithTiming.forEach(([phaseName, data]) => {
					const phaseTime = data.completed - data.started;
					console.log(`  - ${chalk.bold(phaseName)}: ${chalk.yellow(formatDuration(phaseTime))}, ${chalk.dim(`${data.files.length} files`)}`);
				});

				// Average time per phase
				const totalPhaseTime = phasesWithTiming.reduce((sum, [_, data]) => sum + (data.completed - data.started), 0);
				const avgPhaseTime = totalPhaseTime / phasesWithTiming.length;
				console.log(`${chalk.blue('Average time per phase:')} ${chalk.yellow(formatDuration(avgPhaseTime))}`);
			}
		}
        
        // Report on enhancement phase if active
        if (phases.enhancement.started) {
            const enhancedFiles = Object.keys(phases.enhancement.files).length;
            if (enhancedFiles > 0) {
                console.log(`${chalk.magenta('File enhancement:')} ${chalk.yellow(`${enhancedFiles} files enhanced`)}`);
                
                // Calculate enhancement ratio if applicable
                const totalFilesGenerated = Object.values(phases.phaseImplementation.phases)
                    .reduce((sum, phase) => sum + phase.files.length, 0);
                    
                if (totalFilesGenerated > 0) {
                    const enhancementRatio = enhancedFiles / totalFilesGenerated;
                    console.log(`${chalk.magenta('Enhancement ratio:')} ${chalk.yellow(`${(enhancementRatio * 100).toFixed(1)}% of files needed enhancement`)}`);
                }
            }
        }

		if (phases.deployment.completed && phases.deployment.started) {
			const deployTime = phases.deployment.completed - phases.deployment.started;
			console.log(`${chalk.blue('Deployment:')} ${chalk.yellow(formatDuration(deployTime))}`);
		}

		if (phases.codeReview.completed && phases.codeReview.started) {
			const reviewTime = phases.codeReview.completed - phases.codeReview.started;
			console.log(`${chalk.blue('Code review:')} ${chalk.yellow(formatDuration(reviewTime))}`);
            console.log(`${chalk.blue('Issues found:')} ${phases.codeReview.hasIssues ? chalk.red('Yes') : chalk.green('No')}`);
		}

		// Total time from start to now
		const totalTime = Date.now() - phases.connection.started;
		console.log(`${chalk.bold('Total execution time:')} ${chalk.yellow(formatDuration(totalTime))}`);
	}

	// Run the tests
	timings.startStep('Full Test Suite');
	await testIncrementalCodegen();
	timings.endStep();

	console.log(`\n${chalk.green.bold('🎉 Tests completed!')}`);
}

run();