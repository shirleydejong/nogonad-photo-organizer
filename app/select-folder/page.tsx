"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/utils/socket";
import { Socket } from "socket.io-client";
import CONFIG from "@/config";

export default function SelectFolder() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [inputPath, setInputPath] = useState<string>("");
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
  const [filteredPaths, setFilteredPaths] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const isSocketReady = useRef<boolean>(false);

  const [hasActiveFolder, setHasActiveFolder] = useState<boolean>(false);

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

    // Check if there's an active folder
    const activeFolder = localStorage.getItem('activeFolder');
    if (activeFolder) {
      setHasActiveFolder(true);
    }
  }, []);

  // Setup socket.io connection
  useEffect(() => {
    // Get or create the global socket instance
    const socket = getSocket();
    socketRef.current = socket;

    // Check if already connected
    if (socket.connected) {
      isSocketReady.current = true;
    }

    // Listen for connection events
    const handleConnect = () => {
      console.log('Socket connected:', socket.id);
      isSocketReady.current = true;
    };

    const handleDisconnect = () => {
      console.log('Socket disconnected');
      isSocketReady.current = false;
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      // Remove only our listeners, don't disconnect the socket
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

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

  async function handlePickFolder(targetRoute: '/' | '/list') {
    setError(null);
    setShowAutocomplete(false);
    
    if (!inputPath.trim()) {
      setError("Please enter a path");
      return;
    }

    if (!socketRef.current) {
      setError("Socket connection not available");
      return;
    }

    // Wait for socket to be ready
    if (!isSocketReady.current) {
      setError("Socket not connected yet, please wait...");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    
    try {
      // Valideer Windows pad format
      const trimmedPath = inputPath.trim();
      
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
      
      // Save to history
      savePathToHistory(normalizedPath);

      // Get the folder name from the path
      const parts = normalizedPath.split('\\');
      const lastPart = parts[parts.length - 1];
      setFolderName(lastPart || normalizedPath);

      // Setup socket event listeners
      const socket = socketRef.current;

      const handleProgress = (data: { processed: number; total: number; percentage: number; folderPath: string }) => {
        console.log('Received thumbnail-progress:', data);
        if (data.folderPath === normalizedPath) {
          setProgress(data.percentage);
        }
      };

      const handleComplete = async (data: { total: number; files: string[]; folderPath: string }) => {
        console.log('Received thumbnail-complete:', data);
        if (data.folderPath === normalizedPath) {
          // Clean up listeners
          socket.off('thumbnail-progress', handleProgress);
          socket.off('thumbnail-complete', handleComplete);
          socket.off('thumbnail-error', handleError);

          if (data.total === 0) {
            setError("No images found in this folder");
            setIsProcessing(false);
            return;
          }

          try {
            // Fetch batch EXIF data for all files in the folder
            const exifResponse = await fetch('/api/exif', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderPath: normalizedPath, action: 'batch' }),
            });

            if (exifResponse.ok) {
              const exifData = await exifResponse.json();
              if (exifData.success && exifData.exifData) {
                // Store batch EXIF data in localStorage
                localStorage.setItem(`batchExifData_${normalizedPath}`, JSON.stringify(exifData.exifData));
              }
            }
          } catch (exifErr) {
            console.error('Failed to fetch batch EXIF data:', exifErr);
            // Continue anyway, EXIF data is optional
          }

          setTimeout(() => {
            // Save to localStorage as activeFolder
            localStorage.setItem('activeFolder', normalizedPath);
            // Navigate to the selected view
            router.push(targetRoute);
          }, 300);
        }
      };

      const handleError = (data: { error: string; folderPath: string }) => {
        console.log('Received thumbnail-error:', data);
        if (data.folderPath === normalizedPath) {
          // Clean up listeners
          socket.off('thumbnail-progress', handleProgress);
          socket.off('thumbnail-complete', handleComplete);
          socket.off('thumbnail-error', handleError);

          setError(data.error || 'Could not generate thumbnails');
          setIsProcessing(false);
        }
      };

      // Register event listeners
      socket.on('thumbnail-progress', handleProgress);
      socket.on('thumbnail-complete', handleComplete);
      socket.on('thumbnail-error', handleError);

      // Emit generate-thumbnails event
      console.log('Emitting generate-thumbnails:', normalizedPath);
      socket.emit('generate-thumbnails', normalizedPath);

      // Safety timeout after 60 seconds
      setTimeout(() => {
        if (isProcessing) {
          socket.off('thumbnail-progress', handleProgress);
          socket.off('thumbnail-complete', handleComplete);
          socket.off('thumbnail-error', handleError);
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
        ) : (
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
                    handlePickFolder('/');
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
            
            <div className="flex gap-4">
              <button
                className="px-6 py-3 bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700 transition text-lg"
                onClick={() => handlePickFolder('/')}
              >
                View as Strip
              </button>
              <button
                className="px-6 py-3 bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700 transition text-lg"
                onClick={() => handlePickFolder('/list')}
              >
                View as List
              </button>
            </div>
            
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          </div>
        )}
      </main>
    </div>
  );
}
