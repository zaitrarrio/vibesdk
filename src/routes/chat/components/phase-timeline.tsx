import clsx from 'clsx';
import { Loader, Check, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { PhaseTimelineItem, FileType } from '../hooks/use-chat';
import { ThinkingIndicator } from './thinking-indicator';

interface PhaseTimelineProps {
	phaseTimeline: PhaseTimelineItem[];
	files: FileType[];
	view: string;
	activeFile?: FileType;
	onFileClick: (file: FileType) => void;
	isThinkingNext?: boolean;
	isPreviewDeploying?: boolean;
}

// Helper function to truncate long file paths
function truncateFilePath(filePath: string, maxLength: number = 30): string {
	if (filePath.length <= maxLength) return filePath;
	
	const parts = filePath.split('/');
	const fileName = parts[parts.length - 1];
	
	// If even the filename is too long, truncate it more aggressively
	if (fileName.length > maxLength - 8) {
		const extension = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
		const nameWithoutExt = fileName.replace(extension, '');
		const truncatedName = nameWithoutExt.substring(0, Math.max(8, maxLength - 12));
		return `[...]/${truncatedName}[...]${extension}`;
	}
	
	// Otherwise, truncate the path but keep the filename
	const pathWithoutFile = parts.slice(0, -1).join('/');
	const availableSpace = maxLength - fileName.length - 6; // 6 for '[...]/'
	
	if (availableSpace <= 0) {
		return `[...]/${fileName}`;
	}
	
	// More aggressive path truncation
	if (pathWithoutFile.length > availableSpace) {
		return `[...]/${fileName}`;
	}
	
	return `${pathWithoutFile.substring(0, availableSpace)}[...]/${fileName}`;
}

// Helper function to calculate incremental line count for a file in a specific phase
function calculateIncrementalLineCount(
	currentFilePath: string, 
	currentPhaseIndex: number, 
	phaseTimeline: PhaseTimelineItem[], 
	globalFiles: FileType[]
): number {
	const globalFile = globalFiles.find(f => f.filePath === currentFilePath);
	if (!globalFile) return 0;
	
	const currentTotalLines = globalFile.fileContents.split('\n').length;
	
	// Find the previous phase that contains this same file
	for (let i = currentPhaseIndex - 1; i >= 0; i--) {
		const previousPhase = phaseTimeline[i];
		const previousPhaseFile = previousPhase.files.find(f => f.path === currentFilePath);
		
		if (previousPhaseFile && previousPhaseFile.contents) {
			const previousLines = previousPhaseFile.contents.split('\n').length;
			return Math.max(0, currentTotalLines - previousLines); // Ensure non-negative
		}
	}
	
	// If this is the first appearance of the file, return the total line count
	return currentTotalLines;
}

const getStatusIcon = (status: 'generating' | 'completed' | 'error' | 'validating') => {
	switch (status) {
		case 'generating':
			return <Loader className="w-3 h-3 animate-spin" />;
		case 'validating':
			return <Loader className="w-3 h-3 animate-spin" />;
		case 'completed':
			return <Check className="w-3 h-3" />;
		case 'error':
			return <AlertCircle className="w-3 h-3" />;
		default:
			return <div className="w-3 h-3 bg-bg-3-foreground/40 dark:bg-bg-3-foreground/30 rounded-full" />;
	}
};

const getStatusColor = (status: 'generating' | 'completed' | 'error' | 'validating') => {
	switch (status) {
		case 'generating':
			return 'text-accent';
		case 'validating':
			return 'text-blue-400';
		case 'completed':
			return 'text-green-500';
		case 'error':
			return 'text-red-500';
		default:
			return 'text-text-tertiary dark:text-text-tertiary';
	}
};

export function PhaseTimeline({ phaseTimeline, files, view, activeFile, onFileClick, isThinkingNext, isPreviewDeploying }: PhaseTimelineProps) {
	const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const lastPhaseRef = useRef<HTMLDivElement>(null);

	// Auto-expand only the currently generating or validating phase
	useEffect(() => {
		const activePhase = phaseTimeline.find(p => p.status === 'generating' || p.status === 'validating');
		if (activePhase) {
			setExpandedPhases(new Set([activePhase.id]));
		}
	}, [phaseTimeline]);

	// Auto-scroll to bottom when new phases are added or thinking indicator appears
	useEffect(() => {
		if (lastPhaseRef.current && scrollContainerRef.current) {
			lastPhaseRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
		}
	}, [phaseTimeline.length, isThinkingNext]);

	const togglePhase = (phaseId: string) => {
		setExpandedPhases(prev => {
			const newSet = new Set(prev);
			if (newSet.has(phaseId)) {
				newSet.delete(phaseId);
			} else {
				newSet.add(phaseId);
			}
			return newSet;
		});
	};

	return (
		<div ref={scrollContainerRef} className="space-y-2 max-h-[500px] overflow-y-auto pr-2 phase-timeline-scroll">
			{/* Sequential Phase Timeline */}
			{phaseTimeline.map((phase, index) => (
				<div 
					key={phase.id} 
					className="space-y-1 relative"
					ref={index === phaseTimeline.length - 1 ? lastPhaseRef : undefined}
				>
					{/* Phase Implementation Header */}
					<button
						onClick={() => phase.status === 'completed' && togglePhase(phase.id)}
						className="flex items-start gap-2 relative z-0 w-full text-left hover:bg-zinc-50/5 rounded px-1 py-1 transition-colors group"
						disabled={phase.status !== 'completed'}
					>
						{/* Expand/Collapse chevron for completed phases */}
						{phase.status === 'completed' && (
							<div className="flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity mt-0.5">
								{expandedPhases.has(phase.id) ? (
									<ChevronDown className="size-3" />
								) : (
									<ChevronRight className="size-3" />
								)}
							</div>
						)}
						
						<div className="flex-shrink-0 mt-0.5">
							{phase.status === 'generating' ? (
								<Loader className="size-3 animate-spin text-accent" />
							) : phase.status === 'validating' ? (
								<Loader className="size-3 animate-spin text-blue-400" />
							) : (
								<Check className="size-3 text-green-500" />
							)}
						</div>
						<span className="text-sm font-medium text-text-50 flex-1 break-words">
							{phase.status === 'completed' ? `Implemented ${phase.name}` : 
							 phase.status === 'validating' ? `Reviewing ${phase.name}` : 
							 `Implementing ${phase.name}`}
						</span>
						
						{/* File count badge for collapsed completed phases */}
						{phase.status === 'completed' && !expandedPhases.has(phase.id) && (
							<span className="text-xs text-text-primary/50 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
								{phase.files.length} files
							</span>
						)}
					</button>
					
					{/* Phase Files - Show when implementing, validating, or expanded */}
					{(phase.status === 'generating' || phase.status === 'validating' || (phase.status === 'completed' && expandedPhases.has(phase.id))) && (
						<div className="ml-6 space-y-0.5">
							{phase.files.map((phaseFile) => {
								// Check if this file exists in the global files array for click handling
								const globalFile = files.find(f => f.filePath === phaseFile.path);
								const isFileActive = view === 'editor' && activeFile?.filePath === phaseFile.path;
								
								return (
									<button
										key={phaseFile.path}
										onClick={() => globalFile && onFileClick(globalFile)}
										className="flex items-start gap-2 py-1 transition-colors font-mono w-full text-left group hover:bg-zinc-50/5 rounded px-2 min-h-0"
										aria-selected={isFileActive}
										disabled={!globalFile}
									>
										{/* Status Icon BEFORE filename */}
										<span className={clsx('flex-shrink-0', getStatusColor(phaseFile.status))}>
											{getStatusIcon(phaseFile.status)}
										</span>
										
										{/* File Path with proper truncation and wrapping */}
										<div className="flex-1 min-w-0">
											<span
												className={clsx(
													'text-xs text-left block transition-colors break-all leading-tight',
													isFileActive
														? 'text-brand font-medium'
														: globalFile ? 'text-text-primary/80 group-hover:text-text-primary' : 'text-text-primary/50',
												)}
												title={phaseFile.path}
											>
												{truncateFilePath(phaseFile.path)}
											</span>
										</div>
										
										{/* Incremental line count with responsive width and truncation */}
										{globalFile && (() => {
											const incrementalLines = calculateIncrementalLineCount(
												phaseFile.path, 
												index, 
												phaseTimeline, 
												files
											);
											const displayCount = incrementalLines > 999 ? `${Math.floor(incrementalLines / 1000)}k` : incrementalLines.toString();
											
											return (
												<span 
													className="flex-shrink-0 text-text-tertiary text-xs font-mono text-right max-w-16 ml-2 truncate mt-0.5" 
													title={`${incrementalLines} lines added in this phase`}
												>
													+{displayCount}
												</span>
											);
										})()}
									</button>
								);
							})}
						</div>
					)}
				</div>
			))}
			
			{/* Validation/Preview deployment indicator */}
			{(() => {
				const validatingPhase = phaseTimeline.find(p => p.status === 'validating');
				if (validatingPhase) {
					return (
						<div className="space-y-1 relative bg-blue-50/5 border border-blue-200/20 rounded-lg p-3">
							<div className="flex items-center gap-2">
								<Loader className="size-3 animate-spin text-blue-400" />
								<span className="text-sm font-medium text-blue-400">Reviewing phase...</span>
							</div>
							<span className="text-xs text-blue-300/80 ml-5">Running tests and fixing any issues</span>
						</div>
					);
				} else if (isPreviewDeploying) {
					return (
						<div className="space-y-1 relative bg-orange-50/5 border border-orange-200/20 rounded-lg p-3">
							<div className="flex items-center gap-2">
								<Loader className="size-3 animate-spin text-orange-400" />
								<span className="text-sm font-medium text-orange-400">Deploying preview...</span>
							</div>
							<span className="text-xs text-orange-300/80 ml-5">Updating your preview environment</span>
						</div>
					);
				}
				return null;
			})()}
			
			{/* Thinking indicator for next phase - with subtle animation */}
			{isThinkingNext && (
				<div className="relative z-10" ref={lastPhaseRef}>
					<ThinkingIndicator visible={isThinkingNext} />
				</div>
			)}
			
			{/* Fallback for existing files when no phase timeline */}
			{phaseTimeline.length === 0 && files.map((file) => {
				const isFileActive = view === 'editor' && activeFile?.filePath === file.filePath;
				return (
					<button
						key={file.filePath}
						onClick={() => onFileClick(file)}
						className="flex items-start gap-2 py-1 font-mono w-full text-left group hover:bg-zinc-50/5 rounded px-2 min-h-0"
					>
						{/* Status icon BEFORE filename */}
						<span className={clsx('flex-shrink-0', file.isGenerating ? 'text-accent' : 'text-green-500')}>
							{file.isGenerating ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
						</span>
						
						<div className="flex-1 min-w-0">
							<span 
								className={clsx('text-xs block break-all leading-tight', isFileActive ? 'text-brand font-medium' : 'text-text-primary/80')}
								title={file.filePath}
							>
								{truncateFilePath(file.filePath)}
							</span>
						</div>
						
						<span className="flex-shrink-0 text-text-tertiary text-xs font-mono text-right w-12 ml-2 mt-0.5">
							+{file.fileContents.split('\n').length}
						</span>
					</button>
				);
			})}
		</div>
	);
}
