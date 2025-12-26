"use client";

import { useState, useEffect, useRef } from "react";
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
  //const mainRef = useRef<HTMLDivElement>(null);
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

  // Keyboard navigatie
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
      setError("Voer alstublieft een pad in");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    
    try {
      // Valideer Windows pad format
      const trimmedPath = inputPath.trim();
      const trimmedThumbPath = `${trimmedPath}\\${CONFIG.THUMBNAILS_FOLDER}`;
      
      // Check if it's the thumbnails folder
      if (trimmedPath.toLowerCase().includes(CONFIG.THUMBNAILS_FOLDER)) {
        setError("Je kunt geen thumbnail directory gebruiken. Kies de hoofdmap met foto's.");
        setIsProcessing(false);
        return;
      }
      
      // Basis validatie: moet ofwel met drive letter (C:\) ofwel UNC pad (\\) beginnen
      if (!/^[a-zA-Z]:\\|^\\\\/.test(trimmedPath)) {
        setError("Voer alstublieft een geldig Windows pad in (bijv. C:\\Users\\Foto's of \\\\server\\share)");
        setIsProcessing(false);
        return;
      }

      // Normaliseer het pad (zet forward slashes om naar backslashes)
      const normalizedPath = trimmedPath.replace(/\//g, '\\');
      const normalizedThumbPath = trimmedThumbPath.replace(/\//g, '\\');
      setFolderPath(normalizedPath);
      
      // Save to history
      savePathToHistory(normalizedPath);

      // Haal de mapnaam uit het pad
      const parts = normalizedPath.split('\\');
      const lastPart = parts[parts.length - 1];
      setFolderName(lastPart || normalizedPath);

      // Start thumbnail generatie op de server
      const startResponse = await fetch('/api/thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: normalizedPath, action: 'start' }),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || 'Kon thumbnails niet genereren');
      }

      const startData = await startResponse.json();

      // Als geen afbeeldingen gevonden
      if (startData.total === 0) {
        setError("Geen afbeeldingen gevonden in deze map");
        setIsProcessing(false);
        return;
      }

      const files = startData.files as string[];
      
      // Poll voor progress
      const pollInterval = setInterval(async () => {
        try {
          const progressResponse = await fetch('/api/thumbnails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: normalizedPath, action: 'progress' }),
          });

          if (progressResponse.ok) {
            const progressData = await progressResponse.json();
            setProgress(progressData.percentage);

            // Als klaar, stop polling en toon afbeeldingen
            if (progressData.processed >= progressData.total) {
              clearInterval(pollInterval);
              
              // Maak ImageData objecten
              const imageData: ImageData[] = files.map((fileName) => ({
                originalFile: null as any, // Niet nodig voor server-side thumbnails
                fileName: fileName,
                thumbnailPath: `/api/thumbnails?folderPath=${encodeURIComponent(normalizedThumbPath)}&fileName=${encodeURIComponent(getThumbnailFilename(fileName))}`,
                originalPath: `/api/thumbnails?folderPath=${encodeURIComponent(normalizedPath)}&fileName=${encodeURIComponent(fileName)}`,
              }));

              setImageFiles(imageData);
              setActiveIndex(0);
              
              setTimeout(() => {
                setIsProcessing(false);
              }, 300);
            }
          }
        } catch (err) {
          console.error('Progress poll error:', err);
        }
      }, 500);

      // Safety timeout na 60 seconden
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isProcessing) {
          setError('Timeout bij het genereren van thumbnails');
          setIsProcessing(false);
        }
      }, 60000);

    } catch (e: any) {
      console.error('Error:', e);
      setError(e.message || "Kon map niet verwerken. Controleer het pad en probeer het opnieuw.");
      setIsProcessing(false);
    }
  }

  function getThumbnailFilename(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return filename + '-thumb';
    return filename.substring(0, lastDot) + '-thumb' + filename.substring(lastDot);
  }

  return (
    <div className="flex min-h-screen flex-col bg-black font-sans">
      <main className="flex-1 flex flex-col items-center justify-center w-full">
        {isProcessing ? (
          // Splash screen met progressiebalk
          <div className="flex flex-col items-center gap-6 p-8">
            <div className="text-zinc-200 text-2xl font-semibold">
              Thumbnails genereren...
            </div>
            <div className="w-96 bg-zinc-800 rounded-full h-4 overflow-hidden">
              <div
                className="bg-zinc-400 h-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-zinc-400 text-sm">
              {progress}% voltooid
            </div>
            {folderName && (
              <div className="text-zinc-500 text-sm">
                Map: <b>{folderName}</b>
              </div>
            )}
          </div>
        ) : imageFiles.length === 0 ? (
          <div className="flex flex-col items-center gap-6 w-full max-w-2xl px-4">
            <div className="text-zinc-200 text-2xl font-semibold">Voer een pad in</div>
            
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
                placeholder="Bijv: C:\Users\xxx\Pictures of \\server\share\photos"
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
              Fotostrip laden
            </button>
            
            {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          </div>
        ) : (
          <div className="flex flex-col items-center w-full h-full">
            <div className="w-full flex items-center justify-between px-8 mb-2">
              <button
                className="px-4 py-2 bg-zinc-800 rounded text-zinc-200 hover:bg-zinc-700 transition"
                onClick={() => {
                  setImageFiles([]);
                  setFolderName(null);
                  setActiveIndex(0);
                }}
              >
                &larr; Kies andere map
              </button>
              <div className="text-zinc-400 text-sm">{imageFiles.length} afbeeldingen gevonden</div>
            </div>
            <div className="flex-1 flex items-center justify-center w-full" style={{ minHeight: 0 }}>
              <div className="flex w-full h-full items-center justify-center gap-4 px-4" style={{ minHeight: 0 }}>
                <button
                  className="px-3 py-2 bg-zinc-500 rounded-full text-xl font-bold disabled:opacity-40"
                  onClick={() => setActiveIndex((i) => (i > 0 ? i - 1 : i))}
                  disabled={activeIndex === 0}
                  aria-label="Vorige foto"
                >
                  &#8592;
                </button>
                <img
                  src={imageFiles[activeIndex].originalPath.replace('-thumb', '')}
                  alt={`Foto ${activeIndex + 1}`}
                  className="rounded shadow-lg object-contain bg-zinc-900"
                  style={{
                    width: "100%",
                    maxWidth: "100vw",
                    maxHeight: "calc(100vh - 220px)",
                    minHeight: 0,
                  }}
                />
                <button
                  className="px-3 py-2 bg-zinc-500 rounded-full text-xl font-bold disabled:opacity-40"
                  onClick={() => setActiveIndex((i) => (i < imageFiles.length - 1 ? i + 1 : i))}
                  disabled={activeIndex === imageFiles.length - 1}
                  aria-label="Volgende foto"
                >
                  &#8594;
                </button>
              </div>
            </div>
            {/* Thumbnails */}
            <div className="flex gap-2 overflow-x-auto w-full p-2 bg-zinc-900 rounded mt-4 justify-center">
              {imageFiles.map((imageData, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveIndex(idx)}
                  className={`border-2 rounded transition focus:outline-none ${activeIndex === idx ? "border-zinc-300" : "border-transparent"}`}
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
        )}
      </main>
    </div>
  );
}
