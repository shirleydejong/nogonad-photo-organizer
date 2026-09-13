'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { Icon } from '@/components/icon';

export type PreviewImageItem = {
	fileName: string;
	originalPath: string;
};

type ContextMenuState = {
	x: number;
	y: number;
	index: number;
};

type PanPosition = {
	x: number;
	y: number;
};

const MAX_PREVIEW_ZOOM = 400;
const MENU_WIDTH = 220;
const MENU_HEIGHT = 104;

async function openPreviewInExternalApp(filePath: string): Promise<void> {
	const response = await fetch('/api/open-with', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ filePath }),
	});

	if(!response.ok) {
		const responseBody = await response.json().catch(() => null);
		throw new Error(responseBody?.error || response.statusText || 'Could not open external preview');
	}
}

export function useImagePreviewContext(items: PreviewImageItem[], folderPath: string) {
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const [previewIndex, setPreviewIndex] = useState<number | null>(null);
	const [previewZoom, setPreviewZoom] = useState<number>(100);
	const [previewPan, setPreviewPan] = useState<PanPosition>({ x: 0, y: 0 });
	const [isPreviewPanning, setIsPreviewPanning] = useState<boolean>(false);

	const contextMenuRef = useRef<HTMLDivElement>(null);
	const previewViewportRef = useRef<HTMLDivElement>(null);
	const previewImageRef = useRef<HTMLImageElement>(null);
	const previewPanDragRef = useRef<{ lastX: number; lastY: number }>({ lastX: 0, lastY: 0 });

	const clampPreviewPan = useCallback((zoom: number, candidateX: number, candidateY: number): PanPosition => {
		const viewport = previewViewportRef.current;
		const image = previewImageRef.current;

		if(!viewport || !image || zoom <= 100) {
			return { x: 0, y: 0 };
		}

		const scaledWidth = image.clientWidth * (zoom / 100);
		const scaledHeight = image.clientHeight * (zoom / 100);
		const maxPanX = Math.max(0, (scaledWidth - viewport.clientWidth) / 2);
		const maxPanY = Math.max(0, (scaledHeight - viewport.clientHeight) / 2);

		return {
			x: Math.max(-maxPanX, Math.min(maxPanX, candidateX)),
			y: Math.max(-maxPanY, Math.min(maxPanY, candidateY)),
		};
	}, []);

	const closeContextMenu = useCallback(() => {
		setContextMenu(null);
	}, []);

	const closePreview = useCallback(() => {
		setPreviewIndex(null);
		setPreviewZoom(100);
		setPreviewPan({ x: 0, y: 0 });
		setIsPreviewPanning(false);
	}, []);

	const openPreview = useCallback((index: number) => {
		setContextMenu(null);
		setPreviewIndex(index);
		setPreviewZoom(100);
		setPreviewPan({ x: 0, y: 0 });
		setIsPreviewPanning(false);
	}, []);

	const openContextMenu = useCallback((index: number, event: ReactMouseEvent<HTMLElement>) => {
		event.preventDefault();
		event.stopPropagation();

		const nextX = Math.max(12, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 12));
		const nextY = Math.max(12, Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 12));

		setContextMenu({ x: nextX, y: nextY, index });
	}, []);

	const handlePreviewExternal = useCallback(async(index: number) => {
		const image = items[index];
		if(!image || !folderPath) {
			return;
		}

		setContextMenu(null);

		try {
			await openPreviewInExternalApp(`${folderPath}\\${image.fileName}`);
		} catch (err) {
			console.error('Failed to open preview externally:', err);
		}
	}, [folderPath, items]);

	const handlePreviewWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
		event.preventDefault();

		setPreviewZoom((currentZoom) => {
			if(currentZoom === 100 && event.deltaY > 0) {
				return currentZoom;
			}

			const zoomStep = 20;
			const nextZoom = Math.max(100, Math.min(MAX_PREVIEW_ZOOM, currentZoom - (event.deltaY > 0 ? zoomStep : -zoomStep)));

			if(nextZoom === 100) {
				setPreviewPan({ x: 0, y: 0 });
			}

			if(nextZoom !== currentZoom && nextZoom > 100) {
				setPreviewPan((currentPan) => clampPreviewPan(nextZoom, currentPan.x, currentPan.y));
			}

			return nextZoom;
		});
	}, [clampPreviewPan]);

	const handlePreviewPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if(event.button !== 0 || previewZoom <= 100) {
			return;
		}

		event.currentTarget?.setPointerCapture?.(event.pointerId);
		previewPanDragRef.current = { lastX: event.clientX, lastY: event.clientY };
		setIsPreviewPanning(true);
	}, [previewZoom]);

	const handlePreviewPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if(!isPreviewPanning || previewZoom <= 100) {
			return;
		}

		const deltaX = event.clientX - previewPanDragRef.current.lastX;
		const deltaY = event.clientY - previewPanDragRef.current.lastY;
		previewPanDragRef.current = { lastX: event.clientX, lastY: event.clientY };

		setPreviewPan((currentPan) => clampPreviewPan(previewZoom, currentPan.x + deltaX, currentPan.y + deltaY));
	}, [clampPreviewPan, isPreviewPanning, previewZoom]);

	const handlePreviewPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if(event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}

		setIsPreviewPanning(false);
	}, []);

	useEffect(() => {
		if(!contextMenu) {
			return;
		}

		const handlePointerDown = (event: globalThis.MouseEvent) => {
			if(contextMenuRef.current?.contains(event.target as Node)) {
				return;
			}

			setContextMenu(null);
		};

		document.addEventListener('mousedown', handlePointerDown);
		return () => document.removeEventListener('mousedown', handlePointerDown);
	}, [contextMenu]);

	useEffect(() => {
		if(previewIndex === null || previewZoom <= 100) {
			return;
		}

		setPreviewPan((currentPan) => clampPreviewPan(previewZoom, currentPan.x, currentPan.y));
	}, [clampPreviewPan, previewIndex, previewZoom]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if(event.key !== 'Escape') {
				return;
			}

			if(contextMenu) {
				event.preventDefault();
				setContextMenu(null);
				return;
			}

			if(previewIndex !== null) {
				event.preventDefault();
				closePreview();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [closePreview, contextMenu, previewIndex]);

	useEffect(() => {
		if(previewIndex === null) {
			return;
		}

		if(previewIndex >= items.length) {
			closePreview();
		}
	}, [closePreview, items.length, previewIndex]);

	return {
		contextMenu,
		previewIndex,
		previewZoom,
		previewPan,
		isPreviewPanning,
		isOverlayOpen: contextMenu !== null || previewIndex !== null,
		contextMenuRef,
		previewViewportRef,
		previewImageRef,
		closeContextMenu,
		closePreview,
		openContextMenu,
		openPreview,
		handlePreviewExternal,
		handlePreviewWheel,
		handlePreviewPointerDown,
		handlePreviewPointerMove,
		handlePreviewPointerUp,
	};
}

export type ImagePreviewContextController = ReturnType<typeof useImagePreviewContext>;

interface ImagePreviewContextLayerProps {
	items: PreviewImageItem[];
	controller: ImagePreviewContextController;
}

export function ImagePreviewContextLayer({ items, controller }: ImagePreviewContextLayerProps) {
	const contextMenuImage = controller.contextMenu ? items[controller.contextMenu.index] : null;
	const previewImage = controller.previewIndex !== null ? items[controller.previewIndex] : null;

	return (
		<>
			{controller.contextMenu && contextMenuImage && (
				<div
					ref={controller.contextMenuRef}
					className="fixed z-[70] min-w-[220px] rounded-xl border border-zinc-700 bg-zinc-950/96 p-2 shadow-2xl backdrop-blur"
					style={{ left: controller.contextMenu.x, top: controller.contextMenu.y }}
					role="menu"
				>
					<div className="px-3 py-2 text-xs text-zinc-500 truncate">
						{contextMenuImage.fileName}
					</div>
					<button
						type="button"
						className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-100 transition hover:bg-zinc-800"
						onClick={() => controller.openPreview(controller.contextMenu!.index)}
						role="menuitem"
					>
						<Icon name="preview" size={18} />
						<span>preview in app</span>
					</button>
					<button
						type="button"
						className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-100 transition hover:bg-zinc-800"
						onClick={() => {
							void controller.handlePreviewExternal(controller.contextMenu!.index);
						}}
						role="menuitem"
					>
						<Icon name="open_in_new" size={18} />
						<span>preview external app</span>
					</button>
				</div>
			)}

			{controller.previewIndex !== null && previewImage && (
				<div className="fixed inset-0 z-[80] bg-black/95" onClick={controller.closePreview}>
					<div className="absolute inset-0 flex flex-col">
						<div className="flex items-center justify-between gap-4 px-4 py-3">
							<div className="min-w-0">
								<div className="truncate text-sm text-zinc-300">{previewImage.fileName}</div>
								<div className="text-xs text-zinc-500">Scroll to zoom, drag to pan</div>
							</div>
							<div className="flex items-center gap-3">
								<div className="text-xs text-zinc-400">{Math.round(controller.previewZoom)}%</div>
								<button
									type="button"
									className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 transition hover:bg-zinc-800"
									onClick={(event) => {
										event.stopPropagation();
										controller.closePreview();
									}}
								>
									<Icon name="close" size={18} />
									<span>Close</span>
								</button>
							</div>
						</div>
						<div
							ref={controller.previewViewportRef}
							className={`flex-1 overflow-hidden px-4 pb-4 ${controller.previewZoom > 100 ? (controller.isPreviewPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
							onClick={(event) => event.stopPropagation()}
							onWheel={controller.handlePreviewWheel}
							onPointerDown={controller.handlePreviewPointerDown}
							onPointerMove={controller.handlePreviewPointerMove}
							onPointerUp={controller.handlePreviewPointerUp}
							onPointerCancel={controller.handlePreviewPointerUp}
							onPointerLeave={controller.handlePreviewPointerUp}
						>
							<div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-black">
								<img
									ref={controller.previewImageRef}
									src={previewImage.originalPath}
									alt={previewImage.fileName}
									className="main-image max-h-full max-w-full object-contain select-none"
									style={{
										transform: `translate(${controller.previewPan.x}px, ${controller.previewPan.y}px) scale(${controller.previewZoom / 100})`,
										transformOrigin: 'center center',
										transition: controller.isPreviewPanning ? 'none' : 'transform 0.1s ease-out',
										touchAction: 'none',
									}}
									draggable={false}
								/>
							</div>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
