"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { FilterModal } from "@/components/filter-modal";
import CONFIG from "@/config";
import { Icon } from "@/components/icon";

interface ImageData {
  fileName: string;
  thumbnailPath: string;
  originalPath: string;
}

interface Rating {
  id: string;
  rating: number | null;
  overRuleFileRating: boolean;
  createdAt: string;
}

export default function BulkRatePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<ImageData[]>([]);
  const [folderPath, setFolderPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [ratings, setRatings] = useState<Map<string, Rating | null>>(new Map());
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [showUnrated, setShowUnrated] = useState<boolean>(true);
  const [selectedRatings, setSelectedRatings] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  
  // Multi-select state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  
  // Rectangle selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Get file ID (without extension)
  function getFileId(fileName: string) {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot === -1 ? fileName : fileName.substring(0, lastDot);
  }

  // Get thumbnail filename
  function getThumbnailFilename(fileName: string) {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) return fileName + '-thumb';
    return fileName.substring(0, lastDot) + '-thumb' + fileName.substring(lastDot);
  }

  function shouldShowImage(fileName: string): boolean {
    const fileId = getFileId(fileName);
    const ratingData = ratings.get(fileId);
    const currentRating = ratingData?.rating ?? null;

    if (currentRating === null && showUnrated) {
      return true;
    }

    if (currentRating !== null && selectedRatings.has(currentRating)) {
      return true;
    }

    return false;
  }

  // Load folder and images
  async function loadFolder(path: string) {
    setIsLoading(true);
    setLoadProgress(0);
    setError(null);

    try {
      const normalizedPath = path.replace(/\//g, '\\');
      const normalizedThumbPath = `${normalizedPath}\\${CONFIG.NPO_FOLDER}\\${CONFIG.THUMBNAILS_FOLDER}`;
      setFolderPath(normalizedPath);

      // Get the folder name from the path
      const parts = normalizedPath.split('\\');
      const lastPart = parts[parts.length - 1];
      setFolderName(lastPart || normalizedPath);

      // Get list of files (thumbnails should already exist)
      setLoadProgress(10);
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
      setLoadProgress(25);
      const imageData: ImageData[] = files.map((fileName) => {
        const encodedThumbPath = encodeURIComponent(getThumbnailFilename(fileName));
        const encodedPath = encodeURIComponent(fileName);
        return {
          fileName: fileName,
          thumbnailPath: `/api/image/${encodedThumbPath}?folderPath=${encodeURIComponent(normalizedThumbPath)}&fileName=${encodedThumbPath}`,
          originalPath: `/api/image/${encodedPath}?folderPath=${encodeURIComponent(normalizedPath)}&fileName=${encodedPath}`,
        };
      });

      setImageFiles(imageData);

      // Fetch ratings for this folder
      setLoadProgress(55);
      try {
        const ratingsResponse = await fetch(`/api/ratings?folderPath=${encodeURIComponent(normalizedPath)}`);

        if (ratingsResponse.ok) {
          const ratingsData = await ratingsResponse.json();
          if (ratingsData.success && ratingsData.ratings) {
            const ratingsMap = new Map<string, Rating | null>();
            for (const rating of ratingsData.ratings) {
              ratingsMap.set(rating.id, rating);
            }
            setRatings(ratingsMap);
          }
        }
      } catch (ratingErr) {
        console.error('Failed to fetch ratings:', ratingErr);
      }

      setLoadProgress(95);
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error loading folder:', err);
      setError(err.message || 'Failed to load folder');
      setIsLoading(false);
    }
  }

  // Load folder from localStorage on mount
  useEffect(() => {
    const activeFolder = localStorage.getItem('activeFolder');
    if (activeFolder) {
      loadFolder(activeFolder);
    } else {
      router.push('/select-folder');
    }
  }, [router]);

  // Handle rating application to selected images
  const applyRatingToSelected = useCallback(async (rating: number | null) => {
    if (selectedIndices.size === 0) return;

    try {
      for (const index of selectedIndices) {
        const image = imageFiles[index];
        if (image) {
          await fetch('/api/ratings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: image.fileName,
              rating: rating,
              folderPath: folderPath,
              overRuleFileRating: false,
            }),
          });
        }
      }

      // Update local ratings state
      setRatings(prev => {
        const newMap = new Map(prev);
        for (const index of selectedIndices) {
          const image = imageFiles[index];
          if (image) {
            const fileId = getFileId(image.fileName);
            newMap.set(fileId, { id: image.fileName, rating: rating, overRuleFileRating: true, createdAt: new Date().toISOString() });
          }
        }
        return newMap;
      });
    } catch (err) {
      console.error('Failed to apply rating:', err);
    }
  }, [selectedIndices, imageFiles, folderPath]);

  // Handle clicking on image thumbnail
  const handleImageClick = useCallback((index: number, event: React.MouseEvent) => {
    if (event.ctrlKey) {
      // Ctrl+click: toggle selection
      setSelectedIndices(prev => {
        const newSet = new Set(prev);
        if (newSet.has(index)) {
          newSet.delete(index);
        } else {
          newSet.add(index);
        }
        return newSet;
      });
    } else if (event.shiftKey) {
      // Shift+click: select range
      if (selectedIndices.size === 0) {
        setSelectedIndices(new Set([index]));
      } else {
        const lastSelected = Math.max(...Array.from(selectedIndices));
        const start = Math.min(lastSelected, index);
        const end = Math.max(lastSelected, index);
        const newSet = new Set<number>();
        for (let i = start; i <= end; i++) {
          newSet.add(i);
        }
        setSelectedIndices(newSet);
      }
    } else {
      // Regular click: select only this image
      setSelectedIndices(new Set([index]));
    }
  }, [selectedIndices]);

  // Handle rectangle selection (drag)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't start rectangle selection if clicking on an image
    const thumbnail = (e.target as HTMLElement).closest('[data-index]');
    if (thumbnail) return;
    
    if (!gridRef.current || e.button !== 0) return;
    
    setIsSelecting(true);
    setSelectionStart({ x: e.clientX, y: e.clientY });
    setSelectionEnd({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelecting || !selectionStart) return;

    setSelectionEnd({ x: e.clientX, y: e.clientY });

    if (!gridRef.current) return;

    const gridRect = gridRef.current.getBoundingClientRect();
    const x1 = Math.min(selectionStart.x, e.clientX);
    const y1 = Math.min(selectionStart.y, e.clientY);
    const x2 = Math.max(selectionStart.x, e.clientX);
    const y2 = Math.max(selectionStart.y, e.clientY);

    const newSelected = new Set<number>();

    const thumbnails = gridRef.current.querySelectorAll('[data-index]');
    thumbnails.forEach((thumb) => {
      const thumbRect = thumb.getBoundingClientRect();
      const overlaps = !(
        thumbRect.right < x1 || thumbRect.left > x2 ||
        thumbRect.bottom < y1 || thumbRect.top > y2
      );

      if (overlaps) {
        const index = parseInt((thumb as any).dataset.index);
        newSelected.add(index);
      }
    });

    setSelectedIndices(newSelected);
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  useEffect(() => {
    if (isSelecting) {
      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isSelecting]);

  const visibleImageEntries = useMemo(
    () => imageFiles
      .map((image, index) => ({ image, index }))
      .filter(({ image }) => shouldShowImage(image.fileName)),
    [imageFiles, ratings, showUnrated, selectedRatings]
  );

  const visibleIndices = useMemo(
    () => new Set(visibleImageEntries.map(({ index }) => index)),
    [visibleImageEntries]
  );

  useEffect(() => {
    setSelectedIndices((prev) => {
      const filtered = new Set(Array.from(prev).filter((index) => visibleIndices.has(index)));
      if (filtered.size === prev.size) {
        return prev;
      }
      return filtered;
    });
  }, [visibleIndices]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent zoom with Ctrl+Plus, Ctrl+Minus, Ctrl+0
      if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '0' || e.key === '=')) {
        e.preventDefault();
        return;
      }

      // Ctrl+A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedIndices(new Set(visibleImageEntries.map(({ index }) => index)));
        return;
      }

      // Escape: Deselect all
      if (e.key === 'Escape') {
        setSelectedIndices(new Set());
        return;
      }

      // 1-5: Apply rating
      if (selectedIndices.size > 0 && '12345'.includes(e.key)) {
        applyRatingToSelected(parseInt(e.key));
        return;
      }

      // Delete: Clear rating
      if (selectedIndices.size > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        applyRatingToSelected(null);
        return;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      // Prevent zoom with Ctrl+Scroll
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [selectedIndices, visibleImageEntries, applyRatingToSelected]);

  const currentRating = selectedIndices.size > 0
    ? (() => {
        const ratings_array = Array.from(selectedIndices).map(
          index => ratings.get(getFileId(imageFiles[index].fileName))?.rating ?? null
        );
        // Check if all ratings are the same
        const firstRating = ratings_array[0];
        const allSame = ratings_array.every(r => r === firstRating);
        return allSame ? (firstRating ?? 0) : 0;
      })()
    : 0;

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-black font-sans">
        <Header folderName={folderName} title="Loading..." isFullscreen={false}>
          <div className="text-zinc-400 text-sm">{Math.round(loadProgress)}%</div>
        </Header>
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 p-8">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-zinc-800 border-t-zinc-400 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <p className="text-lg text-zinc-300">Loading images...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col bg-black font-sans">
        <Header folderName={folderName} title="Error" isFullscreen={false}>
          <div className="text-red-500 text-sm">{error}</div>
        </Header>
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 p-8">
            <Icon name="error" />
            <p className="text-lg text-zinc-300">{error}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black font-sans">
      <Header folderName={folderName} title="Bulk Rate" isFullscreen={false}>
        <div className="flex items-center gap-4">
          <div className="text-zinc-400 text-sm">{visibleImageEntries.length} / {imageFiles.length} images, {selectedIndices.size} selected</div>
          <button
            className="header-button"
            onClick={() => setShowFilterModal(true)}
            title="Filter images by rating"
          >
            <Icon name="filter_list" />
          </button>
        </div>
      </Header>

      <main className="flex-1 flex flex-col w-full overflow-hidden">
        {/* Help section */}
        <div className="bg-zinc-900/50 border-b border-zinc-700 px-4 py-2 text-xs text-zinc-400">
          <span className="hidden sm:inline">
            <b>Click</b> to select • <b>Ctrl+Click</b> to toggle • <b>Shift+Click</b> for range • <b>Drag</b> to select area • 
            <b>Ctrl+A</b> all • <b>Esc</b> clear • <b>1-5</b> rate • <b>Del</b> clear rating
          </span>
        </div>

        <div 
          className="flex-1 overflow-auto bg-black"
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
        >
          <div 
            ref={gridRef}
            className="inline-grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 p-4 w-full mb-48"
          >
            {visibleImageEntries.length === 0 && (
              <div className="col-span-full text-zinc-500 text-center py-12">
                No images match the current filter.
              </div>
            )}
            {visibleImageEntries.map(({ image, index }) => {
              const fileId = getFileId(image.fileName);
              const isSelected = selectedIndices.has(index);
              const imageRating = ratings.get(fileId)?.rating ?? null;

              return (
                <div
                  key={index}
                  data-index={index}
                  className={`relative select-none group cursor-pointer rounded-lg overflow-hidden transition-all hover:brightness-110 ${
                    isSelected ? 'ring-3 ring-blue-500' : ''
                  }`}
                  onClick={(e) => handleImageClick(index, e)}
                >
                  <img
                    src={image.thumbnailPath}
                    alt={image.fileName}
                    className="w-full aspect-square object-cover bg-zinc-800 select-none"
                  />
                  
                  {/* Rating badge */}
                  {imageRating && (
                    <div className="absolute top-1 right-1 bg-black/80 text-yellow-400 text-xs px-2 py-1 rounded font-semibold">
                      {"★".repeat(imageRating)}
                    </div>
                  )}
                  
                  {/* Selection indicator overlay */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center">
                      <div className="text-white text-2xl drop-shadow-lg">✓</div>
                    </div>
                  )}
                  
                  {/* File name on hover */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/85 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity truncate select-none">
                    {image.fileName}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Floating Rating Panel */}
        {selectedIndices.size > 0 && (
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full">
            <div id="rating-panel" className="rating-panel">
              <div className="text-zinc-300 text-xs text-center mb-1 whitespace-nowrap">
                {selectedIndices.size} selected
              </div>
              
              <div className="rating-star-row" aria-hidden="true" data-current-rating={hoveredRating ?? currentRating}>
                <span className="rating-star">★</span>
                <span className="rating-star">★</span>
                <span className="rating-star">★</span>
                <span className="rating-star">★</span>
                <span className="rating-star">★</span>
              </div>
              
              <div className="rating-emoji-row noto-color-emoji-regular user-select-none" aria-label="Rating options">
                <button
                  type="button"
                  className="rating-emoji"
                  data-rating="1"
                  aria-label="Rating 1"
                  onMouseEnter={() => setHoveredRating(1)}
                  onMouseLeave={() => setHoveredRating(null)}
                  onClick={() => applyRatingToSelected(1)}
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
                  onClick={() => applyRatingToSelected(2)}
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
                  onClick={() => applyRatingToSelected(3)}
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
                  onClick={() => applyRatingToSelected(4)}
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
                  onClick={() => applyRatingToSelected(5)}
                >
                  🤩
                </button>
                <button
                  type="button"
                  className="rating-emoji"
                  aria-label="Clear rating"
                  onClick={() => applyRatingToSelected(null)}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <FilterModal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        showUnrated={showUnrated}
        setShowUnrated={setShowUnrated}
        selectedRatings={selectedRatings}
        setSelectedRatings={setSelectedRatings}
      />
    </div>
  );
}
