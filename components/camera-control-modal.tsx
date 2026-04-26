'use client';

import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from '@/components/icon';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
	if(!container) {return [];}

	return Array.from(
		container.querySelectorAll<HTMLElement>(
			'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
		)
	).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);
}

interface CameraControlModalProps {
	isOpen: boolean;
	onClose: () => void;
	isShootAssistRunning: boolean;
	isCapturing: boolean;
	captureProgress: { current: number; total: number; percentage: number } | null;
	folderPath: string;
	onStartShootAssist: () => void;
	onStopShootAssist: () => void;
	onStartCapture: (_shots: number, _interval: number) => void;
	onStopCapture: () => void;
}

export function CameraControlModal({
	isOpen,
	onClose,
	isShootAssistRunning,
	isCapturing,
	folderPath,
	onStartShootAssist,
	onStopShootAssist,
	onStartCapture,
	onStopCapture,
}: CameraControlModalProps) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const shotsInputRef = useRef<HTMLInputElement>(null);
	const startShootAssistButtonRef = useRef<HTMLButtonElement>(null);
	const stopCaptureButtonRef = useRef<HTMLButtonElement>(null);

	// Load from localStorage or use defaults
	const [shots, setShots] = useState<number>(() => {
		if(typeof window !== 'undefined') {
			const saved = localStorage.getItem('shootAssist_shots');
			return saved ? parseInt(saved) : 20;
		}
		return 20;
	});

	const [interval, setInterval] = useState<number>(() => {
		if(typeof window !== 'undefined') {
			const saved = localStorage.getItem('shootAssist_interval');
			return saved ? parseInt(saved) : 1000;
		}
		return 1000;
	});

	const [isStartingShootAssist, setIsStartingShootAssist] = useState(false);

	useEffect(() => {
		if(!isOpen) {return;}

		const focusTarget = !isShootAssistRunning
			? startShootAssistButtonRef.current
			: isCapturing
				? stopCaptureButtonRef.current
				: shotsInputRef.current;

		focusTarget?.focus();
	}, [isOpen, isShootAssistRunning, isCapturing]);

	// Reset loading state when ShootAssist is ready
	useEffect(() => {
		if(isShootAssistRunning) {
			setIsStartingShootAssist(false);
		}
	}, [isShootAssistRunning]);

	// Save shots to localStorage when changed
	useEffect(() => {
		if(typeof window !== 'undefined') {
			localStorage.setItem('shootAssist_shots', shots.toString());
		}
	}, [shots]);

	// Save interval to localStorage when changed
	useEffect(() => {
		if(typeof window !== 'undefined') {
			localStorage.setItem('shootAssist_interval', interval.toString());
		}
	}, [interval]);

	if(!isOpen) {return null;}

	const handleStartCapture = () => {
		if(shots > 0 && interval >= 0) {
			onStartCapture(shots, interval);
			onClose();
		}
	};

	const handleStartShootAssist = () => {
		setIsStartingShootAssist(true);
		onStartShootAssist();
	};

	const handleClose = () => {
		onClose();
	};

	const handleStopCaptureAndClose = () => {
		onStopCapture();
		onClose();
	};

	const handleStopCapture = () => {
		onStopCapture();
	};

	const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		if(e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();

			if(isCapturing) {
				handleStopCaptureAndClose();
				return;
			}

			handleClose();
			return;
		}

		if(e.key === 'Tab') {
			const focusableElements = getFocusableElements(dialogRef.current);
			if(focusableElements.length === 0) {return;}

			const activeElement = document.activeElement as HTMLElement | null;
			const currentIndex = activeElement ? focusableElements.indexOf(activeElement) : -1;

			e.preventDefault();
			const direction = e.shiftKey ? -1 : 1;
			const nextIndex = currentIndex === -1
				? 0
				: (currentIndex + direction + focusableElements.length) % focusableElements.length;

			focusableElements[nextIndex]?.focus();
			return;
		}

		if(e.key === 'Enter' && isShootAssistRunning && !isCapturing) {
			e.preventDefault();
			e.stopPropagation();
			handleStartCapture();
		}
	};

	return (
		<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="shoot-assist-modal-title"
				onKeyDown={handleKeyDown}
				className="bg-zinc-900 rounded-lg shadow-2xl max-w-[500px] w-full p-4 border border-zinc-700"
			>
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<h2 id="shoot-assist-modal-title" className="text-zinc-100 font-semibold text-xl">ShootAssist</h2>
					<button
						type="button"
						onClick={handleClose}
						className="text-zinc-400 hover:text-zinc-200 transition"
						title="Close"
					>
						<Icon name="close" />
					</button>
				</div>

				{/* ShootAssist Status */}
				{!isShootAssistRunning ? (
					<div className="mb-6">
						<p className="text-zinc-300 text-sm mb-4">ShootAssist is not running. Start it to control your camera.</p>
						<button
							ref={startShootAssistButtonRef}
							type="button"
							onClick={handleStartShootAssist}
							disabled={isStartingShootAssist}
							className={isStartingShootAssist ? 'w-full px-4 py-3 barber-pole-animate text-white rounded font-medium transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-default disabled:opacity-90' : 'w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-75 text-white rounded font-medium transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-default'}
						>
							<Icon name={isStartingShootAssist ? 'hourglass_empty' : 'play_arrow'} />
							{isStartingShootAssist ? 'Starting ShootAssist…' : 'Start ShootAssist'}
						</button>
					</div>
				) : (
					<div className="space-y-6">
						{/* Status indicator */}
						<div className="flex items-center gap-2 text-sm">
							<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
							<span className="text-zinc-300">ShootAssist Running</span>

							{/* Terminate ShootAssist */}
							<button
								type="button"
								onClick={onStopShootAssist}
								className="text-sm text-zinc-400 hover:text-red-400 transition flex items-center justify-center gap-2 cursor-pointer"
							>
								<Icon name="power_settings_new" size={16} />
								Terminate
							</button>
						</div>

						{/* Capture Configuration */}
						<div className="space-y-4">
							<div>
								<label className="block text-zinc-300 text-sm font-medium mb-2">Number of Photos</label>
								<input
									ref={shotsInputRef}
									type="number"
									min="1"
									max="1000"
									value={shots}
									onChange={(e) => setShots(parseInt(e.target.value) || 1)}
									disabled={isCapturing}
									className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
								/>
							</div>

							<div>
								<label className="block text-zinc-300 text-sm font-medium mb-2">Interval (milliseconds)</label>
								<input
									type="number"
									min="0"
									max="60000"
									value={interval}
									onChange={(e) => setInterval(parseInt(e.target.value) || 0)}
									disabled={isCapturing}
									className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
								/>
							</div>

							<div className="text-xs text-zinc-400">
								<Icon name="folder" size={14} /> Saving to: {folderPath || 'No folder selected'}
							</div>
						</div>

						{/* Action Buttons */}
						<div className="space-y-3">
							<div className="flex gap-3">
								<button
									ref={stopCaptureButtonRef}
									type="button"
									onClick={handleStopCapture}
									className="flex-1 px-4 py-3 bg-blue-600 hover:bg-orange-700 text-white rounded font-medium transition flex items-center justify-center gap-2 cursor-pointer"
								>
									<Icon name="stop_circle" />
									Stop Bulk
								</button>
								<button
									type="button"
									onClick={handleStartCapture}
									className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition flex items-center justify-center gap-2 cursor-pointer"
								>
									<Icon name="burst_mode" />
									Start Bulk Capture
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
