import { useRef, useState, useEffect, useMemo } from 'react';
import { ArrowRight } from 'react-feather';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';
import {
	AgentModeToggle,
	type AgentMode,
} from '../components/agent-mode-toggle';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { AppCard } from '@/components/shared/AppCard';
import clsx from 'clsx';

export default function Home() {
	const navigate = useNavigate();
	const { requireAuth } = useAuthGuard();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [agentMode, setAgentMode] = useState<AgentMode>('deterministic');
	const { user } = useAuth();


	const placeholderPhrases = useMemo(() => [
		"todo list app",
		"F1 fantasy game",
		"personal finance tracker"
	], []);
	const [currentPlaceholderPhraseIndex, setCurrentPlaceholderPhraseIndex] = useState(0);
	const [currentPlaceholderText, setCurrentPlaceholderText] = useState("");
	const [isPlaceholderTyping, setIsPlaceholderTyping] = useState(true);

	const {
		apps,
		loading,
	} = usePaginatedApps({
		type: 'public',
		defaultSort: 'popular',
		defaultPeriod: 'week',
		limit: 6,
	});

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

	const discoverLinkRef = useRef<HTMLDivElement>(null);

	return (
		<div className="relative flex flex-col items-center size-full">
			<LayoutGroup>
				<div className="rounded-md w-full max-w-2xl overflow-hidden">
					<div className={"absolute inset-2 top-0 text-accent z-0 opacity-20 w-full h-full -mt-12"}>
						<svg width="100%" height="110%">
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
					<motion.div
						layout
						transition={{ type: "spring", stiffness: 200, damping: 40 }}
						className={clsx("px-6 p-8 flex flex-col items-center z-10", !loading && apps?.length > 0 ? "mt-24" : "mt-48")}>
						<h1 className="text-shadow-sm text-shadow-red-200 dark:text-shadow-red-900 text-accent font-medium leading-[1.1] tracking-tight text-5xl w-full mb-4 bg-clip-text bg-gradient-to-r from-text-primary to-text-primary/90">
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
					</motion.div>

				</div>

				{!loading && apps?.length > 5 && (
					<div className='flex flex-col items-start max-w-6xl my-24 mx-auto px-4 z-10'>
						<h2 className="text-2xl font-medium text-text-secondary/80">Discover Apps built by the community</h2>
						<div ref={discoverLinkRef} className="text-md font-light mb-4 text-text-tertiary hover:underline underline-offset-4 select-text cursor-pointer" onClick={() => navigate('/discover')} >View All</div>
						<motion.div
							layout
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.95 }}
							transition={{ duration: 0.4 }}
							className="grid grid-cols-2 xl:grid-cols-3 gap-6"
						>
							<AnimatePresence mode="popLayout">
								{apps.map(app => (
									<AppCard
										key={app.id}
										app={app}
										onClick={() => navigate(`/app/${app.id}`)}
										showStats={true}
										showUser={true}
										showActions={false}
									/>
								))}
							</AnimatePresence>
						</motion.div>
					</div>
				)}
			</LayoutGroup>

			{/* Nudge towards Discover */}
			{user && <CurvedArrow sourceRef={discoverLinkRef} target={{ x: 50, y: window.innerHeight - 60 }} />}
		</div>
	);
}



type ArrowProps = {
	/** Ref to the source element the arrow starts from */
	sourceRef: React.RefObject<HTMLElement | null>;
	/** Target point in viewport/client coordinates */
	target: { x: number; y: number };
	/** Curve intensity (0.1 - 1.5 is typical) */
	curvature?: number;
	/** Optional pixel offset from source element edge */
	sourceOffset?: number;
	/** If true, hides the arrow when the source is offscreen/not measurable */
	hideWhenInvalid?: boolean;
};

type Point = { x: number; y: number };

export const CurvedArrow: React.FC<ArrowProps> = ({
	sourceRef,
	target,
	curvature = 0.5,
	sourceOffset = 6,
	hideWhenInvalid = true,
}) => {
	const [start, setStart] = useState<Point | null>(null);
	const [end, setEnd] = useState<Point | null>(null);

	const rafRef = useRef<number | null>(null);
	const roRef = useRef<ResizeObserver | null>(null);

	const compute = () => {
		const el = sourceRef.current;
		if (!el) {
			setStart(null);
			setEnd(null);
			return;
		}

		const rect = el.getBoundingClientRect();
		if (!rect || rect.width === 0 || rect.height === 0) {
			setStart(null);
			setEnd(null);
			return;
		}

		const endPoint: Point = { x: target.x, y: target.y };

		// Choose an anchor on the source: midpoint of the side facing the target
		const centers = {
			right: { x: rect.right, y: rect.top + rect.height / 2 },
			left: { x: rect.left, y: rect.top + rect.height / 2 },
		};

		// Distances to target from each side center
		const dists = Object.fromEntries(
			Object.entries(centers).map(([side, p]) => [
				side,
				(p.x - endPoint.x) ** 2 + (p.y - endPoint.y) ** 2,
			])
		) as Record<keyof typeof centers, number>;

		const bestSide = (Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0] ||
			"right") as keyof typeof centers;

		// Nudge start point slightly outside the element for visual clarity
		const nudge = (p: Point, side: keyof typeof centers, offset: number) => {
			switch (side) {
				case "right":
					return { x: p.x + offset, y: p.y };
				case "left":
					return { x: p.x - offset, y: p.y };
			}
		};

		const startPoint = nudge(centers[bestSide], bestSide, sourceOffset);

		setStart(startPoint);
		setEnd(endPoint);
	};

	// Throttle updates with rAF to avoid layout thrash
	const scheduleCompute = () => {
		if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
		rafRef.current = requestAnimationFrame(compute);
	};

	useEffect(() => {
		scheduleCompute();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [target.x, target.y, sourceRef.current]);

	useEffect(() => {
		const onScroll = () => scheduleCompute();
		const onResize = () => scheduleCompute();

		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onResize);

		// Track source element size changes
		const el = sourceRef.current;
		if ("ResizeObserver" in window) {
			roRef.current = new ResizeObserver(() => scheduleCompute());
			if (el) roRef.current.observe(el);
		}

		scheduleCompute();

		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onResize);
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			if (roRef.current && el) roRef.current.unobserve(el);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const d = useMemo(() => {
		if (!start || !end) return "";

		const dx = end.x - start.x;
		const dy = end.y - start.y;

		// Control points: bend the curve based on the primary axis difference.
		// This gives a nice S or C curve without sharp kinks.
		const cpOffset = Math.max(Math.abs(dx), Math.abs(dy)) * curvature;

		const c1: Point = { x: start.x + cpOffset * (dx >= 0 ? 1 : -1), y: start.y };
		const c2: Point = { x: end.x - cpOffset * (dx >= 0 ? 1 : -1), y: end.y };

		return `M ${start.x},${start.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`;
	}, [start, end, curvature]);

	const hidden = hideWhenInvalid && (!start || !end);

	if (start && end && (end.y - start.y > 420 || start.x - end.x < 100)) {
		return null;
	}

	return (
		<svg
			aria-hidden="true"
			style={{
				position: "fixed",
				inset: 0,
				width: "100vw",
				height: "100vh",
				pointerEvents: "none",
				overflow: "visible",
				zIndex: 9999,
				display: hidden ? "none" : "block",
			}}
		>
			<defs>
				<filter id="discover-squiggle" x="-20%" y="-20%" width="140%" height="140%">
					<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="3" result="noise" />
					<feDisplacementMap in="SourceGraphic" in2="noise" scale="1" xChannelSelector="R" yChannelSelector="G" />
				</filter>
				<marker id="discover-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth" opacity={0.20}>
					<path d="M 0 1.2 L 7 4" stroke="var(--color-text-tertiary)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
					<path d="M 0 6.8 L 7 4" stroke="var(--color-text-tertiary)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
				</marker>
			</defs>

			<path
				d={d}
				// stroke="var(--color-accent)"
				stroke="var(--color-text-tertiary)"
				strokeOpacity={0.20}
				strokeWidth={1.6}
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
				markerEnd="url(#discover-arrowhead)"
			/>
			{/* Soft squiggle overlay for hand-drawn feel */}
			<g filter="url(#discover-squiggle)">
				<path
					d={d}
					// stroke="var(--color-accent)"
					stroke="var(--color-text-tertiary)"
					strokeOpacity={0.12}
					strokeWidth={1}
					fill="none"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeDasharray="8 6 4 9 5 7"
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		</svg>
	);
};
