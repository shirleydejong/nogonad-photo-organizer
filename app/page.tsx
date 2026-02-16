"use client";

import { useState, useEffect, useRef, useCallback, type PointerEvent, type WheelEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Header } from "@/components/header";
import { FilterModal } from "@/components/filter-modal";
import { ConflictModal } from "@/components/conflict-modal";
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
  const [ratings, setRatings] = useState<Map<string, any | null>>(new Map());
  const [isRatingConflictModalOpen, setIsRatingConflictModalOpen] = useState<boolean>(false);
  const [ratingConflictData, setRatingConflictData] = useState<{ fileName: string, exifRating: number, dbRating: number | null } | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState<boolean>(false);
  const [filterShowUnrated, setFilterShowUnrated] = useState<boolean>(true);
  const [filterSelectedRatings, setFilterSelectedRatings] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
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

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Calculate filtered images based on current filter settings
  const filteredImageFiles = imageFiles.filter((img) => {
    const fileId = getFileId(img.fileName);
    const rating = ratings.get(fileId)?.rating ?? null;

    // If no filter is active (all ratings selected and unrated shown), show all
    if (filterSelectedRatings.size === 5 && filterShowUnrated) {
      return true;
    }

    // If image is unrated (null, undefined, 0, or less than 1)
    if (rating === null || rating === undefined || rating < 1) {
      return filterShowUnrated;
    }

    // If image has a rating, check if it's in the selected ratings
    return filterSelectedRatings.has(rating);
  });

  // Adjust activeIndex if current image is filtered out
  useEffect(() => {
    if (imageFiles.length === 0 || filteredImageFiles.length === 0) {
      setActiveIndex(0);
      return;
    }
    
    const currentImage = imageFiles[activeIndex];
    if (currentImage && !filteredImageFiles.includes(currentImage)) {
      // Current image is filtered out, find first filtered image
      const firstFilteredIndex = imageFiles.findIndex(img => 
        filteredImageFiles.includes(img)
      );
      setActiveIndex(firstFilteredIndex >= 0 ? firstFilteredIndex : 0);
    }
  }, [filteredImageFiles.length, imageFiles.length]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

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

      // Load batch EXIF data from localStorage and merge with database ratings
      let batchExifData: any[] = [];
      try {
        const storedExifData = localStorage.getItem(`batchExifData_${normalizedPath}`);
        if (storedExifData) {
          batchExifData = JSON.parse(storedExifData);
        }
      } catch (exifErr) {
        console.error('Failed to load batch EXIF data:', exifErr);
      }

      // Fetch ratings for this folder
      try {
        const ratingsResponse = await fetch(`/api/ratings?folderPath=${encodeURIComponent(normalizedPath)}`);

        if (ratingsResponse.ok) {
          const ratingsData = await ratingsResponse.json();
          if (ratingsData.success && ratingsData.ratings) {
            const ratingsMap = new Map<string, any | null>();
            for (const rating of ratingsData.ratings) {
              ratingsMap.set(rating.id, rating);
            }

            // Merge EXIF ratings with database ratings
            // EXIF ratings are used to pre-populate if there's no database rating
            for (const exifFile of batchExifData) {
              if (exifFile.FileName && exifFile.Rating != null) {
                const fileId = getFileId(exifFile.FileName);
                // Only pre-populate from EXIF if there's no database rating yet
                if (!ratingsMap.has(fileId)) {
                  ratingsMap.set(fileId, {
                    id: fileId,
                    rating: exifFile.Rating,
                    overRuleFileRating: false,
                    fromExif: true, // Mark as coming from EXIF for UI distinction
                  });
                }
              }
            }

            setRatings(ratingsMap);
          }
        }
      } catch (ratingErr) {
        console.error('Failed to fetch ratings:', ratingErr);
      }

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

  function getFileId(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return filename;
    return filename.substring(0, lastDot);
  }

  const updateRatingInDatabase = useCallback(async (fileName: string, rating: number | null, overRuleFileRating = false) => {
    try {

      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          rating,
          folderPath,
          overRuleFileRating,
        }),
      });

      if (response.ok) {
        const fileId = getFileId(fileName);
        setRatings(prev => {
          const newMap = new Map(prev);
          newMap.set(fileId, { id: fileName, rating, overRuleFileRating });
          return newMap;
        });
      }
    } catch (err) {
      console.error('Failed to update rating:', err);
    }
  }, [folderPath]);

  const handleOpenWith = useCallback(async () => {
    if (imageFiles.length === 0 || !folderPath) return;

    const currentImage = imageFiles[activeIndex];
    if (!currentImage) return;

    const fullPath = `${folderPath}\\${currentImage.fileName}`;

    try {
      const response = await fetch('/api/open-with', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: fullPath }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to open with dialog:', error);
      }
    } catch (err) {
      console.error('Failed to open with dialog:', err);
    }
  }, [imageFiles, activeIndex, folderPath]);

  const handleRatingClick = useCallback((rating: number | null) => {
    if (imageFiles.length === 0) return;

    const currentImage = imageFiles[activeIndex];
    if (!currentImage) return;

    const exifRating = exifData?.Rating;
    const hasExifRating = exifRating != null && Number.isInteger(exifRating) && exifRating >= 1 && exifRating <= 5;
    const fileId = getFileId(currentImage.fileName);
    const currentDbRating = ratings.get(fileId)?.rating ?? null;

    // If no EXIF rating: save to database
    if (!hasExifRating) {
      updateRatingInDatabase(currentImage.fileName, rating);
      return;
    }

    // Conflict exists only if file has EXIF rating AND database rating differs
    const hasConflict = currentDbRating !== null && exifRating !== currentDbRating;

    if (hasConflict) {
      // Show conflict modal if there's a mismatch between file and database
      setRatingConflictData({
        fileName: currentImage.fileName,
        exifRating,
        dbRating: currentDbRating,
      });
      setIsRatingConflictModalOpen(true);
      return;
    }

    // No conflict: save to database
    updateRatingInDatabase(currentImage.fileName, rating);
  }, [imageFiles, activeIndex, exifData, ratings, updateRatingInDatabase]);

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
    if (!isMainImageSwipingRef.current || mainImageSwipeTriggeredRef.current || filteredImageFiles.length === 0) return;

    // Don't trigger navigation swipe when zoomed in
    if (zoomLevel > 100) return;

    const deltaX = e.clientX - mainImageStartXRef.current;
    const deltaY = e.clientY - mainImageStartYRef.current;

    if (Math.abs(deltaX) < MAIN_IMAGE_SWIPE_THRESHOLD) return;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

    const currentIdx = filteredImageFiles.findIndex(
      img => img.fileName === imageFiles[activeIndex]?.fileName
    );

    if (deltaX < 0) {
      // Swipe left = next image, image goes left
      if (currentIdx < filteredImageFiles.length - 1) {
        const nextImg = filteredImageFiles[currentIdx + 1];
        setSwipeDirection('left');
        setActiveIndex(imageFiles.findIndex(img => img.fileName === nextImg.fileName));
      }
    } else {
      // Swipe right = previous image, image goes right
      if (currentIdx > 0) {
        const prevImg = filteredImageFiles[currentIdx - 1];
        setSwipeDirection('right');
        setActiveIndex(imageFiles.findIndex(img => img.fileName === prevImg.fileName));
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

  // Keyboard navigation and rating
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "F11") {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((err) => {
            console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
          });
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
        }
        return;
      }

      if (filteredImageFiles.length === 0 || zoomLevel > 100) return;

      switch (e.key) {
        case "ArrowLeft": {
          const currentIdx = filteredImageFiles.findIndex(
            img => img.fileName === imageFiles[activeIndex]?.fileName
          );
          if (currentIdx > 0) {
            const prevImg = filteredImageFiles[currentIdx - 1];
            setActiveIndex(imageFiles.findIndex(img => img.fileName === prevImg.fileName));
          }
          break;
        }
        case "ArrowRight": {
          const currentIdx = filteredImageFiles.findIndex(
            img => img.fileName === imageFiles[activeIndex]?.fileName
          );
          if (currentIdx < filteredImageFiles.length - 1) {
            const nextImg = filteredImageFiles[currentIdx + 1];
            setActiveIndex(imageFiles.findIndex(img => img.fileName === nextImg.fileName));
          }
          break;
        }
        case "0":
          handleRatingClick(null);
          break;
        case "1":
          handleRatingClick(1);
          break;
        case "2":
          handleRatingClick(2);
          break;
        case "3":
          handleRatingClick(3);
          break;
        case "4":
          handleRatingClick(4);
          break;
        case "5":
          handleRatingClick(5);
          break;
        case "Delete":
        case "Backspace":
          handleRatingClick(1);
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredImageFiles, zoomLevel, handleRatingClick, imageFiles, activeIndex]);

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
          const exifData = data?.exifData ?? null;
          setExifData(exifData);

          // Compare EXIF rating with database rating
          if (exifData) {
            const exifRating = exifData?.Rating;
            const fileId = getFileId(currentImage.fileName);
            const dbRating = ratings.get(fileId) ?? null;

            console.log('DB rating:', dbRating?.rating, 'EXIF rating:', exifRating, 'overRule:', dbRating?.overRuleFileRating);

            // Only process if EXIF has a valid rating (1-5)
            if (exifRating != null && Number.isInteger(exifRating) && exifRating >= 1 && exifRating <= 5) {
              // EXIF has rating, database doesn't → add to database
              if ((dbRating?.rating === null || dbRating?.rating === undefined) && !dbRating?.overRuleFileRating) {
                await updateRatingInDatabase(currentImage.fileName, exifRating);
              }
              // EXIF rating differs from database → show modal
              else if (exifRating !== dbRating?.rating && !dbRating?.overRuleFileRating) {
                setRatingConflictData({
                  fileName: currentImage.fileName,
                  exifRating,
                  dbRating: dbRating?.rating,
                });
                setIsRatingConflictModalOpen(true);
              }
              // Else: ratings match, do nothing
            }
          }
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
  }, [activeIndex, imageFiles, folderPath, ratings]);





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
            <Header 
              folderName={folderName}
              title={imageFiles[activeIndex]?.fileName}
              isFullscreen={isFullscreen}
            >
              <button
                className="header-button"
                onClick={handleOpenWith}
                title="Open with default application"
              >
                <Icon name="open_in_new" />
              </button>
              <button
                className="header-button"
                onClick={() => setIsFilterModalOpen(true)}
                title="Filter images by rating"
              >
                <Icon name="filter_list" />
              </button>
              <button
                className={`header-button ${isExifOpen ? "bg-zinc-200 text-black" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}`}
                onClick={() => setIsExifOpen((open) => !open)}
              >
                <Icon name="info" />
              </button>
              <div className="text-zinc-400 text-sm">{filteredImageFiles.length}/{imageFiles.length} images</div>
            </Header>

            <div className="flex flex-1 w-full overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0">
                <div className="main-image-container-wrapper flex-1 flex items-center justify-center overflow-hidden relative">

                  <button
                    className={`photo-nav-button left-4 ${isSwipingActive ? 'opacity-0' : ''}`}
                    disabled={filteredImageFiles.length === 0}
                    onClick={() => {
                      const currentIdx = filteredImageFiles.findIndex(
                        img => img.fileName === imageFiles[activeIndex]?.fileName
                      );
                      if (currentIdx > 0) {
                        const prevImg = filteredImageFiles[currentIdx - 1];
                        setActiveIndex(imageFiles.findIndex(img => img.fileName === prevImg.fileName));
                      }
                    }}
                  >
                    <Icon name="chevron_backward" />
                  </button>

                  <button
                    className={`photo-nav-button right-4 ${isSwipingActive ? 'opacity-0' : ''}`}
                    disabled={filteredImageFiles.length === 0}
                    onClick={() => {
                      const currentIdx = filteredImageFiles.findIndex(
                        img => img.fileName === imageFiles[activeIndex]?.fileName
                      );
                      if (currentIdx < filteredImageFiles.length - 1) {
                        const nextImg = filteredImageFiles[currentIdx + 1];
                        setActiveIndex(imageFiles.findIndex(img => img.fileName === nextImg.fileName));
                      }
                    }}
                  >
                    <Icon name="chevron_forward" />
                  </button>

                  <div id="rating-panel" className={`rating-panel ${isFullscreen ? 'hidden' : ''}`} aria-label="Rating panel">
                    <div className="rating-star-row" aria-hidden="true" data-current-rating={hoveredRating ?? (imageFiles[activeIndex] ? (ratings.get(getFileId(imageFiles[activeIndex].fileName))?.rating ?? 0) : 0)}>
                      <span className="rating-star">★</span>
                      <span className="rating-star">★</span>
                      <span className="rating-star">★</span>
                      <span className="rating-star">★</span>
                      <span className="rating-star">★</span>
                    </div>
                    <div className="rating-emoji-row noto-color-emoji-regular">
                      <button
                        type="button"
                        className="rating-emoji"
                        data-rating="1"
                        aria-label="Rating 1"
                        onMouseEnter={() => setHoveredRating(1)}
                        onMouseLeave={() => setHoveredRating(null)}
                        onClick={() => handleRatingClick(1)}
                      >
                        🗑️
                      </button>
                      <button
                        type="button"
                        className="rating-emoji"
                        data-rating="2"
                        aria-label="Rating 2"
                        onMouseEnter={() => setHoveredRating(2)}
                        onMouseLeave={() => setHoveredRating(null)}
                        onClick={() => handleRatingClick(2)}
                      >
                        😐
                      </button>
                      <button
                        type="button"
                        className="rating-emoji"
                        data-rating="3"
                        aria-label="Rating 3"
                        onMouseEnter={() => setHoveredRating(3)}
                        onMouseLeave={() => setHoveredRating(null)}
                        onClick={() => handleRatingClick(3)}
                      >
                        🤔
                      </button>
                      <button
                        type="button"
                        className="rating-emoji"
                        data-rating="4"
                        aria-label="Rating 4"
                        onMouseEnter={() => setHoveredRating(4)}
                        onMouseLeave={() => setHoveredRating(null)}
                        onClick={() => handleRatingClick(4)}
                      >
                        😀
                      </button>
                      <button
                        type="button"
                        className="rating-emoji"
                        data-rating="5"
                        aria-label="Rating 5"
                        onMouseEnter={() => setHoveredRating(5)}
                        onMouseLeave={() => setHoveredRating(null)}
                        onClick={() => handleRatingClick(5)}
                      >
                        🤩
                      </button>
                    </div>

                  </div>

                  <div className="main-image-container flex w-full h-full items-center justify-center gap-4 px-4">
                    <div className="flex-1 flex items-center justify-center h-full">
                      {imageFiles[activeIndex] && (
                        <img
                          key={activeIndex}
                          src={imageFiles[activeIndex].originalPath}
                          alt={imageFiles[activeIndex].fileName}
                          className={`main-image max-w-full max-h-full object-contain select-none ${swipeDirection === 'left'
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
                  className={`flex gap-2 px-4 py-4 overflow-x-auto border-t border-zinc-800 flex-shrink-0 ${isFilmstripDragging ? 'cursor-grabbing' : 'cursor-grab'} ${isFullscreen ? 'hidden' : ''}`}
                  onWheel={handleFilmstripWheel}
                  onPointerDown={handleFilmstripPointerDown}
                  onPointerMove={handleFilmstripPointerMove}
                  onPointerUp={handleFilmstripPointerUp}
                  onPointerCancel={handleFilmstripPointerUp}
                >
                  {filteredImageFiles.map((img) => {
                    const fileId = getFileId(img.fileName);
                    const ratingEntry = ratings.get(fileId);
                    const isRated = ratingEntry && ratingEntry.rating != null && ratingEntry.rating >= 1;
                    const imgIdx = imageFiles.findIndex(item => item.fileName === img.fileName);
                    return (
                      <button
                        key={imgIdx}
                        onClick={() => setActiveIndex(imgIdx)}
                        className={`flex-shrink-0 rounded overflow-hidden transition relative ${imgIdx === activeIndex ? 'ring-2 ring-zinc-400' : 'opacity-60 hover:opacity-100'} ${isFilmstripDragging ? 'cursor-grabbing' : 'cursor-grab'} ${isRated ? 'rated' : ''}`}
                      >
                        <img
                          src={img.thumbnailPath}
                          alt={img.fileName}
                          className="h-24 w-auto object-cover filmstrip-miniature"
                          loading="lazy"
                        />
                      </button>
                    );
                  })}
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

      <ConflictModal
        isOpen={isRatingConflictModalOpen}
        conflictData={ratingConflictData}
        onUseExifRating={async () => {
          if (ratingConflictData) {
            await updateRatingInDatabase(ratingConflictData.fileName, ratingConflictData.exifRating);
            setIsRatingConflictModalOpen(false);
            setRatingConflictData(null);
          }
        }}
        onUseDatabaseRating={async () => {
          if (ratingConflictData) {
            await updateRatingInDatabase(ratingConflictData.fileName, ratingConflictData.dbRating, true);
            setIsRatingConflictModalOpen(false);
            setRatingConflictData(null);
          }
        }}
        onIgnore={() => {
          setIsRatingConflictModalOpen(false);
          setRatingConflictData(null);
        }}
      />

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        showUnrated={filterShowUnrated}
        setShowUnrated={setFilterShowUnrated}
        selectedRatings={filterSelectedRatings}
        setSelectedRatings={setFilterSelectedRatings}
      />
    </div>
  );
}