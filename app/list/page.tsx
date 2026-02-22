"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { ConflictModal } from "@/components/conflict-modal";
import { FilterModal } from "@/components/filter-modal";
import Link from "next/link";
import CONFIG from "@/config";
import { Icon } from "@/components/icon";
import { aggregateRatings } from "@/utils/ratings-aggregator";

interface ImageData {
  fileName: string;
  thumbnailPath: string;
  originalPath: string;
}

interface Rating {
  id: string;
  rating: number | null;
  overRuleFileRating: boolean | null;
  createdAt: string;
}

export default function ListPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<ImageData[]>([]);
  const [folderPath, setFolderPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [ratings, setRatings] = useState<Map<string, Rating | null>>(new Map());
  const [exifData, setExifData] = useState<Map<string, number | null>>(new Map()); // Map of fileId to EXIF Rating
  const [rawFiles, setRawFiles] = useState<Map<string, string>>(new Map()); // Map of fileId to RAW filename
  const [hasXmpMap, setHasXmpMap] = useState<Map<string, boolean>>(new Map()); // Map of fileId to hasXmp
  const [rawExifData, setRawExifData] = useState<Map<string, number | null>>(new Map()); // Map of fileId to RAW EXIF Rating
  const [selectedConflict, setSelectedConflict] = useState<{ fileName: string; exifRating: number; dbRating: number | null } | null>(null);
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [showUnrated, setShowUnrated] = useState<boolean>(true);
  const [selectedRatings, setSelectedRatings] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [showConflictsOnly, setShowConflictsOnly] = useState<boolean>(false);

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
          fileName: fileName,
          thumbnailPath: `/api/image/${encodedThumbPath}?folderPath=${encodeURIComponent(normalizedThumbPath)}&fileName=${encodedThumbPath}`,
          originalPath: `/api/image/${encodedPath}?folderPath=${encodeURIComponent(normalizedPath)}&fileName=${encodedPath}`,
        };
      });

      setImageFiles(imageData);

      // Load batch EXIF data from localStorage
      let batchExifData: any[] = [];
      try {
        const storedExifData = localStorage.getItem(`batchExifData_${normalizedPath}`);
        if (storedExifData) {
          batchExifData = JSON.parse(storedExifData);
        }
      } catch (exifErr) {
        console.error('Failed to load batch EXIF data:', exifErr);
      }

      // Create a map of fileId -> EXIF Rating for quick lookup in conflict detection
      const exifDataMap = new Map<string, number | null>();
      for (const exifFile of batchExifData) {
        if (exifFile.FileName && exifFile.Rating != null) {
          const fileId = getFileId(exifFile.FileName);
          exifDataMap.set(fileId, exifFile.Rating);
        }
      }
      setExifData(exifDataMap);

      // Fetch ratings for this folder
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

      // Fetch RAW files from raw subfolder
      try {
        const rawResponse = await fetch('/api/raw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: normalizedPath }),
        });

        if (rawResponse.ok) {
          const rawData = await rawResponse.json();
          if (rawData.success && rawData.hasRawFolder && rawData.ratings) {
            const rawFilesMap = new Map<string, string>();
            const xmpMap = new Map<string, boolean>();
            const rawExifDataMap = new Map<string, number | null>();
            for (const rawFile of rawData.ratings) {
              if (rawFile.FileName) {
                const fileId = getFileId(rawFile.FileName);
                rawFilesMap.set(fileId, rawFile.FileName);
                if (rawFile.hasXmp !== undefined) {
                  xmpMap.set(fileId, rawFile.hasXmp);
                }
                if (rawFile.Rating != null) {
                  rawExifDataMap.set(fileId, rawFile.Rating);
                }
              }
            }
            setRawFiles(rawFilesMap);
            setHasXmpMap(xmpMap);
            setRawExifData(rawExifDataMap);
          }
        }
      } catch (rawErr) {
        console.error('Failed to fetch RAW files:', rawErr);
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

  function shouldShowImage(fileName: string): boolean {
    const fileId = getFileId(fileName);
    const ratingData = ratings.get(fileId);
    const currentRating = ratingData?.rating ?? null;

    // Check if conflicts-only filter is enabled
    if (showConflictsOnly) {
      const hasConflict = hasRatingConflict(fileName) || hasJpgRawMismatch(fileName) || hasRawRatingConflict(fileName);
      if (!hasConflict) {
        return false;
      }
    }

    // If no rating and showUnrated is true, show it
    if (currentRating === null && showUnrated) {
      return true;
    }

    // If has rating and it's in selectedRatings, show it
    if (currentRating !== null && selectedRatings.has(currentRating)) {
      return true;
    }

    return false;
  }

  const updateRatingInDatabase = useCallback(async (fileName: string, rating: number | null) => {
    try {
      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          rating,
          folderPath,
          overRuleFileRating: false,
        }),
      });

      if (response.ok) {
        const fileId = getFileId(fileName);
        setRatings(prev => {
          const newMap = new Map(prev);
          newMap.set(fileId, { id: fileId, rating, overRuleFileRating: false, createdAt: new Date().toISOString() });
          return newMap;
        });
      }
    } catch (err) {
      console.error('Failed to update rating:', err);
    }
  }, [folderPath]);

  const handleUseExifRating = useCallback(async () => {
    if (!selectedConflict) return;
    try {
      await updateRatingInDatabase(selectedConflict.fileName, selectedConflict.exifRating);
      setSelectedConflict(null);
    } catch (err) {
      console.error('Failed to use EXIF rating:', err);
    }
  }, [selectedConflict, updateRatingInDatabase]);

  const handleUseDatabaseRating = useCallback(async () => {
    if (!selectedConflict) return;
    try {
      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedConflict.fileName,
          rating: selectedConflict.dbRating,
          folderPath,
          overRuleFileRating: true,
        }),
      });

      if (response.ok) {
        const fileId = getFileId(selectedConflict.fileName);
        setRatings(prev => {
          const newMap = new Map(prev);
          newMap.set(fileId, { id: fileId, rating: selectedConflict.dbRating, overRuleFileRating: true, createdAt: new Date().toISOString() });
          return newMap;
        });
        setSelectedConflict(null);
      }
    } catch (err) {
      console.error('Failed to use database rating:', err);
    }
  }, [selectedConflict, folderPath]);

  const handleIgnoreConflict = useCallback(() => {
    setSelectedConflict(null);
  }, []);

  function renderRatingStars(fileName: string) {
    const fileId = getFileId(fileName);
    const ratingData = ratings.get(fileId);
    const currentRating = ratingData?.rating ?? null;

    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => {
              const newRating = currentRating === star ? null : star;
              updateRatingInDatabase(fileName, newRating);
            }}
            className={`text-xl transition-colors ${
              currentRating !== null && star <= currentRating
                ? 'text-yellow-400'
                : 'text-zinc-600 hover:text-zinc-500'
            }`}
            title={`Rate ${star} stars`}
          >
            ★
          </button>
        ))}
      </div>
    );
  }

  function hasRatingConflict(fileName: string): boolean {
    const fileId = getFileId(fileName);
    const exifRating = exifData.get(fileId);
    const dbRating = ratings.get(fileId)?.rating ?? null;
    const dbOverRule = ratings.get(fileId)?.overRuleFileRating ?? null;

    // Conflict exists only if file has EXIF rating AND database rating differs
    // No EXIF rating = no conflict, even if database has a rating
    if (exifRating != null && exifRating !== 0 && dbRating !== null && exifRating !== dbRating && !dbOverRule) {
      return true;
    }

    return false;
  }

  function hasRawRatingConflict(fileName: string): boolean {
    const fileId = getFileId(fileName);
    const rawRating = rawExifData.get(fileId);
    const dbRating = ratings.get(fileId)?.rating ?? null;
    const dbOverRule = ratings.get(fileId)?.overRuleFileRating ?? null;

    // Conflict exists only if RAW file has EXIF rating AND database rating differs
    // No RAW rating = no conflict, even if database has a rating
    if (rawRating != null && rawRating !== 0 && dbRating !== null && rawRating !== dbRating && !dbOverRule) {
      return true;
    }

    return false;
  }

  function hasJpgRawMismatch(fileName: string): boolean {
    const fileId = getFileId(fileName);
    const exifRating = exifData.get(fileId);
    const rawRating = rawExifData.get(fileId);
    const dbRating = ratings.get(fileId)?.rating ?? null;

    // Yellow highlight: Both JPG and RAW have valid ratings, DB has no rating, and they differ
    if (exifRating != null && exifRating !== 0 && rawRating != null && rawRating !== 0 && !dbRating && exifRating !== rawRating) {
      return true;
    }

    return false;
  }

  function hasAllRatingsMatch(fileName: string): boolean {
    const fileId = getFileId(fileName);
    const exifRating = exifData.get(fileId);
    const rawRating = rawExifData.get(fileId);
    const dbRating = ratings.get(fileId)?.rating ?? null;

    return (
      exifRating != null &&
      exifRating !== 0 &&
      rawRating != null &&
      rawRating !== 0 &&
      dbRating != null &&
      exifRating === rawRating &&
      exifRating === dbRating
    );
  }

  function hasAnyConflicts(): boolean {
    // Check if any image has a conflict
    for (const image of imageFiles) {
      if (hasRatingConflict(image.fileName) || hasRawRatingConflict(image.fileName) || hasJpgRawMismatch(image.fileName)) {
        return true;
      }
    }
    return false;
  }

  const handleApplyRatings = useCallback(async () => {
    try {
      // Transform ratings Map to match the expected format
      const dbRatingsMap = new Map();
      ratings.forEach((rating, fileId) => {
        if (rating && rating.rating !== null && rating.rating !== 0) {
          dbRatingsMap.set(fileId, { rating: rating.rating });
        }
      });

      // Filter out 0 values from JPG ratings
      const jpgRatingsMap = new Map();
      exifData.forEach((rating, fileId) => {
        if (rating !== null && rating !== 0) {
          jpgRatingsMap.set(fileId, rating);
        }
      });

      // Filter out 0 values from RAW ratings
      const rawRatingsMap = new Map();
      rawExifData.forEach((rating, fileId) => {
        if (rating !== null && rating !== 0) {
          rawRatingsMap.set(fileId, rating);
        }
      });

      console.log('DB Ratings Map:', dbRatingsMap);
      console.log('JPG Ratings Map:', jpgRatingsMap);
      console.log('RAW Ratings Map:', rawRatingsMap);

      const aggregated = aggregateRatings(dbRatingsMap, jpgRatingsMap, rawRatingsMap, hasAnyConflicts());
      
      console.log('Aggregated ratings to apply:', aggregated);

      const response = await fetch('/api/set-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...aggregated,
          folderPath,
        }),
      });

      if (response.ok) {
        console.log('Ratings applied successfully');
      } else {
        const errorData = await response.json();
        console.error('Failed to apply ratings:', errorData);
      }
      
    } catch (err) {
      console.error('Failed to apply ratings:', err);
    }
  }, [ratings, exifData, rawExifData, imageFiles, folderPath]);

  function renderConflictIndicator(fileName: string) {
    const fileId = getFileId(fileName);
    const exifRating = exifData.get(fileId);
    const dbRating = ratings.get(fileId)?.rating ?? null;
    const dbOverRule = ratings.get(fileId)?.overRuleFileRating ?? null;
    
    // No ratings at all (neither EXIF nor DB) = no conflict, show "No rating"
    if (!dbRating && !exifRating) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <div className="text-zinc-500 text-xs">
            No rating
          </div>
        </div>
      )
    }

    // Ratings differ = conflict
    if ((dbRating && exifRating) && exifRating !== dbRating && !dbOverRule) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <button
            onClick={() => setSelectedConflict({ fileName, exifRating, dbRating })}
            className="px-2 py-1 bg-red-950 text-red-400 text-xs rounded border border-red-700 hover:bg-red-900 transition cursor-pointer"
          >
            ≠ Conflict
          </button>
          <div className="text-zinc-500 text-xs">
            JPG: {exifRating} ★ / DB: {dbRating} ★
          </div>
        </div>
      );
    }
    
    // Ratings differ = conflict
    if ((dbRating && exifRating) && exifRating !== dbRating && dbOverRule) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <div className="px-2 py-1 text-gray-400 text-xs rounded border border-white-700">
            ✓ Resolved
          </div>
          <div className="text-zinc-500 text-xs">
            JPG: {exifRating} ★ / DB: {dbRating} ★
          </div>
        </div>
      );
    }

    // No conflict (either no DB rating, or ratings match)
    if ((dbRating && exifRating) && exifRating === dbRating) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <div className="px-2 py-1 bg-green-950 text-green-400 text-xs rounded border border-green-700">
            = match
          </div>
          <div className="text-zinc-500 text-xs">
            JPG: {exifRating} ★ / DB: {dbRating} ★
          </div>
        </div>
      )
    }
    
    // No conflict (either no DB rating, or ratings match)
    if ((dbRating && !exifRating)) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <div className="px-2 py-1 text-gray-400 text-xs rounded border border-white-700">
            ✓ db only
          </div>
          <div className="text-zinc-500 text-xs">
            JPG: {exifRating} ★ / DB: {dbRating} ★
          </div>
        </div>
      )
    }
    
    // No conflict (either no DB rating, or ratings match)
    return (
      <div className="flex items-center gap-2 flex-col">
        <div className="px-2 py-1 text-gray-400 text-xs rounded border border-white-700">
          file only
        </div>
        <div className="text-zinc-500 text-xs">
          JPG: {exifRating} ★ / DB: {dbRating} ★
        </div>
      </div>
    )
  }

  function renderRawConflictIndicator(fileName: string) {
    const fileId = getFileId(fileName);
    const rawRating = rawExifData.get(fileId);
    const dbRating = ratings.get(fileId)?.rating ?? null;
    const dbOverRule = ratings.get(fileId)?.overRuleFileRating ?? null;
    
    // No ratings at all (neither RAW nor DB) = no conflict, show "No rating"
    if (!dbRating && !rawRating) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <div className="text-zinc-500 text-xs">
            No rating
          </div>
        </div>
      )
    }

    // Ratings differ = conflict
    if ((dbRating && rawRating) && rawRating !== dbRating && !dbOverRule) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <button
            onClick={() => setSelectedConflict({ fileName, exifRating: rawRating, dbRating })}
            className="px-2 py-1 bg-red-950 text-red-400 text-xs rounded border border-red-700 hover:bg-red-900 transition cursor-pointer"
          >
            ≠ Conflict
          </button>
          <div className="text-zinc-500 text-xs">
            RAW: {rawRating} ★ / DB: {dbRating} ★
          </div>
        </div>
      );
    }
    
    // Ratings differ but overruled = resolved
    if ((dbRating && rawRating) && rawRating !== dbRating && dbOverRule) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <div className="px-2 py-1 text-gray-400 text-xs rounded border border-white-700">
            ✓ Resolved
          </div>
          <div className="text-zinc-500 text-xs">
            RAW: {rawRating} ★ / DB: {dbRating} ★
          </div>
        </div>
      );
    }

    // No conflict (ratings match)
    if ((dbRating && rawRating) && rawRating === dbRating) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <div className="px-2 py-1 bg-green-950 text-green-400 text-xs rounded border border-green-700">
            = match
          </div>
          <div className="text-zinc-500 text-xs">
            RAW: {rawRating} ★ / DB: {dbRating} ★
          </div>
        </div>
      )
    }
    
    // Only DB rating (no RAW rating)
    if ((dbRating && !rawRating)) {
      return (
        <div className="flex items-center gap-2 flex-col">
          <div className="px-2 py-1 text-gray-400 text-xs rounded border border-white-700">
            ✓ db only
          </div>
          <div className="text-zinc-500 text-xs">
            RAW: {rawRating} ★ / DB: {dbRating} ★
          </div>
        </div>
      )
    }
    
    // Only RAW rating (no DB rating)
    return (
      <div className="flex items-center gap-2 flex-col">
        <div className="px-2 py-1 text-gray-400 text-xs rounded border border-white-700">
          file only
        </div>
        <div className="text-zinc-500 text-xs">
          RAW: {rawRating} ★ / DB: {dbRating} ★
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-black font-sans">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-zinc-400">Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black font-sans">
      <Header 
        folderName={folderName}
        title={folderPath}
      >
        <div className="flex items-center gap-4">
          <div className="text-zinc-400 text-sm">{imageFiles.filter(img => shouldShowImage(img.fileName)).length} / {imageFiles.length} images</div>
          <button
            className="header-button"
            onClick={() => setShowFilterModal(true)}
            title="Filter images by rating"
          >
            <Icon name="filter_list" />
          </button>
          <button
            className={`header-button ${hasAnyConflicts() ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleApplyRatings}
            disabled={hasAnyConflicts()}
            title={hasAnyConflicts() ? 'Cannot apply ratings with conflicts' : 'Apply ratings'}
          >
            Apply
          </button>
        </div>
      </Header>

      <main className="flex-1 px-6 py-6">
        {error ? (
          <div className="text-red-500 text-center py-8">{error}</div>
        ) : imageFiles.length === 0 ? (
          <div className="text-zinc-400 text-center py-8">No images found</div>
        ) : (
          <div className="overflow-x-auto w-8/12 mx-auto rounded border border-zinc-700">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left py-3 px-4 text-zinc-300 font-semibold w-24">Thumbnail</th>
                  <th className="text-left py-3 px-4 text-zinc-300 font-semibold w-48">Filename</th>
                  <th className="text-left py-3 px-4 text-zinc-300 font-semibold">RAW</th>
                  <th className="text-center py-3 px-4 text-zinc-300 font-semibold w-40">DB Rating</th>
                  <th className="text-center py-3 px-4 text-zinc-300 font-semibold w-56">JPG Conflict</th>
                  <th className="text-center py-3 px-4 text-zinc-300 font-semibold w-56">RAW Conflict</th>
                </tr>
              </thead>
              <tbody>
                {imageFiles.filter(image => shouldShowImage(image.fileName)).map((image, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-zinc-800 hover:bg-zinc-900 transition ${
                      hasAllRatingsMatch(image.fileName)
                        ? 'bg-green-950 bg-opacity-20'
                        : hasRatingConflict(image.fileName) || hasJpgRawMismatch(image.fileName)
                          ? 'bg-red-950 bg-opacity-20 conflict'
                          : 'no-conflict'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="w-20 h-20 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                        <img
                          src={image.thumbnailPath}
                          alt={image.fileName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-zinc-300 text-sm break-all">
                      {image.fileName}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-sm">
                      {rawFiles.get(getFileId(image.fileName)) ? (
                        <div className="flex items-center gap-2">
                          <span>{rawFiles.get(getFileId(image.fileName))}</span>
                          {hasXmpMap.get(getFileId(image.fileName)) && (
                            <Icon name="settings_photo_camera" size={16} />
                          )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {renderRatingStars(image.fileName)}
                    </td>
                    <td className="py-3 px-4">
                      {renderConflictIndicator(image.fileName)}
                    </td>
                    <td className="py-3 px-4">
                      {renderRawConflictIndicator(image.fileName)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <ConflictModal
        isOpen={selectedConflict !== null}
        conflictData={selectedConflict}
        onUseExifRating={handleUseExifRating}
        onUseDatabaseRating={handleUseDatabaseRating}
        onIgnore={handleIgnoreConflict}
      />

      <FilterModal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        showUnrated={showUnrated}
        setShowUnrated={setShowUnrated}
        selectedRatings={selectedRatings}
        setSelectedRatings={setSelectedRatings}
        conflictOption={true}
        showConflictsOnly={showConflictsOnly}
        setShowConflictsOnly={setShowConflictsOnly}
      />
    </div>
  );
}
