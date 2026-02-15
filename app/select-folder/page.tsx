"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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

            // If done, stop polling and navigate to viewer
            if (progressData.processed >= progressData.total) {
              clearInterval(pollInterval);
              
              setTimeout(() => {
                setIsProcessing(false);
                // Save to localStorage as activeFolder
                localStorage.setItem('activeFolder', normalizedPath);
                // Navigate to main viewer with folder path
                router.push(`/`);
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
        )}
      </main>
    </div>
  );
}
