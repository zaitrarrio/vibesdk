import { useRef, useState, useEffect, useMemo } from 'react';
import { ArrowRight } from 'react-feather';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';
import { createPortal } from 'react-dom';
import {
	AgentModeToggle,
	type AgentMode,
} from '../components/agent-mode-toggle';
import { useAuthGuard } from '../hooks/useAuthGuard';

export default function Home() {
	const navigate = useNavigate();
	const { requireAuth } = useAuthGuard();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [agentMode, setAgentMode] = useState<AgentMode>('deterministic');
	
	
	const placeholderPhrases = useMemo(() => [
		"todo list app",
		"F1 fantasy game",
		"personal finance tracker"
	], []);
	const [currentPlaceholderPhraseIndex, setCurrentPlaceholderPhraseIndex] = useState(0);
	const [currentPlaceholderText, setCurrentPlaceholderText] = useState("");
	const [isPlaceholderTyping, setIsPlaceholderTyping] = useState(true);

	const handleCreateApp = (query: string, mode: AgentMode) => {
		const encodedQuery = encodeURIComponent(query);
		const encodedMode = encodeURIComponent(mode);
		const intendedUrl = `/chat/new?query=${encodedQuery}&agentMode=${encodedMode}`;

		if (
			!requireAuth({
				requireFullAuth: true,
				actionContext: 'to create applications',
				intendedUrl: intendedUrl,
			})
		) {
			return;
		}

		// User is already authenticated, navigate immediately
		navigate(intendedUrl);
	};

	// Auto-resize textarea based on content
	const adjustTextareaHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			const scrollHeight = textareaRef.current.scrollHeight;
			const maxHeight = 300; // Maximum height in pixels
			textareaRef.current.style.height =
				Math.min(scrollHeight, maxHeight) + 'px';
		}
	};

	useEffect(() => {
		adjustTextareaHeight();
	}, []);
	
	// Typewriter effect
	useEffect(() => {
		const currentPhrase = placeholderPhrases[currentPlaceholderPhraseIndex];
		
		if (isPlaceholderTyping) {
			if (currentPlaceholderText.length < currentPhrase.length) {
				const timeout = setTimeout(() => {
					setCurrentPlaceholderText(currentPhrase.slice(0, currentPlaceholderText.length + 1));
				}, 100); // Typing speed
				return () => clearTimeout(timeout);
			} else {
				// Pause before erasing
				const timeout = setTimeout(() => {
					setIsPlaceholderTyping(false);
				}, 2000); // Pause duration
				return () => clearTimeout(timeout);
			}
		} else {
			if (currentPlaceholderText.length > 0) {
				const timeout = setTimeout(() => {
					setCurrentPlaceholderText(currentPlaceholderText.slice(0, -1));
				}, 50); // Erasing speed
				return () => clearTimeout(timeout);
			} else {
				// Move to next phrase
				setCurrentPlaceholderPhraseIndex((prev) => (prev + 1) % placeholderPhrases.length);
				setIsPlaceholderTyping(true);
			}
		}
	}, [currentPlaceholderText, currentPlaceholderPhraseIndex, isPlaceholderTyping, placeholderPhrases]);
	return (
		<div className="flex flex-col items-center size-full">
			<div className="rounded-md mt-46 w-full max-w-2xl overflow-hidden">
				<div className="absolute inset-2 bottom-0 text-accent z-0 opacity-20">
					<svg width="100%" height="100%">
						<defs>
							<pattern
								id=":S2:"
								viewBox="-6 -6 12 12"
								patternUnits="userSpaceOnUse"
								width="12"
								height="12"
							>
								<circle
									cx="0"
									cy="0"
									r="1"
									fill="currentColor"
								></circle>
							</pattern>
						</defs>
						<rect
							width="100%"
							height="100%"
							fill="url(#:S2:)"
						></rect>
					</svg>
				</div>
				<div className="px-6 p-8 flex flex-col items-center z-10">
					<h1 className="text-shadow-sm text-shadow-red-200 dark:text-shadow-red-900 text-accent font-medium leading-[1.1] tracking-tight text-6xl w-full mb-4 bg-clip-text bg-gradient-to-r from-text-primary to-text-primary/90">
						What should we build today?
					</h1>

					<form
						method="POST"
						onSubmit={(e) => {
							e.preventDefault();
							const query = textareaRef.current!.value;
							handleCreateApp(query, agentMode);
						}}
						className="flex z-10 flex-col w-full min-h-[150px] bg-bg-4 border border-accent/30 dark:border-accent/50 justify-between dark:bg-bg-2 rounded-[18px] shadow-textarea p-5 transition-all duration-200"
					>
						<textarea
							className="w-full resize-none ring-0 z-20 outline-0 placeholder:text-text-primary/60 text-text-primary"
							name="query"
							placeholder={`Create a ${currentPlaceholderText}`}
							ref={textareaRef}
							onChange={adjustTextareaHeight}
							onInput={adjustTextareaHeight}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									const query = textareaRef.current!.value;
									handleCreateApp(query, agentMode);
								}
							}}
						/>
						<div className="flex items-center justify-between mt-4 pt-1">
							{import.meta.env.VITE_AGENT_MODE_ENABLED ? (
								<AgentModeToggle
									value={agentMode}
									onChange={setAgentMode}
									className="flex-1"
								/>
							) : (
								<div></div>
							)}

							<div className="flex items-center justify-end ml-4">
								<button
									type="submit"
									className="bg-accent text-white p-1 rounded-md *:size-5 transition-all duration-200 hover:shadow-md"
								>
									<ArrowRight />
								</button>
							</div>
						</div>
					</form>
				</div>
			</div>

			{/* Nudge towards Discover */}
			<DiscoverNudge />
		</div>
	);
}

function DiscoverNudge() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
    const boxW = 220;
    const boxH = 48;
    const gapX = 12; // gap between sidebar and arrow head

    useEffect(() => {
        if (!user) return;
        const target = document.getElementById('discover-link');
        if (!target) return;
        const container = (target.closest('li[data-slot="sidebar-menu-item"]') as HTMLElement) ?? (target as HTMLElement);
        setContainerEl(container);

        const compute = () => {
            const tr = target.getBoundingClientRect();
            const left = tr.right + gapX;
            const top = tr.top + tr.height / 2 - boxH / 2;
            setPos({ left, top });
        };

        compute();
        const ro = new ResizeObserver(() => compute());
        ro.observe(target);
        window.addEventListener('resize', compute);
        window.addEventListener('scroll', compute, { passive: true });
        // Poll during sidebar transitions so the overlay slides with it
        const interval = setInterval(compute, 100);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', compute);
            window.removeEventListener('scroll', compute);
            clearInterval(interval);
        };
    }, [user]);

    if (!user || !containerEl) return null;

    // Local overlay box positioned beside the target (computed via fixed left/top)

    // Local arrow from right to left (towards the button). Straight line keeps head perfectly horizontal.
    const tipX = 8;
    const tipY = Math.round(boxH / 2);
    const startX = tipX + 40; // shorter stem
    const path = `M ${startX},${tipY} L ${tipX},${tipY}`;

    const overlay = (
        <div
            className="pointer-events-none fixed z-40 transition-all duration-300 ease-in-out"
            style={{ left: pos.left, top: pos.top, width: boxW, height: boxH }}
            aria-hidden={true}
        >
            <svg width={boxW} height={boxH} className="overflow-visible">
                <defs>
                    <filter id="discover-squiggle" x="-20%" y="-20%" width="140%" height="140%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="3" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                    <marker id="discover-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                        <path d="M 0 1.2 L 7 4" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                        <path d="M 0 6.8 L 7 4" stroke="var(--color-accent)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                    </marker>
                </defs>
                {/* Crisp base stroke with arrowhead, no filter so head stays horizontal */}
                <path
                    d={path}
                    stroke="var(--color-accent)"
                    strokeOpacity={0.88}
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    markerEnd="url(#discover-arrowhead)"
                />
                {/* Soft squiggle overlay for hand-drawn feel */}
                <g filter="url(#discover-squiggle)">
                    <path
                        d={path}
                        stroke="var(--color-accent)"
                        strokeOpacity={0.35}
                        strokeWidth={1.2}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="8 6 4 9 5 7"
                        vectorEffect="non-scaling-stroke"
                    />
                </g>
            </svg>

            <button
                type="button"
                aria-label="Go to Discover"
                onClick={() => navigate('/discover')}
                className="absolute pointer-events-auto select-none px-1 py-0 bg-transparent text-accent hover:opacity-90 transition-opacity"
                style={{ left: tipX + 58, top: tipY - 18, whiteSpace: 'nowrap', fontFamily: "'Gloria Hallelujah', 'Caveat', cursive", transform: 'rotate(-2deg)' }}
            >
                <span className="text-2xl leading-none">Check this out</span>
            </button>
        </div>
    );

    return createPortal(overlay, containerEl);
}
