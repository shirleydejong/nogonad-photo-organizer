"use client";

import { useState, useEffect, useRef, type PointerEvent, type WheelEvent } from "react";
import { useRouter } from "next/navigation";
import CONFIG from "@/config";
import {
  formatAperture,
  formatExposureTime,
  formatISO,
  formatFocalLength,
  formatCropFactor,
  formatMegapixels,
  formatDPI,
  formatDate,
  formatFlash,
  formatWhiteBalance,
  formatExposure,
  formatFileSize,
  formatColor,
  isHDR,
} from "@/utils/exif-formatters";

interface ImageData {
  originalFile: File;
  fileName: string;
  thumbnailPath: string;
  originalPath: string;
}

export default function Home() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<ImageData[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [folderPath, setFolderPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExifOpen, setIsExifOpen] = useState<boolean>(false);
  const [exifData, setExifData] = useState<Record<string, any> | null>(null);
  const [exifError, setExifError] = useState<string | null>(null);
  const [isExifLoading, setIsExifLoading] = useState<boolean>(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [isSwipingActive, setIsSwipingActive] = useState<boolean>(false);
  const [isMainImageDragging, setIsMainImageDragging] = useState<boolean>(false);
  const [isFilmstripDragging, setIsFilmstripDragging] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const isFilmstripDraggingRef = useRef(false);
  const filmstripDragStartXRef = useRef(0);
  const filmstripStartScrollLeftRef = useRef(0);
  const isMainImageSwipingRef = useRef(false);
  const mainImageStartXRef = useRef(0);
  const mainImageStartYRef = useRef(0);
  const mainImageSwipeTriggeredRef = useRef(false);
  const swipeButtonTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchPinchRef = useRef({ distance: 0, startZoom: 100 });
  const panStartXRef = useRef(0);
  const panStartYRef = useRef(0);
  const maxZoom = 400;
  const pinchFactor = 1.5;

  const MAIN_IMAGE_SWIPE_THRESHOLD = 60;

  // Load folder from localStorage on mount
  useEffect(() => {
    const activeFolder = localStorage.getItem('activeFolder');
    if (activeFolder) {
      loadFolder(activeFolder);
      
    } else {
      router.push('/select-folder');
    }
  }, [router]);

  // Load folder and images
  async function loadFolder(path: string) {
    setIsLoading(true);
    setError(null);
    
    try {
      const normalizedPath = path.replace(/\//g, '\\');
      const normalizedThumbPath = `${normalizedPath}\\${CONFIG.NPO_FOLDER}\\${CONFIG.THUMBNAILS_FOLDER}`;
      setFolderPath(normalizedPath);
      
      // Save to localStorage as activeFolder
      localStorage.setItem('activeFolder', normalizedPath);
      
      // Get the folder name from the path
      const parts = normalizedPath.split('\\');
      const lastPart = parts[parts.length - 1];
      setFolderName(lastPart || normalizedPath);

      // Get list of files (thumbnails should already exist)
      const startResponse = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: normalizedPath, action: 'start' }),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || 'Could not load images');
      }

      const startData = await startResponse.json();

      // If no images found
      if (startData.total === 0) {
        setError("No images found in this folder");
        setIsLoading(false);
        return;
      }

      const files = startData.files as string[];
      
      // Create ImageData objects
      const imageData: ImageData[] = files.map((fileName) => {
        const encodedThumbPath = encodeURIComponent(getThumbnailFilename(fileName));
        const encodedPath = encodeURIComponent(fileName);
        return {
          originalFile: null as any,
          fileName: fileName,
          thumbnailPath: `/api/image/${encodedThumbPath}?folderPath=${encodeURIComponent(normalizedThumbPath)}&fileName=${encodedThumbPath}`,
          originalPath: `/api/image/${encodedPath}?folderPath=${encodeURIComponent(normalizedPath)}&fileName=${encodedPath}`,
        };
      });

      setImageFiles(imageData);
      setIsLoading(false);

    } catch (e: any) {
      console.error('Error:', e);
      setError(e.message || "Could not load folder.");
      setIsLoading(false);
    }
  }

  function getThumbnailFilename(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return filename + '-thumb';
    return filename.substring(0, lastDot) + '-thumb' + filename.substring(lastDot);
  }

  function handleFilmstripWheel(e: WheelEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return;

    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (delta === 0) return;

    const step = Math.round(window.innerWidth * 0.6);
    const direction = delta > 0 ? 1 : -1;

    el.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  function handleFilmstripPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const el = e.currentTarget;
    isFilmstripDraggingRef.current = true;
    setIsFilmstripDragging(true);
    filmstripDragStartXRef.current = e.clientX;
    filmstripStartScrollLeftRef.current = el.scrollLeft;
  }

  function handleFilmstripPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!isFilmstripDraggingRef.current) return;

    const el = e.currentTarget;
    const deltaX = e.clientX - filmstripDragStartXRef.current;
    el.scrollLeft = filmstripStartScrollLeftRef.current - (deltaX * 4);
  }

  function handleFilmstripPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!isFilmstripDraggingRef.current) return;

    isFilmstripDraggingRef.current = false;
    setIsFilmstripDragging(false);
  }

  function handleMainImagePointerDown(e: PointerEvent<HTMLImageElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    // Cancel any pending timeout from previous swipe
    if (swipeButtonTimeoutRef.current) {
      clearTimeout(swipeButtonTimeoutRef.current);
      swipeButtonTimeoutRef.current = null;
    }

    isMainImageSwipingRef.current = true;
    mainImageStartXRef.current = e.clientX;
    mainImageStartYRef.current = e.clientY;
    mainImageSwipeTriggeredRef.current = false;
    setIsSwipingActive(true);
    setIsMainImageDragging(true);
  }

  function handleMainImagePointerMove(e: PointerEvent<HTMLImageElement>) {
    if (!isMainImageSwipingRef.current || mainImageSwipeTriggeredRef.current || imageFiles.length === 0) return;

    // Don't trigger navigation swipe when zoomed in
    if (zoomLevel > 100) return;

    const deltaX = e.clientX - mainImageStartXRef.current;
    const deltaY = e.clientY - mainImageStartYRef.current;

    if (Math.abs(deltaX) < MAIN_IMAGE_SWIPE_THRESHOLD) return;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

    if (deltaX < 0) {
      // Swipe left = next image, image goes left
      if (activeIndex < imageFiles.length - 1) {
        setSwipeDirection('left');
        setActiveIndex((i) => i + 1);
      }
    } else {
      // Swipe right = previous image, image goes right
      if (activeIndex > 0) {
        setSwipeDirection('right');
        setActiveIndex((i) => i - 1);
      }
    }

    mainImageSwipeTriggeredRef.current = true;
    isMainImageSwipingRef.current = false;
  }

  function handleMainImagePointerUp() {
    isMainImageSwipingRef.current = false;
    mainImageSwipeTriggeredRef.current = false;
    setIsMainImageDragging(false);
    
    // Show buttons after 2 seconds
    if (swipeButtonTimeoutRef.current) {
      clearTimeout(swipeButtonTimeoutRef.current);
    }
    swipeButtonTimeoutRef.current = setTimeout(() => {
      setIsSwipingActive(false);
      swipeButtonTimeoutRef.current = null;
    }, 2000);
  }

  function handleImageWheel(e: WheelEvent<HTMLImageElement>) {
    if (zoomLevel === 100 && e.deltaY > 0) return; // Don't zoom out below 100%
    
    //e.preventDefault();
    
    const zoomStep = 20;
    const newZoom = Math.max(100, Math.min(maxZoom, zoomLevel - (e.deltaY > 0 ? zoomStep : -zoomStep)));
    
    if (newZoom === zoomLevel) return;
    
    // Reset pan when zooming back to 100%
    if (newZoom === 100) {
      setZoomLevel(100);
      setPanX(0);
      setPanY(0);
    } else {
      setZoomLevel(newZoom);
    }
  }

  function getDistance(p1: React.Touch, p2: React.Touch): number {
    const dx = p1.clientX - p2.clientX;
    const dy = p1.clientY - p2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleImageTouchStart(e: React.TouchEvent<HTMLImageElement>) {
    if (e.touches.length === 2) {
      // Two-finger pinch
      touchPinchRef.current.distance = getDistance(e.touches[0], e.touches[1]);
      touchPinchRef.current.startZoom = zoomLevel;
    } else if (zoomLevel > 100) {
      // Single finger pan when zoomed in
      panStartXRef.current = e.touches[0].clientX;
      panStartYRef.current = e.touches[0].clientY;
    }
  }

  function handleImageTouchMove(e: React.TouchEvent<HTMLImageElement>) {
    if (e.touches.length === 2) {
      // Two-finger pinch zoom
      const newDistance = getDistance(e.touches[0], e.touches[1]);
      const delta = newDistance - touchPinchRef.current.distance;
      const zoomChange = (delta / 100) * 10;
      const newZoom = Math.max(100, Math.min(maxZoom, touchPinchRef.current.startZoom + zoomChange));
      
      if (newZoom === 100) {
        setPanX(0);
        setPanY(0);
      }
      setZoomLevel(newZoom);
      
    } else if (e.touches.length === 1 && zoomLevel > 100) {
      pan(e);
    }
  }

  function handleImageMouseDown(e: React.MouseEvent<HTMLImageElement>) {
    if (zoomLevel > 100 && e.button === 0) {
      // Left mouse button + zoomed in = pan mode
      panStartXRef.current = e.clientX;
      panStartYRef.current = e.clientY;
      isMainImageSwipingRef.current = false;
    }
  }

  function handleImageMouseMove(e: React.MouseEvent<HTMLImageElement>) {
    if (zoomLevel > 100 && (e.buttons & 1) && isMainImageSwipingRef.current === false) {
      pan(e);
    }
  }
  
  function pan(e: React.MouseEvent<HTMLImageElement> | React.TouchEvent<HTMLImageElement>) {
    const z = 'touches' in e ? e.touches[0] : e;

    const deltaX = (z.clientX - panStartXRef.current) * pinchFactor;
    const deltaY = (z.clientY - panStartYRef.current) * pinchFactor;
    const zoomFactor = zoomLevel / 100;

    const container = document.querySelector('.main-image-container');

    const maxPanX = ((e.currentTarget.clientWidth * zoomFactor - container!.clientWidth) / 2) / zoomFactor;
    const maxPanY = ((e.currentTarget.clientHeight * zoomFactor - container!.clientHeight) / 2) / zoomFactor;

    const newPanX = e.currentTarget.clientWidth * zoomFactor < container!.clientWidth ? 0 : Math.max(-maxPanX, Math.min(maxPanX, panX + deltaX / zoomFactor));
    const newPanY = e.currentTarget.clientHeight * zoomFactor < container!.clientHeight ? 0 : Math.max(-maxPanY, Math.min(maxPanY, panY + deltaY / zoomFactor));

    setPanX(newPanX);
    setPanY(newPanY);

    panStartXRef.current = z.clientX;
    panStartYRef.current = z.clientY;
  }

  // Reset swipe animation after it completes
  useEffect(() => {
    if (swipeDirection !== null) {
      const timer = setTimeout(() => {
        setSwipeDirection(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [swipeDirection]);

  // Load last active index for this folder from localStorage
  useEffect(() => {
    const lsActiveIndex = localStorage.getItem('activeIndices');
    if (lsActiveIndex) {
      try {
        const activeIndices = JSON.parse(lsActiveIndex);
        if (folderPath in activeIndices) {
          const index = !isNaN(Number(activeIndices[folderPath])) ? Number(activeIndices[folderPath]) : 0;
          setActiveIndex(index);
        }
      } catch (e) {
        console.error('Failed to load last index:', e);
      }
    }
  }, [folderPath]);

  // Persist activeIndex per folderPath to localStorage
  useEffect(() => {
    if (!folderPath) return;
    try {
      const stored = localStorage.getItem('activeIndices');
      const activeIndices = stored ? JSON.parse(stored) : {};
      activeIndices[folderPath] = activeIndex;
      localStorage.setItem('activeIndices', JSON.stringify(activeIndices));
    } catch (e) {
      console.error('Failed to save active index:', e);
    }
  }, [activeIndex, folderPath]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (imageFiles.length === 0 || zoomLevel > 100) return;
      if (e.key === "ArrowLeft") {
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "ArrowRight") {
        setActiveIndex((prev) => (prev < imageFiles.length - 1 ? prev + 1 : prev));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imageFiles.length, zoomLevel]);
  
  // Reset zoom and pan when changing photos
  useEffect(() => {
    setZoomLevel(100);
    setPanX(0);
    setPanY(0);
  }, [activeIndex]);
  
  // Fetch EXIF data when active image changes
  useEffect(() => {
    if (imageFiles.length === 0 || !folderPath) {
      setExifData(null);
      setExifError(null);
      setIsExifLoading(false);
      return;
    }

    const currentImage = imageFiles[activeIndex];
    if (!currentImage) return;

    let canceled = false;
    setIsExifLoading(true);
    setExifError(null);
    setExifData(null);

    async function fetchExifData() {
      try {
        const response = await fetch('/api/exif', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folderPath,
            fileName: currentImage.fileName,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          if (!canceled) {
            setExifError(error?.error || 'No EXIF data found');
          }
          return;
        }
        const data = await response.json();
        
        if (!canceled) {
          setExifData(data?.exifData ?? null);
        }
      } catch (err) {
        if (!canceled) {
          setExifError(err instanceof Error ? err.message : 'Could not retrieve EXIF data');
        }
      } finally {
        if (!canceled) {
          setIsExifLoading(false);
        }
      }
    }

    fetchExifData();
    return () => {
      canceled = true;
    };
  }, [activeIndex, imageFiles, folderPath]);



  function Icon({ name }: { name: string }) {
    return (
      <span className="material-symbols-rounded text-zinc-300 text-2xl" style={{ fontSize: '24px' }}>
        {name}
      </span>
    );
  }

  function ExifItem({
    icon,
    label,
    values,
  }: {
    icon: string;
    label: string;
    values: Array<string | null>;
  }) {
    const clean = values.filter(Boolean) as string[];
    if (clean.length === 0) return null;
    return (
      <div className="flex gap-3 border-b border-white/5 pb-2">
        <div className="w-14 min-w-14 flex items-center justify-center">
          <Icon name={icon} />
        </div>
        <div className="flex-1">
          <div className="text-zinc-300 text-xs font-medium">{label}</div>
          <div className="text-zinc-100 text-sm flex flex-wrap gap-x-6 mt-1">
            {clean.map((v, i) => (
              <span key={i} className="truncate">{v}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black font-sans">
      <main className="flex-1 flex flex-col items-center justify-center w-full">
        {isLoading ? (
          // Loading state
          <div className="flex flex-col items-center gap-6 p-8">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <div className="text-zinc-400 text-sm">Loading images...</div>
          </div>
        ) : error ? (
          // Error state
          <div className="flex flex-col items-center gap-6 p-8">
            <div className="text-red-500 text-lg">{error}</div>
            <button
              className="px-6 py-3 bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700 transition flex gap-2 items-center"
              onClick={() => router.push('/select-folder')}
            >
              <Icon name="arrow_back" /> Choose another folder
            </button>
          </div>
        ) : imageFiles.length > 0 ? (
          <div className="flex flex-col w-full h-screen">
            <div className="w-full flex items-center justify-between px-8 py-3 border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <button
                  className="px-4 py-2 bg-zinc-800 rounded text-zinc-200 hover:bg-zinc-700 transition flex gap-2 items-center"
                  onClick={() => router.push('/select-folder')}
                >
                   <Icon name="arrow_back" /> Choose another folder
                </button>
                {folderName && <span className="text-zinc-500 text-sm truncate max-w-[12rem]">{folderName}</span>}
              </div>
              <div className="flex items-center gap-3">
                <button
                  className={`px-4 py-2 rounded text-sm font-medium transition ${isExifOpen ? "bg-zinc-200 text-black" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}`}
                  onClick={() => setIsExifOpen((open) => !open)}
                >
                  {isExifOpen ? "Close EXIF" : "Show EXIF"}
                </button>
                <div className="text-zinc-400 text-sm">{imageFiles.length} images</div>
              </div>
            </div>

            <div className="flex flex-1 w-full overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 flex items-center justify-center overflow-hidden relative">
                  
                  <button
                    className={`photo-nav-button left-4 ${
                      isSwipingActive ? 'opacity-0' : ''
                    }`}
                    disabled={activeIndex === 0}
                    onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                  >
                    <Icon name="chevron_backward" />
                  </button>
                  
                  <button
                    className={`photo-nav-button right-4 ${
                      isSwipingActive ? 'opacity-0' : ''
                    }`}
                    disabled={activeIndex === imageFiles.length - 1}
                    onClick={() => setActiveIndex((i) => Math.min(imageFiles.length - 1, i + 1))}
                  >
                    <Icon name="chevron_forward" />
                  </button>
                  
                  <div className="main-image-container flex w-full h-full items-center justify-center gap-4 px-4">
                    
                    <div className="flex-1 flex items-center justify-center h-full">
                      {imageFiles[activeIndex] && (
                        <img
                          key={activeIndex}
                          src={imageFiles[activeIndex].originalPath}
                          alt={imageFiles[activeIndex].fileName}
                          className={`main-image max-w-full max-h-full object-contain select-none ${
                            swipeDirection === 'left'
                              ? 'animate-[swipeOutLeft_0.2s_ease-out]'
                              : swipeDirection === 'right'
                              ? 'animate-[swipeOutRight_0.2s_ease-out]'
                              : ''
                          } ${isMainImageDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                          style={{
                            transform: `scale(${zoomLevel / 100}) translate(${panX}px, ${panY}px)`,
                            transition: isMainImageDragging ? 'none' : 'transform 0.1s ease-out',
                          }}
                          draggable={false}
                          onPointerDown={handleMainImagePointerDown}
                          onPointerMove={handleMainImagePointerMove}
                          onPointerUp={handleMainImagePointerUp}
                          onPointerCancel={handleMainImagePointerUp}
                          onWheel={handleImageWheel}
                          onTouchStart={handleImageTouchStart}
                          onTouchMove={handleImageTouchMove}
                          onMouseDown={handleImageMouseDown}
                          onMouseMove={handleImageMouseMove}
                        />
                      )}
                    </div>
                    
                  </div>
                </div>

                <div
                  id="filmstrip"
                  ref={filmstripRef}
                  className={`flex gap-2 px-4 py-4 overflow-x-auto border-t border-zinc-800 flex-shrink-0 ${
                    isFilmstripDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  onWheel={handleFilmstripWheel}
                  onPointerDown={handleFilmstripPointerDown}
                  onPointerMove={handleFilmstripPointerMove}
                  onPointerUp={handleFilmstripPointerUp}
                  onPointerCancel={handleFilmstripPointerUp}
                >
                  {imageFiles.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveIndex(idx)}
                      className={`flex-shrink-0 rounded overflow-hidden transition ${
                        idx === activeIndex ? 'ring-2 ring-zinc-400' : 'opacity-60 hover:opacity-100'
                      } ${isFilmstripDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    >
                      <img
                        src={img.thumbnailPath}
                        alt={img.fileName}
                        className="h-24 w-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>

              {isExifOpen && (
              <aside className="w-[360px] max-w-full border-l border-black bg-[#0d0a0a] px-4 py-6 overflow-y-auto shadow-[inset_0_0_0_1px_rgba(0,0,0,0.6)] flex-shrink-0">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    {imageFiles[activeIndex] && (
                      <div className="text-zinc-200 font-semibold text-base">
                        {imageFiles[activeIndex].fileName}
                      </div>
                    )}
                  </div>
                  <span className="text-zinc-500 text-xs">
                    {activeIndex + 1}/{imageFiles.length}
                  </span>
                </div>

                {isExifLoading ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-3" />
                    <span className="text-zinc-400 text-sm">Loading EXIF...</span>
                  </div>
                ) : exifError ? (
                  <div className="text-red-400 text-sm">{exifError}</div>
                ) : exifData ? (
                  <div className="space-y-4">

                    {/* Image info */}
                    <div className="flex gap-3 border-b border-white/5 pb-2">
                      <div className="w-14 min-w-14 flex items-center justify-center">
                        <Icon name="image" />
                      </div>
                      <div className="flex-1">
                        <div className="text-zinc-300 text-xs font-medium">
                          {exifData?.FileName || imageFiles[activeIndex]?.fileName}
                        </div>
                        <div className="text-zinc-100 text-sm flex flex-wrap gap-x-6 mt-1">
                          {[
                            exifData?.ImageWidth && exifData?.ImageHeight
                              ? `${exifData.ImageWidth} × ${exifData.ImageHeight}`
                              : null,
                            formatMegapixels(exifData?.ImageWidth, exifData?.ImageHeight),
                            formatDPI(exifData),
                          ]
                            .filter(Boolean)
                            .map((v, i) => (
                              <span key={i} className="truncate">{v as string}</span>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* Date taken */}
                    <ExifItem
                      icon="today"
                      label="Date/time"
                      values={[formatDate(exifData)]}
                    />

                    {/* Camera */}
                    <div className="flex gap-3 border-b border-white/5 pb-2">
                      <div className="w-14 min-w-14 flex items-center justify-center">
                        <Icon name="photo_camera" />
                      </div>
                      <div className="flex-1">
                        <div className="text-zinc-300 text-xs font-medium">
                          {[exifData?.Make, exifData?.Model].filter(Boolean).join(" ") || "Camera"}
                        </div>
                        <div className="text-zinc-100 text-sm flex flex-wrap gap-x-6 mt-1">
                          {[
                            formatAperture(exifData?.FNumber ?? exifData?.ApertureValue),
                            formatExposureTime(exifData?.ExposureTime ?? exifData?.ShutterSpeedValue),
                            formatISO(exifData?.ISO),
                          ]
                            .filter(Boolean)
                            .map((v, i) => (
                              <span key={i} className="truncate">{v as string}</span>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* Flash */}
                    <ExifItem icon={formatFlash(exifData, true)} label="Flash" values={[formatFlash(exifData)]} />

                    {/* Lens */}
                    <div className="flex gap-3 border-b border-white/5 pb-2">
                      <div className="w-14 min-w-14 flex items-center justify-center">
                        <Icon name="camera" />
                      </div>
                      <div className="flex-1">
                        <div className="text-zinc-300 text-xs font-medium">
                          {exifData?.LensModel || exifData?.LensID || exifData?.LensType || "Lens"}
                        </div>
                        <div className="text-zinc-100 text-sm flex flex-wrap gap-x-6 mt-1">
                          {[
                            formatAperture(exifData?.FNumber ?? exifData?.ApertureValue),
                            formatFocalLength(exifData?.FocalLength),
                            formatCropFactor(exifData),
                          ]
                            .filter(Boolean)
                            .map((v, i) => (
                              <span key={i} className="truncate">{v as string}</span>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* White balance */}
                    <ExifItem icon="wb_auto" label="White balance" values={[formatWhiteBalance(exifData)]} />

                    {/* Exposure */}
                    <ExifItem icon="exposure" label="Exposure" values={[formatExposure(exifData)]} />

                    {/* File size */}
                    <div className="flex gap-3 border-b border-white/5 pb-2">
                      <div className="w-14 min-w-14 flex items-center justify-center">
                        <Icon name="perm_media" />
                      </div>
                      <div className="flex-1">
                        <div className="text-zinc-300 text-xs font-medium">File</div>
                        <div className="text-zinc-100 text-sm flex flex-wrap gap-x-6 mt-1">
                          {[
                            formatFileSize(exifData),
                            exifData?.MIMEType || null,
                          ]
                            .filter(Boolean)
                            .map((v, i) => (
                              <span key={i} className="truncate">{v as string}</span>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* Color */}
                    {(() => {
                      const c = formatColor(exifData);
                      return (
                        <div className="flex gap-3 border-b border-white/5 pb-2">
                          <div className="w-14 min-w-14 flex items-center justify-center">
                            <Icon name="colors" />
                          </div>
                          <div className="flex-1">
                            <div className="text-zinc-300 text-xs font-medium">Color</div>
                            <div className="text-zinc-100 text-sm flex flex-wrap gap-x-6 mt-1">
                              {[c.left, c.right, c.extra].filter(Boolean).map((v, i) => (
                                <span key={i} className="truncate">{v as string}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-zinc-500 text-sm">No EXIF information available.</div>
                )}
              </aside>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}