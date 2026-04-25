'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { Icon } from '@/components/icon';

type GroupProgress = {
	groupId: string;
	groupName: string;
	minRating: number;
	eligibleCount: number;
	totalPairs: number;
	completedPairs: number;
	remainingPairs: number;
	hasRanking: boolean;
};

type NextPair = {
	leftImageId: string;
	rightImageId: string;
} | null;

function normalizeWindowsPath(path: string): string {
	return path.replace(/\//g, '\\');
}

function getFolderName(folderPath: string): string {
	const parts = folderPath.split('\\');
	return parts[parts.length - 1] || folderPath;
}

function getFileId(fileName: string): string {
	const lastDot = fileName.lastIndexOf('.');
	if(lastDot === -1) {
		return fileName;
	}

	return fileName.substring(0, lastDot);
}

function formatRatingStars(rating: number): string {
	const normalizedRating = Math.max(0, Math.min(5, Math.trunc(rating)));
	return normalizedRating > 0 ? '⭐'.repeat(normalizedRating) : '-';
}

function clampRating(value: number): number {
	return Math.max(1, Math.min(5, Math.trunc(value)));
}

function PairwiseComparePageFallback() {
	return (
		<div className="flex min-h-screen flex-col bg-black font-sans">
			<Header folderName={null} title="Pairwise Comparison" isFullscreen={false}>
				<div className="text-zinc-400 text-sm">Loading...</div>
			</Header>
			<main className="flex-1 flex items-center justify-center">
				<div className="flex flex-col items-center gap-4 text-zinc-300">
					<div className="w-12 h-12 border-4 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
					<span>Loading comparison data...</span>
				</div>
			</main>
		</div>
	);
}

function PairwiseComparePageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const groupId = useMemo(() => (searchParams.get('groupId') ?? '').trim(), [searchParams]);
	const minRating = useMemo(() => {
		const value = Number.parseInt(searchParams.get('minRating') ?? '3', 10);
		return clampRating(Number.isFinite(value) ? value : 3);
	}, [searchParams]);

	const [folderPath, setFolderPath] = useState<string>('');
	const [folderName, setFolderName] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSubmittingChoice, setIsSubmittingChoice] = useState<boolean>(false);
	const [leftZoom, setLeftZoom] = useState<number>(100);
	const [rightZoom, setRightZoom] = useState<number>(100);
	const [leftPan, setLeftPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	const [rightPan, setRightPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	const [panningSide, setPanningSide] = useState<'left' | 'right' | null>(null);

	const [fileNameById, setFileNameById] = useState<Map<string, string>>(new Map());
	const [progress, setProgress] = useState<GroupProgress | null>(null);
	const [nextPair, setNextPair] = useState<NextPair>(null);
	const maxZoom = 400;
	const leftContainerRef = useRef<HTMLDivElement | null>(null);
	const rightContainerRef = useRef<HTMLDivElement | null>(null);
	const leftImageRef = useRef<HTMLImageElement | null>(null);
	const rightImageRef = useRef<HTMLImageElement | null>(null);
	const panDragRef = useRef<{ side: 'left' | 'right' | null; lastX: number; lastY: number; moved: boolean }>({
		side: null,
		lastX: 0,
		lastY: 0,
		moved: false,
	});
	const suppressClickRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });

	const loadImageFileMap = useCallback(async(activeFolderPath: string) => {
		const response = await fetch('/api/image', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ folderPath: activeFolderPath, action: 'start' }),
		});

		if(!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Could not load images for pairwise comparison');
		}

		const data = await response.json();
		const files = Array.isArray(data?.files) ? data.files as string[] : [];
		const nextFileMap = new Map<string, string>();

		for(const fileName of files) {
			const fileId = getFileId(fileName);
			if(!nextFileMap.has(fileId)) {
				nextFileMap.set(fileId, fileName);
			}
		}

		setFileNameById(nextFileMap);
	}, []);

	const prepareComparison = useCallback(async(activeFolderPath: string, activeGroupId: string, activeMinRating: number) => {
		const response = await fetch(
			`/api/pairwise?action=prepare&folderPath=${encodeURIComponent(activeFolderPath)}&groupId=${encodeURIComponent(activeGroupId)}&minRating=${encodeURIComponent(String(activeMinRating))}`
		);

		if(!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Could not prepare pairwise comparison');
		}

		const data = await response.json();
		setProgress(data.progress as GroupProgress);
		setNextPair((data.nextPair as NextPair) ?? null);
	}, []);

	useEffect(() => {
		const activeFolder = localStorage.getItem('activeFolder');
		if(!activeFolder) {
			router.push('/select-folder');
			return;
		}

		if(!groupId) {
			router.push('/pairwise-ranking');
			return;
		}

		const normalizedPath = normalizeWindowsPath(activeFolder);
		setFolderPath(normalizedPath);
		setFolderName(getFolderName(normalizedPath));

		let cancelled = false;

		async function loadInitialData() {
			setIsLoading(true);
			setError(null);

			try {
				await Promise.all([
					loadImageFileMap(normalizedPath),
					prepareComparison(normalizedPath, groupId, minRating),
				]);

				if(!cancelled) {
					setIsLoading(false);
				}
			} catch (err) {
				if(!cancelled) {
					setError(err instanceof Error ? err.message : 'Could not load pairwise comparison page');
					setIsLoading(false);
				}
			}
		}

		void loadInitialData();

		return () => {
			cancelled = true;
		};
	}, [router, groupId, minRating, loadImageFileMap, prepareComparison]);

	const comparisonProgressPercent = useMemo(() => {
		if(!progress || progress.totalPairs === 0) {
			return 100;
		}

		return Math.round((progress.completedPairs / progress.totalPairs) * 100);
	}, [progress]);

	const resolveOriginalImagePath = useCallback((imageId: string) => {
		const fileName = fileNameById.get(imageId) ?? null;
		if(!fileName || !folderPath) {
			return {
				fileName,
				path: null,
			};
		}

		return {
			fileName,
			path: `/api/image/${encodeURIComponent(fileName)}?folderPath=${encodeURIComponent(folderPath)}&fileName=${encodeURIComponent(fileName)}`,
		};
	}, [fileNameById, folderPath]);

	const pairData = useMemo(() => {
		if(!nextPair) {
			return null;
		}

		return {
			left: resolveOriginalImagePath(nextPair.leftImageId),
			right: resolveOriginalImagePath(nextPair.rightImageId),
		};
	}, [nextPair, resolveOriginalImagePath]);

	const submitChoice = useCallback(async(winnerImageId: string | null) => {
		if(!folderPath || !groupId || !nextPair || isSubmittingChoice) {
			return;
		}

		setIsSubmittingChoice(true);
		try {
			const response = await fetch('/api/pairwise', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'compare',
					folderPath,
					groupId,
					minRating,
					leftImageId: nextPair.leftImageId,
					rightImageId: nextPair.rightImageId,
					winnerImageId,
				}),
			});

			if(!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Could not save pairwise comparison');
			}

			const data = await response.json();
			setProgress(data.progress as GroupProgress);
			setNextPair((data.nextPair as NextPair) ?? null);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not save pairwise comparison');
		} finally {
			setIsSubmittingChoice(false);
		}
	}, [folderPath, groupId, minRating, nextPair, isSubmittingChoice]);

	const clampPanForSide = useCallback((
		side: 'left' | 'right',
		zoom: number,
		candidateX: number,
		candidateY: number
	) => {
		if(zoom <= 100) {
			return { x: 0, y: 0 };
		}

		const container = side === 'left' ? leftContainerRef.current : rightContainerRef.current;
		const image = side === 'left' ? leftImageRef.current : rightImageRef.current;
		if(!container || !image) {
			return { x: candidateX, y: candidateY };
		}

		const zoomFactor = zoom / 100;
		const scaledWidth = image.clientWidth * zoomFactor;
		const scaledHeight = image.clientHeight * zoomFactor;
		const maxPanX = Math.max(0, (scaledWidth - container.clientWidth) / 2);
		const maxPanY = Math.max(0, (scaledHeight - container.clientHeight) / 2);

		return {
			x: Math.max(-maxPanX, Math.min(maxPanX, candidateX)),
			y: Math.max(-maxPanY, Math.min(maxPanY, candidateY)),
		};
	}, []);

	const handleImageWheel = useCallback((side: 'left' | 'right', e: WheelEvent<HTMLDivElement>) => {
		e.preventDefault();

		const currentZoom = side === 'left' ? leftZoom : rightZoom;
		if(currentZoom === 100 && e.deltaY > 0) {
			return;
		}

		const zoomStep = 20;
		const nextZoom = Math.max(100, Math.min(maxZoom, currentZoom - (e.deltaY > 0 ? zoomStep : -zoomStep)));
		if(nextZoom === currentZoom) {
			return;
		}

		if(side === 'left') {
			if(nextZoom === 100) {
				setLeftPan({ x: 0, y: 0 });
			}
			setLeftZoom(nextZoom);
			return;
		}

		if(nextZoom === 100) {
			setRightPan({ x: 0, y: 0 });
		}
		setRightZoom(nextZoom);
	}, [leftZoom, rightZoom, maxZoom]);

	const stopPanning = useCallback(() => {
		panDragRef.current.side = null;
		panDragRef.current.moved = false;
		setPanningSide(null);
	}, []);

	const handleImagePointerDown = useCallback((side: 'left' | 'right', e: PointerEvent<HTMLDivElement>) => {
		if(e.button !== 0) {
			return;
		}

		const zoom = side === 'left' ? leftZoom : rightZoom;
		if(zoom <= 100) {
			return;
		}

		e.currentTarget.setPointerCapture(e.pointerId);
		panDragRef.current.side = side;
		panDragRef.current.lastX = e.clientX;
		panDragRef.current.lastY = e.clientY;
		panDragRef.current.moved = false;
		suppressClickRef.current[side] = false;
		setPanningSide(side);
	}, [leftZoom, rightZoom]);

	const handleImagePointerMove = useCallback((side: 'left' | 'right', e: PointerEvent<HTMLDivElement>) => {
		if(panDragRef.current.side !== side) {
			return;
		}

		const deltaX = e.clientX - panDragRef.current.lastX;
		const deltaY = e.clientY - panDragRef.current.lastY;
		if(Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
			panDragRef.current.moved = true;
			suppressClickRef.current[side] = true;
		}
		panDragRef.current.lastX = e.clientX;
		panDragRef.current.lastY = e.clientY;

		if(side === 'left') {
			setLeftPan((prev) => clampPanForSide('left', leftZoom, prev.x + deltaX, prev.y + deltaY));
			return;
		}

		setRightPan((prev) => clampPanForSide('right', rightZoom, prev.x + deltaX, prev.y + deltaY));
	}, [clampPanForSide, leftZoom, rightZoom]);

	const handleImagePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
		if(e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}

		stopPanning();
	}, [stopPanning]);

	const handleImageSelect = useCallback((side: 'left' | 'right') => {
		if(!nextPair || isSubmittingChoice) {
			return;
		}

		if(suppressClickRef.current[side]) {
			suppressClickRef.current[side] = false;
			return;
		}

		void submitChoice(side === 'left' ? nextPair.leftImageId : nextPair.rightImageId);
	}, [nextPair, isSubmittingChoice, submitChoice]);

	useEffect(() => {
		setLeftZoom(100);
		setRightZoom(100);
		setLeftPan({ x: 0, y: 0 });
		setRightPan({ x: 0, y: 0 });
	}, [nextPair?.leftImageId, nextPair?.rightImageId]);

	useEffect(() => {
		setLeftPan((prev) => {
			const bounded = clampPanForSide('left', leftZoom, prev.x, prev.y);
			return bounded.x === prev.x && bounded.y === prev.y ? prev : bounded;
		});
	}, [leftZoom, clampPanForSide]);

	useEffect(() => {
		setRightPan((prev) => {
			const bounded = clampPanForSide('right', rightZoom, prev.x, prev.y);
			return bounded.x === prev.x && bounded.y === prev.y ? prev : bounded;
		});
	}, [rightZoom, clampPanForSide]);

	useEffect(() => {
		const handleWindowPointerUp = () => {
			stopPanning();
		};

		window.addEventListener('pointerup', handleWindowPointerUp);
		return () => {
			window.removeEventListener('pointerup', handleWindowPointerUp);
		};
	}, [stopPanning]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if(!nextPair || isSubmittingChoice) {
				return;
			}

			const activeElement = document.activeElement as HTMLElement | null;
			if(activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
				return;
			}

			if(event.key === 'ArrowLeft') {
				event.preventDefault();
				void submitChoice(nextPair.leftImageId);
				return;
			}

			if(event.key === 'ArrowRight') {
				event.preventDefault();
				void submitChoice(nextPair.rightImageId);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [nextPair, isSubmittingChoice, submitChoice]);

	if(isLoading) {
		return (
			<div className="flex min-h-screen flex-col bg-black font-sans">
				<Header folderName={folderName} title="Pairwise Comparison" isFullscreen={false}>
					<div className="text-zinc-400 text-sm">Loading...</div>
				</Header>
				<main className="flex-1 flex items-center justify-center">
					<div className="flex flex-col items-center gap-4 text-zinc-300">
						<div className="w-12 h-12 border-4 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
						<span>Loading comparison data...</span>
					</div>
				</main>
			</div>
		);
	}

	return (
		<div className="h-screen flex flex-col bg-black font-sans overflow-hidden">
			<Header
				folderName={folderName}
				title={progress?.groupName ? `Compare: ${progress.groupName}` : 'Pairwise Comparison'}
				isFullscreen={false}
			>
				<button
					className="header-button"
					onClick={() => router.push('/pairwise-ranking')}
					title="Back to pairwise overview"
				>
					<Icon name="arrow_back" />
          Pairwise overview
				</button>
			</Header>

			<main className="flex-1 min-h-0 flex flex-col px-5 py-4 gap-4 overflow-hidden">
				{error && (
					<div className="rounded border border-red-800 bg-red-950/40 text-red-200 px-4 py-3 text-sm">
						{error}
					</div>
				)}

				{progress && (
					<section className="rounded border border-blue-900/60 bg-blue-950/20 p-4 space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="text-blue-100 font-semibold">Min rating: <span className="noto-color-emoji-regular">{formatRatingStars(progress.minRating)}</span>+</div>
							<div className="text-blue-200/80 text-sm">{comparisonProgressPercent}% complete ({progress.completedPairs}/{progress.totalPairs})</div>
						</div>
						<div className="w-full h-3 rounded bg-zinc-800 overflow-hidden">
							<div className="h-full bg-blue-500 transition-all" style={{ width: `${comparisonProgressPercent}%` }} />
						</div>
					</section>
				)}

				{!nextPair && progress && (
					<section className="rounded border border-emerald-800 bg-emerald-950/30 text-emerald-200 px-4 py-4 flex flex-wrap items-center justify-between gap-3">
						<span>All combinations are complete for this selection.</span>
						<button className="header-button" onClick={() => router.push('/pairwise-ranking')}>
							<Icon name="leaderboard" />
              Back to results overview
						</button>
					</section>
				)}

				{nextPair && pairData && (
					<section className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-4 overflow-hidden">
						<article className="rounded border border-zinc-800 bg-zinc-950 p-3 min-h-0 grid grid-rows-[auto,1fr] gap-3 overflow-hidden">
							<div className="text-zinc-300 text-sm truncate">{pairData.left.fileName ?? nextPair.leftImageId}</div>
							<div
								ref={leftContainerRef}
								className={`min-h-0 rounded bg-black border border-zinc-800 overflow-hidden flex items-center justify-center ${leftZoom > 100 ? (panningSide === 'left' ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'}`}
								onWheel={(e) => handleImageWheel('left', e)}
								onPointerDown={(e) => handleImagePointerDown('left', e)}
								onPointerMove={(e) => handleImagePointerMove('left', e)}
								onPointerUp={handleImagePointerUp}
								onPointerLeave={handleImagePointerUp}
								onClick={() => handleImageSelect('left')}
								title="Click to choose left image"
							>
								{pairData.left.path ? (
									<img
										ref={leftImageRef}
										src={pairData.left.path}
										alt={pairData.left.fileName ?? nextPair.leftImageId}
										className="max-w-full max-h-full w-auto h-auto object-contain"
										style={{
											transform: `translate(${leftPan.x}px, ${leftPan.y}px) scale(${leftZoom / 100})`,
											transformOrigin: 'center center',
											userSelect: 'none',
										}}
										draggable={false}
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">Image unavailable</div>
								)}
							</div>
						</article>

						<article className="rounded border border-zinc-800 bg-zinc-950 p-3 min-h-0 grid grid-rows-[auto,1fr] gap-3 overflow-hidden">
							<div className="text-zinc-300 text-sm truncate">{pairData.right.fileName ?? nextPair.rightImageId}</div>
							<div
								ref={rightContainerRef}
								className={`min-h-0 rounded bg-black border border-zinc-800 overflow-hidden flex items-center justify-center ${rightZoom > 100 ? (panningSide === 'right' ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'}`}
								onWheel={(e) => handleImageWheel('right', e)}
								onPointerDown={(e) => handleImagePointerDown('right', e)}
								onPointerMove={(e) => handleImagePointerMove('right', e)}
								onPointerUp={handleImagePointerUp}
								onPointerLeave={handleImagePointerUp}
								onClick={() => handleImageSelect('right')}
								title="Click to choose right image"
							>
								{pairData.right.path ? (
									<img
										ref={rightImageRef}
										src={pairData.right.path}
										alt={pairData.right.fileName ?? nextPair.rightImageId}
										className="max-w-full max-h-full w-auto h-auto object-contain"
										style={{
											transform: `translate(${rightPan.x}px, ${rightPan.y}px) scale(${rightZoom / 100})`,
											transformOrigin: 'center center',
											userSelect: 'none',
										}}
										draggable={false}
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">Image unavailable</div>
								)}
							</div>
						</article>
					</section>
				)}

				{nextPair && (
					<section className="flex items-center justify-center gap-3 pb-1">
						<button
							className="header-button"
							onClick={() => void submitChoice(null)}
							disabled={isSubmittingChoice}
						>
							<Icon name="step_over" />
              Skip combination
						</button>
					</section>
				)}
			</main>
		</div>
	);
}

export default function PairwiseComparePage() {
	return (
		<Suspense fallback={<PairwiseComparePageFallback />}>
			<PairwiseComparePageContent />
		</Suspense>
	);
}
