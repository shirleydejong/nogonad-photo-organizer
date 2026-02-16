"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import Link from "next/link";
import CONFIG from "@/config";

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
            className={`text-lg transition-colors ${
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
        <div className="text-zinc-400 text-sm">{imageFiles.length} images</div>
      </Header>

      <main className="flex-1 px-6 py-6">
        {error ? (
          <div className="text-red-500 text-center py-8">{error}</div>
        ) : imageFiles.length === 0 ? (
          <div className="text-zinc-400 text-center py-8">No images found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left py-3 px-4 text-zinc-300 font-semibold w-24">Thumbnail</th>
                  <th className="text-left py-3 px-4 text-zinc-300 font-semibold">Filename</th>
                  <th className="text-center py-3 px-4 text-zinc-300 font-semibold w-40">Rating</th>
                </tr>
              </thead>
              <tbody>
                {imageFiles.map((image, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-zinc-800 hover:bg-zinc-900 transition"
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
                    <td className="py-3 px-4 text-center">
                      {renderRatingStars(image.fileName)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
