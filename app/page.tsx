"use client";

import { useState, useEffect, useRef, type PointerEvent, type WheelEvent } from "react";
import CONFIG from "@/config";

interface ImageData {
  originalFile: File;
  fileName: string;
  thumbnailPath: string;
  originalPath: string;
}

export default function Home() {
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<ImageData[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [folderPath, setFolderPath] = useState<string>("");
  const [inputPath, setInputPath] = useState<string>("");
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
  const [filteredPaths, setFilteredPaths] = useState<string[]>([]);
  const [isExifOpen, setIsExifOpen] = useState<boolean>(false);
  const [exifData, setExifData] = useState<Record<string, any> | null>(null);
  const [exifError, setExifError] = useState<string | null>(null);
  const [isExifLoading, setIsExifLoading] = useState<boolean>(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [isSwipingActive, setIsSwipingActive] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const isFilmstripDraggingRef = useRef(false);
  const filmstripDragStartXRef = useRef(0);
  const filmstripStartScrollLeftRef = useRef(0);
  const isMainImageSwipingRef = useRef(false);
  const mainImageStartXRef = useRef(0);
  const mainImageStartYRef = useRef(0);
  const mainImageSwipeTriggeredRef = useRef(false);
  const swipeButtonTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const MAIN_IMAGE_SWIPE_THRESHOLD = 60;

  function handleFilmstripWheel(e: WheelEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return;

    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (delta === 0) return;

    const step = Math.round(window.innerWidth * 0.6);
    const direction = delta > 0 ? 1 : -1;

    //e.preventDefault();
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  function handleFilmstripPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const el = e.currentTarget;
    isFilmstripDraggingRef.current = true;
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
  }

  function handleMainImagePointerMove(e: PointerEvent<HTMLImageElement>) {
    if (!isMainImageSwipingRef.current || mainImageSwipeTriggeredRef.current || imageFiles.length === 0) return;

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
    
    // Show buttons after 2 seconds
    if (swipeButtonTimeoutRef.current) {
      clearTimeout(swipeButtonTimeoutRef.current);
    }
    swipeButtonTimeoutRef.current = setTimeout(() => {
      setIsSwipingActive(false);
      swipeButtonTimeoutRef.current = null;
    }, 2000);
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

  // Load path history from localStorage on mount
  useEffect(() => {
    const savedPaths = localStorage.getItem('pathHistory');
    if (savedPaths) {
      try {
        const paths = JSON.parse(savedPaths);
        setPathHistory(paths);
        // Auto-populate with the most recent path
        if (paths.length > 0) {
          setInputPath(paths[0]);
        }
      } catch (e) {
        console.error('Failed to load path history:', e);
      }
    }
  }, []);
  
  useEffect(() => {
    const lsActiveIndex = localStorage.getItem('activeIndices');
    if( lsActiveIndex ) {
      try {
        const activeIndices = JSON.parse(lsActiveIndex);
        if( folderPath in activeIndices ) {
          const index = !isNaN(Number(activeIndices[folderPath])) ? Number(activeIndices[folderPath]) : 0;
          setActiveIndex(index);
        }
        
      } catch (e) {
        console.error('Failed to load last index:', e);
      }
    }
  }, [folderPath, setActiveIndex]);

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
      if (imageFiles.length === 0) return;
      if (e.key === "ArrowLeft") {
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "ArrowRight") {
        setActiveIndex((prev) => (prev < imageFiles.length - 1 ? prev + 1 : prev));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imageFiles.length]);
  
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
        }
        const data = await response.json();
        console.log(data)
        
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

  // Save path to history
  function savePathToHistory(path: string) {
    const trimmedPath = path.trim();
    if (!trimmedPath) return;

    setPathHistory((prev) => {
      // Remove duplicates and add to front
      const filtered = prev.filter(p => p !== trimmedPath);
      const newHistory = [trimmedPath, ...filtered].slice(0, 20); // Keep max 20
      
      // Save to localStorage
      localStorage.setItem('pathHistory', JSON.stringify(newHistory));
      
      return newHistory;
    });
  }

  // Handle input change with autocomplete
  function handleInputChange(value: string) {
    setInputPath(value);
    
    if (value.trim()) {
      const matches = pathHistory.filter(p => 
        p.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredPaths(matches);
      setShowAutocomplete(matches.length > 0);
    } else {
      setFilteredPaths([]);
      setShowAutocomplete(false);
    }
  }

  // Handle autocomplete selection
  function selectAutocompletePath(path: string) {
    setInputPath(path);
    setShowAutocomplete(false);
    setFilteredPaths([]);
  }

  async function handlePickFolder() {
    setError(null);
    setShowAutocomplete(false);
    
    if (!inputPath.trim()) {
      setError("Please enter a path");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    
    try {
      // Valideer Windows pad format
      const trimmedPath = inputPath.trim();
      const trimmedThumbPath = `${trimmedPath}\\${CONFIG.NPO_FOLDER}\\${CONFIG.THUMBNAILS_FOLDER}`;
      
      // Check if it's the thumbnails folder
      if (trimmedPath.toLowerCase().includes(`${CONFIG.NPO_FOLDER}\\${CONFIG.THUMBNAILS_FOLDER}`.toLowerCase())) {
        setError("You cannot use a thumbnail directory. Choose the main folder with photos.");
        setIsProcessing(false);
        return;
      }
      
      // Basic validation: must start with drive letter (C:\\) or UNC path (\\\\)
      if (!/^[a-zA-Z]:\\|^\\\\/.test(trimmedPath)) {
        setError("Please enter a valid Windows path (e.g. C:\\Users\\Photos or \\\\server\\share)");
        setIsProcessing(false);
        return;
      }

      // Normalize the path (convert forward slashes to backslashes)
      const normalizedPath = trimmedPath.replace(/\//g, '\\');
      const normalizedThumbPath = trimmedThumbPath.replace(/\//g, '\\');
      setFolderPath(normalizedPath);
      
      // Save to history
      savePathToHistory(normalizedPath);

      // Get the folder name from the path
      const parts = normalizedPath.split('\\');
      const lastPart = parts[parts.length - 1];
      setFolderName(lastPart || normalizedPath);

      // Start thumbnail generation on the server
      const startResponse = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: normalizedPath, action: 'start' }),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || 'Could not generate thumbnails');
      }

      const startData = await startResponse.json();

      // If no images found
      if (startData.total === 0) {
        setError("No images found in this folder");
        setIsProcessing(false);
        return;
      }

      const files = startData.files as string[];
      
      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressResponse = await fetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: normalizedPath, action: 'progress' }),
          });

          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            setProgress(progressData.percentage);

            // If done, stop polling and show images
            if (progressData.processed >= progressData.total) {
              clearInterval(pollInterval);
              
              // Create ImageData objects
              
              const imageData: ImageData[] = files.map((fileName) => {
                const encodedThumbPath = encodeURIComponent(getThumbnailFilename(fileName));
                const encodedPath = encodeURIComponent(fileName);
                return {
                  originalFile: null as any, // Niet nodig voor server-side thumbnails
                  fileName: fileName,
                  thumbnailPath: `/api/image/${encodedThumbPath}?folderPath=${encodeURIComponent(normalizedThumbPath)}&fileName=${encodedThumbPath}`,
                  originalPath: `/api/image/${encodedPath}?folderPath=${encodeURIComponent(normalizedPath)}&fileName=${encodedPath}`,
                }
              });

              setImageFiles(imageData);
              
              setTimeout(() => {
                setIsProcessing(false);
              }, 300);
            }
          }
        } catch (err) {
          console.error('Progress poll error:', err);
        }
      }, 500);

      // Safety timeout after 60 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isProcessing) {
          setError('Timeout while generating thumbnails');
          setIsProcessing(false);
        }
      }, 60000);

    } catch (e: any) {
      console.error('Error:', e);
      setError(e.message || "Could not process folder. Check the path and try again.");
      setIsProcessing(false);
    }
  }

  function getThumbnailFilename(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return filename + '-thumb';
    return filename.substring(0, lastDot) + '-thumb' + filename.substring(lastDot);
  }
  
  function baseName(name?: string | null) {
    if (!name) return null;
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
  }

  function formatAperture(v?: number | string | null) {
    if (v == null || v === "") return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? `ƒ/${n}` : `ƒ/${v}`;
  }

  function formatExposureTime(v?: number | string | null) {
    if (v == null || v === "") return null;
    if (typeof v === "string") {
      // exiftool may already give "1/50"
      return v.includes("/") ? `${v} sec` : `${v} sec`;
    }
    const t = Number(v);
    if (!Number.isFinite(t) || t <= 0) return null;
    if (t >= 1) return `${t.toFixed(1)} sec`;
    const denom = Math.round(1 / t);
    return `1/${denom} sec`;
  }

  function formatISO(v?: number | null) {
    return v != null ? `ISO ${v}` : null;
  }

  function formatFocalLength(v?: number | string | null) {
    if (v == null || v === "") return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? `${n} mm` : `${v} mm`;
  }

  function formatCropFactor(exif: any) {
    const f = exif?.FocalLength;
    const f35 = exif?.FocalLengthIn35mmFormat;
    if (!f || !f35) return null;
    const nF = Number(f);
    const nF35 = Number(f35);
    if (!Number.isFinite(nF) || !Number.isFinite(nF35) || nF === 0) return null;
    const cf = nF35 / nF;
    return `Crop factor: ${cf.toFixed(1)}x`;
  }

  function formatMegapixels(w?: number, h?: number) {
    if (!w || !h) return null;
    const mp = (w * h) / 1_000_000;
    return `${mp.toFixed(1)} MP`;
  }

  function formatDPI(exif: any) {
    const xr = exif?.XResolution;
    const yr = exif?.YResolution;
    const unit = exif?.ResolutionUnit; // 2=inches, 3=cm (exiftool)
    if (!xr && !yr) return null;
    const dpiX = xr ? Number(xr) : null;
    const dpiY = yr ? Number(yr) : null;
    const label = unit === 3 ? "dpcm" : "dpi";
    const v = dpiX || dpiY;
    return v ? `${Math.round(v)} ${label}` : null;
  }

  function formatDate(exif: any) {
    const s = exif?.DateTimeOriginal || exif?.CreateDate;
    if (!s || typeof s !== "string") return null;
    // EXIF format "YYYY:MM:DD HH:MM:SS"
    const iso = s.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3").replace(" ", "T");
    const offset = exif?.OffsetTimeOriginal || exif?.OffsetTime || "";
    const d = new Date(iso + (typeof offset === "string" ? offset : ""));
    if (isNaN(d.getTime())) return s; // fallback
    const dt = new Intl.DateTimeFormat("nl-NL", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
    const tz = typeof offset === "string" && offset ? ` ${offset}` : "";
    return `${dt}${tz}`;
  }

  function formatFlash(exif: any, asIcon = false) {
    // exiftool -n returns numeric bitfield for Flash
    const v = exif?.Flash;
    const fired =
      typeof v === "number" ? (v & 0x1) === 1 : String(exif?.Flash)?.toLowerCase().includes("fired");
    if (asIcon) {
      return fired ? "flash_on" : "flash_off";
    }
    return fired ? "On, Fired" : "Off";
  }

  function formatWhiteBalance(exif: any) {
    const wb = exif?.WhiteBalance;
    if (wb == null) return null;
    // exiftool often returns "Auto", otherwise numeric
    if (typeof wb === "string") return wb;
    const map: Record<number, string> = { 0: "Auto", 1: "Manual" };
    return map[wb] || String(wb);
  }

  function formatExposure(exif: any) {
    const mode = exif?.ExposureMode;
    const prog = exif?.ExposureProgram;
    const modeMap: Record<number, string> = { 0: "Auto", 1: "Manual", 2: "Auto Bracket" };
    const progMap: Record<number, string> = {
      0: "Undefined",
      1: "Manual",
      2: "Normal",
      3: "Aperture Priority",
      4: "Shutter Priority",
      5: "Creative",
      6: "Action",
      7: "Portrait",
      8: "Landscape",
    };
    const left = mode != null ? modeMap[mode] ?? String(mode) : null;
    const right = prog != null ? progMap[prog] ?? String(prog) : null;
    if (left && right) return `Auto    Program AE`.replace("Auto", left).replace("Program AE", right);
    return left || right || null;
  }

  function formatFileSize(exif: any) {
    const bytes = exif?.FileSize;
    if (!Number.isFinite(bytes)) return exif?.FileSize || null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatColor(exif: any) {
    const profile = exif?.ProfileDescription;
    const colorSpace = exif?.ColorSpaceData || exif?.ColorType || exif?.ColorSpace;
    let cs = null;
    if (typeof colorSpace === "string") cs = colorSpace;
    else if (colorSpace === 1) cs = "sRGB";
    else if (colorSpace === 65535) cs = "Uncalibrated";
    const bitsArr = exif?.BitsPerSample;
    let bits = null;
    if (Array.isArray(bitsArr) && bitsArr.length) bits = `${bitsArr[0]} bits/channel`;
    else if (Number.isFinite(bitsArr)) bits = `${bitsArr} bits/channel`;
    else bits = "";
    
    bits = isHDR(exif) ? bits + " - HDR" : bits;
    
    return {
      left: cs || "",
      right: profile || "",
      extra: bits,
    };
  }
  
  function isHDR(exif: any) {
    return Array.isArray(exif?.DirectoryItemSemantic) && exif?.DirectoryItemSemantic.map((el: string | null | undefined) => el?.toLowerCase()).includes('gainmap') ||
    (exif?.HDREditMode === 1 || exif?.HDRMaxValue > 0)
  }

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
        {isProcessing ? (
          // Splash screen with progress bar
          <div className="flex flex-col items-center gap-6 p-8">
            <div className="text-zinc-200 text-2xl font-semibold">
              Generating thumbnails...
            </div>
            <div className="w-96 bg-zinc-800 rounded-full h-4 overflow-hidden">
              <div
                className="bg-zinc-400 h-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-zinc-400 text-sm">
              {progress}% complete
            </div>
            {folderName && (
              <div className="text-zinc-500 text-sm">
                Folder: <b>{folderName}</b>
              </div>
            )}
          </div>
        ) : imageFiles.length === 0 ? (
          <div className="flex flex-col items-center gap-6 w-full max-w-2xl px-4">
            <div className="text-zinc-200 text-2xl font-semibold">Enter a path</div>
            
            <div className="relative w-full">
              <input
                ref={inputRef}
                type="text"
                value={inputPath}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handlePickFolder();
                  } else if (e.key === 'Escape') {
                    setShowAutocomplete(false);
                  }
                }}
                onFocus={() => {
                  if (inputPath.trim() && filteredPaths.length > 0) {
                    setShowAutocomplete(true);
                  }
                }}
                onBlur={() => {
                  // Delay to allow click on autocomplete item
                  setTimeout(() => setShowAutocomplete(false), 200);
                }}
                placeholder="E.g: C:\Users\xxx\Pictures or \\server\share\photos"
                className="w-full px-4 py-3 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded focus:outline-none focus:border-zinc-500 text-sm"
              />
              
              {/* Autocomplete dropdown */}
              {showAutocomplete && filteredPaths.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-lg max-h-60 overflow-y-auto z-10">
                  {filteredPaths.map((path, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectAutocompletePath(path)}
                      className="w-full px-4 py-2 text-left text-zinc-200 hover:bg-zinc-700 transition text-sm border-b border-zinc-700 last:border-b-0"
                    >
                      {path}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <button
              className="px-6 py-3 bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700 transition text-lg"
              onClick={handlePickFolder}
            >
              Load photo strip
            </button>
            
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          </div>
        ) : (
          <div className="flex flex-col w-full h-screen">
            <div className="w-full flex items-center justify-between px-8 py-3 border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <button
                  className="px-4 py-2 bg-zinc-800 rounded text-zinc-200 hover:bg-zinc-700 transition"
                  onClick={() => {
                    setImageFiles([]);
                    setFolderName(null);
                    setActiveIndex(0);
                    setExifData(null);
                    setExifError(null);
                  }}
                >
                  &larr; Choose another folder
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
                <div className="text-zinc-400 text-sm">{imageFiles.length} images found</div>
              </div>
            </div>

            <div className="flex flex-1 w-full overflow-hidden">
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 flex items-center justify-center overflow-hidden">
                  <div className="flex w-full h-full items-center justify-center gap-4 px-4">
                    <button
                      className={`px-3 py-2 bg-zinc-500 rounded-full text-xl font-bold disabled:opacity-40 flex-shrink-0 photo-nav-button transition-opacity duration-150 flex h-12 w-12 items-center ${
                        isSwipingActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
                      }`}
                      onClick={() => setActiveIndex((i) => (i > 0 ? i - 1 : i))}
                      disabled={activeIndex === 0}
                      aria-label="Previous photo"
                    >
                      <Icon name="arrow_back" />
                    </button>
                    <img
                      src={(imageFiles[activeIndex]?.originalPath || "").replace('-thumb', '')}
                      alt={`Photo ${activeIndex + 1}`}
                      className="main-image rounded shadow-lg object-contain bg-zinc-900 max-w-full max-h-full"
                      onPointerDown={handleMainImagePointerDown}
                      onPointerMove={handleMainImagePointerMove}
                      onPointerUp={handleMainImagePointerUp}
                      onPointerCancel={handleMainImagePointerUp}
                      onPointerLeave={handleMainImagePointerUp}
                      style={{
                        touchAction: "pan-y",
                        animation: swipeDirection === 'left' 
                          ? 'swipeOutLeft 0.25s ease-out forwards'
                          : swipeDirection === 'right'
                          ? 'swipeOutRight 0.25s ease-out forwards'
                          : 'swipeInCenter 0.25s ease-out forwards',
                      }}
                      draggable={false}
                    />
                    <button
                      className={`px-3 py-2 bg-zinc-500 rounded-full text-xl font-bold disabled:opacity-40 flex-shrink-0 photo-nav-button transition-opacity duration-150 flex h-12 w-12 items-center ${
                        isSwipingActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
                      }`}
                      onClick={() => setActiveIndex((i) => (i < imageFiles.length - 1 ? i + 1 : i))}
                      disabled={activeIndex === imageFiles.length - 1}
                      aria-label="Next photo"
                    >
                      <Icon name="arrow_forward" />
                    </button>
                  </div>
                </div>

                <div
                  id="filmstrip"
                  ref={filmstripRef}
                  onWheel={handleFilmstripWheel}
                  onPointerDown={handleFilmstripPointerDown}
                  onPointerMove={handleFilmstripPointerMove}
                  onPointerUp={handleFilmstripPointerUp}
                  onPointerCancel={handleFilmstripPointerUp}
                  className="flex gap-2 overflow-x-auto w-full p-2 bg-zinc-900 flex-shrink-0 cursor-grab active:cursor-grabbing touch-pan-x"
                  style={{ maxHeight: '120px' }}
                >
                  {imageFiles.map((imageData, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveIndex(idx)}
                      className={`border-2 rounded transition focus:outline-none flex-shrink-0 ${activeIndex === idx ? "border-zinc-300" : "border-transparent"}`}
                      style={{ padding: 0, background: "none" }}
                      tabIndex={0}
                    >
                      <img
                        src={imageData.thumbnailPath}
                        alt={`Thumbnail ${idx + 1}`}
                        className={`h-20 w-auto rounded ${activeIndex === idx ? "ring-2 ring-zinc-300" : "opacity-70 hover:opacity-100"}`}
                        style={{ maxWidth: 120 }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {isExifOpen && (
              <aside className="w-[360px] max-w-full border-l border-black bg-[#0d0a0a] px-4 py-6 overflow-clip shadow-[inset_0_0_0_1px_rgba(0,0,0,0.6)] flex-shrink-0">
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
        )}
      </main>
    </div>
  );
}
