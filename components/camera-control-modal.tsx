'use client';

import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ExifItem } from '@/components/exif-item';
import { Icon } from '@/components/icon';
import { formatAperture } from '@/utils/exif-formatters';

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

type ExposureModeSettings = {
	current?: string;
	available?: string[];
};

type CameraSettings = {
	exposure_mode?: ExposureModeSettings;
	memory_recall_available?: boolean;
	memory_recall_active?: boolean;
	file_format?: string;
	image_quality?: string;
	image_size?: string;
	aspect_ratio?: string;
	focus_mode?: string;
	focus_area?: string;
	subject_recognition_af?: string;
	subject_recognition_target?: string;
	eye_detection_enabled?: boolean;
	eye_selection?: string;
	touch_focus?: string;
	metering_mode?: string;
	exposure_compensation?: string;
	iso?: string;
	shutter_speed?: string;
	aperture?: string;
};

type SettingsApiResponse = {
	success?: boolean;
	error?: string;
	settings?: CameraSettings;
};

type SettingsRow = {
	key: string;
	icon: string;
	label: string;
	values: Array<string | null>;
	warning?: string;
};

function formatSettingValue(value: string | boolean | null | undefined): string {
	if(value === null || value === undefined || value === '') {
		return '-';
	}

	if(typeof value === 'boolean') {
		return value ? 'Yes' : 'No';
	}

	return value;
}

function parseIsoValue(value: string | undefined): number | null {
	if(!value) {
		return null;
	}

	const match = value.match(/\d+/);
	if(!match) {
		return null;
	}

	const parsed = Number.parseInt(match[0], 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function isShutterSlowerThanThreshold(shutterValue: string | undefined, thresholdDenominator: number): boolean | null {
	if(!shutterValue) {
		return null;
	}

	const normalized = shutterValue.trim().toLowerCase();
	if(!normalized) {
		return null;
	}

	if(normalized.includes('bulb')) {
		return true;
	}

	const fractionMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
	if(fractionMatch) {
		const numerator = Number.parseFloat(fractionMatch[1].replace(',', '.'));
		const denominator = Number.parseFloat(fractionMatch[2].replace(',', '.'));

		if(Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
			const shutterSeconds = numerator / denominator;
			return shutterSeconds > 1 / thresholdDenominator;
		}
	}

	const secondsMatch = normalized.match(/(\d+(?:[.,]\d+)?)/);
	if(secondsMatch) {
		const seconds = Number.parseFloat(secondsMatch[1].replace(',', '.'));
		if(Number.isFinite(seconds)) {
			return seconds > 1 / thresholdDenominator;
		}
	}

	return null;
}

function isMaspExposureMode(modeValue: string | undefined): boolean {
	if(!modeValue) {
		return false;
	}

	const normalized = modeValue.trim().toLowerCase();
	if(!normalized) {
		return false;
	}

	if(
		normalized.startsWith('p')
	) {
		return true;
	}

	if(
		normalized.includes('program')
	) {
		return true;
	}

	return false;
}

function getWarnings(settings: CameraSettings | null): Array<{ key: string; message: string }> {
	if(!settings) {
		return [];
	}

	const warnings: Array<{ key: string; message: string }> = [];

	const shutterSlower = isShutterSlowerThanThreshold(settings.shutter_speed, 250);
	if(shutterSlower) {
		warnings.push({
			key: 'shutter_speed',
			message: 'Shutter speed is slower than 1/250.',
		});
	}

	const isoValue = parseIsoValue(settings.iso);
	if(isoValue !== null && isoValue > 1000) {
		warnings.push({
			key: 'iso',
			message: 'ISO is above 1000.',
		});
	}

	const touchFocus = settings.touch_focus?.trim().toLowerCase();
	if( touchFocus?.toLowerCase() !== 'off') {
		warnings.push({
			key: 'touch_focus',
			message: 'Touch focus is not Off.',
		});
	}

	const fileFormat = settings.file_format?.trim().toLowerCase();
	if(fileFormat && !fileFormat.includes('raw')) {
		warnings.push({
			key: 'file_format',
			message: 'File format does not include RAW.',
		});
	}

	if(!isMaspExposureMode(settings.exposure_mode?.current)) {
		warnings.push({
			key: 'exposure_mode',
			message: 'Exposure mode.',
		});
	}

	const aspectRatio = settings.aspect_ratio?.trim();
	if(aspectRatio && aspectRatio !== '3:2') {
		warnings.push({
			key: 'aspect_ratio',
			message: 'Aspect ratio is not 3:2.',
		});
	}
	
	const imageSize = settings.image_size?.trim().toLowerCase();
	if(imageSize && imageSize !== 'large') {
		warnings.push({
			key: 'image_size',
			message: 'Image size is not Large.',
		});
	}

	const imageQuality = settings.image_quality?.trim().toLowerCase();
	if(imageQuality) {
		const isFine = imageQuality.toLowerCase() === 'fine' || imageQuality.toLowerCase() === 'extra fine';
		if(!isFine) {
			warnings.push({
				key: 'image_quality',
				message: 'Image quality is not Fine or Extra Fine.',
			});
		}
	}

	const recognitionWarnings: string[] = [];
	if(settings.eye_detection_enabled === false) {
		recognitionWarnings.push('Eye detection is disabled.');
	}

	const subjectRecognitionTarget = settings.subject_recognition_target?.trim().toLowerCase();
	if(subjectRecognitionTarget && subjectRecognitionTarget !== 'human') {
		recognitionWarnings.push('Recognition target is not Human.');
	}

	if(recognitionWarnings.length > 0) {
		warnings.push({
			key: 'recognition_target_eye_selection',
			message: recognitionWarnings.join(' '),
		});
	}

	return warnings;
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
	const [cameraSettings, setCameraSettings] = useState<CameraSettings | null>(null);
	const [isLoadingSettings, setIsLoadingSettings] = useState(false);
	const [settingsError, setSettingsError] = useState<string | null>(null);
	const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

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

	// Refresh camera settings each time the dialog opens while ShootAssist is running.
	useEffect(() => {
		if(!isOpen) {
			return;
		}

		if(!isShootAssistRunning) {
			setCameraSettings(null);
			setSettingsError(null);
			setIsLoadingSettings(false);
			return;
		}

		const abortController = new AbortController();

		const loadSettings = async() => {
			setIsLoadingSettings(true);
			setSettingsError(null);

			try {
				const response = await fetch('/api/shoot-assist/settings', {
					cache: 'no-store',
					signal: abortController.signal,
				});
				const data = await response.json() as SettingsApiResponse;

				if(!response.ok) {
					throw new Error(data.error || 'Failed to fetch current camera settings');
				}

				setCameraSettings(data.settings || null);
			} catch (error) {
				if(abortController.signal.aborted) {
					return;
				}

				setCameraSettings(null);
				setSettingsError(error instanceof Error ? error.message : 'Failed to fetch current camera settings');
			} finally {
				if(!abortController.signal.aborted) {
					setIsLoadingSettings(false);
				}
			}
		};

		void loadSettings();

		return () => {
			abortController.abort();
		};
	}, [isOpen, isShootAssistRunning]);

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

	const warningList = getWarnings(cameraSettings);
	const warningMap = new Map(warningList.map((w) => [w.key, w.message]));

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

	const primarySettingsRows: SettingsRow[] = cameraSettings ? [
		{
			key: 'exposure_mode',
			icon: 'exposure',
			label: 'Exposure Mode',
			values: [
				formatSettingValue(cameraSettings.exposure_mode?.current),
			],
			warning: warningMap.get('exposure_mode'),
		},
		{
			key: 'focus_mode',
			icon: 'center_focus_strong',
			label: 'Focus Mode',
			values: [formatSettingValue(cameraSettings.focus_mode)],
		},
		{
			key: 'subject_recognition_af',
			icon: 'smart_toy',
			label: 'Subject Recognition AF',
			values: [formatSettingValue(cameraSettings.subject_recognition_af)],
		},
		{
			key: 'iso',
			icon: 'iso',
			label: 'ISO',
			values: [formatSettingValue(cameraSettings.iso)],
			warning: warningMap.get('iso'),
		},
		{
			key: 'shutter_speed',
			icon: 'timer',
			label: 'Shutter Speed',
			values: [formatSettingValue(cameraSettings.shutter_speed)],
			warning: warningMap.get('shutter_speed'),
		},
		{
			key: 'aperture',
			icon: 'camera',
			label: 'Aperture',
			values: [formatAperture(cameraSettings.aperture)],
		},
	] : [];

	const advancedSettingsRows: SettingsRow[] = cameraSettings ? [
		{
			key: 'memory_recall',
			icon: 'memory',
			label: 'Memory Recall',
			values: [
				`Available: ${formatSettingValue(cameraSettings.memory_recall_available)}`,
				`Active: ${formatSettingValue(cameraSettings.memory_recall_active)}`,
			],
		},
		{
			key: 'file_format',
			icon: 'perm_media',
			label: 'File Format',
			values: [formatSettingValue(cameraSettings.file_format)],
			warning: warningMap.get('file_format'),
		},
		{
			key: 'image_quality',
			icon: 'high_quality',
			label: 'Image Quality',
			values: [formatSettingValue(cameraSettings.image_quality)],
			warning: warningMap.get('image_quality'),
		},
		{
			key: 'image_size',
			icon: 'crop_original',
			label: 'Image Size',
			values: [formatSettingValue(cameraSettings.image_size)],
		},
		{
			key: 'aspect_ratio',
			icon: 'aspect_ratio',
			label: 'Aspect Ratio',
			values: [formatSettingValue(cameraSettings.aspect_ratio)],
			warning: warningMap.get('aspect_ratio'),
		},
		{
			key: 'focus_area',
			icon: 'grid_4x4',
			label: 'Focus Area',
			values: [formatSettingValue(cameraSettings.focus_area)],
		},
		{
			key: 'touch_focus',
			icon: 'touch_app',
			label: 'Touch Focus',
			values: [formatSettingValue(cameraSettings.touch_focus)],
			warning: warningMap.get('touch_focus'),
		},
		{
			key: 'recognition_target_eye_selection',
			icon: 'visibility',
			label: 'Recognition target/Eye selection',
			values: [
				`${formatSettingValue(cameraSettings.subject_recognition_target)} / ${formatSettingValue(cameraSettings.eye_selection)}`,
			],
			warning: warningMap.get('recognition_target_eye_selection'),
		},
		{
			key: 'metering_mode',
			icon: 'light_mode',
			label: 'Metering Mode',
			values: [formatSettingValue(cameraSettings.metering_mode)],
		},
		{
			key: 'exposure_compensation',
			icon: 'exposure_plus_1',
			label: 'Exposure Compensation',
			values: [formatSettingValue(cameraSettings.exposure_compensation)],
		},
	] : [];

	return (
		<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="shoot-assist-modal-title"
				onKeyDown={handleKeyDown}
				className="bg-zinc-900 rounded-lg shadow-2xl max-w-[980px] w-full p-4 border border-zinc-700"
			>
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<h2 id="shoot-assist-modal-title" className="text-zinc-100 font-semibold text-xl">ShootAssist</h2>
					<button
						type="button"
						onClick={handleClose}
						className="text-zinc-400 hover:text-zinc-200 transition"
						title="Close"
						aria-label="Close"
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
					<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] gap-6">
						<div className="bg-zinc-800/50 rounded p-4 max-h-[70vh] overflow-y-auto">
							<div className="flex items-center justify-between mb-3">
								<h3 className="text-zinc-100 font-medium text-sm uppercase tracking-wide">Current Camera Settings</h3>
								{isLoadingSettings ? <span className="text-xs text-zinc-400">Refreshing…</span> : null}
							</div>

							{settingsError ? (
								<div className="text-sm text-red-300 bg-red-950/30 border border-red-900/50 rounded p-3">
									{settingsError}
								</div>
							) : isLoadingSettings && primarySettingsRows.length === 0 ? (
								<div className="text-sm text-zinc-400">Loading camera settings…</div>
							) : primarySettingsRows.length > 0 ? (
								<div className="space-y-2">
									{warningList.length > 0 ? (
										<div className="rounded border border-yellow-700/60 bg-yellow-950/30 p-3">
											<div className="flex items-center gap-2 text-yellow-200 text-sm font-semibold mb-2">
												<Icon name="warning" size={16} />
												Warnings ({warningList.length})
											</div>
											<div className="space-y-1">
												{warningList.map((warning) => (
													<div key={warning.key} className="text-xs text-yellow-100">{warning.message}</div>
												))}
											</div>
										</div>
									) : null}

									{primarySettingsRows.map((row) => (
										<ExifItem
											key={row.key}
											icon={row.icon}
											label={row.label}
											values={row.warning ? [...row.values, `Warning: ${row.warning}`] : row.values}
										/>
									))}

									<button
										type="button"
										onClick={() => setShowAdvancedSettings((prev) => !prev)}
										className="w-full text-left px-3 py-2 rounded bg-zinc-900/70 border border-zinc-700 hover:border-zinc-500 text-zinc-200 text-sm flex items-center justify-between"
									>
										<span>More settings</span>
										<Icon name={showAdvancedSettings ? 'expand_less' : 'expand_more'} size={18} />
									</button>

									{showAdvancedSettings ? (
										<div className="space-y-2">
											{advancedSettingsRows.map((row) => (
												<ExifItem
													key={row.key}
													icon={row.icon}
													label={row.label}
													values={row.warning ? [...row.values, `Warning: ${row.warning}`] : row.values}
												/>
											))}
										</div>
									) : null}
								</div>
							) : (
								<div className="text-sm text-zinc-400">No camera settings available.</div>
							)}
						</div>

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
					</div>
				)}
			</div>
		</div>
	);
}
