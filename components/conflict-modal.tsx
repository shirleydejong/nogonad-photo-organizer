"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

interface ConflictModalProps {
  isOpen: boolean;
  conflictData: {
    fileName: string;
    exifRating: number;
    dbRating: number | null;
    newRating: number | null;
  } | null;
  onUseNewRating: () => void;
  onUseExifRating: () => void;
  onUseDatabaseRating: () => void;
  onIgnore: () => void;
}

export function ConflictModal({
  isOpen,
  conflictData,
  onUseNewRating,
  onUseExifRating,
  onUseDatabaseRating,
  onIgnore,
}: ConflictModalProps) {
  const [hoveredButton, setHoveredButton] = useState<'new' | 'exif' | 'db' | 'ignore' | null>(null);

  if (!isOpen || !conflictData) return null;

  const hasNewRating = conflictData.newRating !== null;
  const displayDbRating = hasNewRating ? conflictData.newRating : conflictData.dbRating;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-lg shadow-2xl max-w-[800px] w-8/12 p-6 border border-zinc-700">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <Icon name="warning" />
          </div>
          <div className="flex-1">
            <h3 className="text-zinc-100 font-semibold text-lg mb-1">Rating conflict</h3>
            <p className="text-zinc-400 text-sm">
              The rating in the EXIF data (image) doesn't match the rating in the database.
            </p>
          </div>
        </div>

        <div className="bg-zinc-800/50 rounded p-4 mb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">File:</span>
            <span className="text-zinc-100 font-mono text-xs">{conflictData.fileName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">EXIF rating (file):</span>
            <span className="text-zinc-100 font-semibold">{conflictData.exifRating} ⭐</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Database rating:</span>
            <span className="text-zinc-100 font-semibold">{displayDbRating} ⭐</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
              onMouseEnter={() => setHoveredButton('exif')}
              onMouseLeave={() => setHoveredButton(null)}
              onClick={onUseExifRating}
            >
              Copy EXIF rating to database ({conflictData.exifRating} ⭐)
            </button>
            <button
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
              onMouseEnter={() => setHoveredButton('db')}
              onMouseLeave={() => setHoveredButton(null)}
              onClick={hasNewRating ? onUseNewRating : onUseDatabaseRating}
            >
              Use database rating ({displayDbRating} ⭐)
            </button>
          </div>
          <button
            className="w-full px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded font-medium transition"
            onMouseEnter={() => setHoveredButton('ignore')}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={onIgnore}
          >
            {hasNewRating ? 'Cancel' : 'Ignore'}
          </button>
        </div>
        <p className="text-zinc-400 text-sm pt-4 h-12">
          {hoveredButton === 'exif' && 'The rating in the database will be overwritten with the EXIF rating from the image file.'}
          {hoveredButton === 'db' && 'The database rating will be retained and marked as authoritative. Future changes in the image EXIF data will be ignored.'}
          {hoveredButton === 'ignore' && hasNewRating && 'Cancel and don\'t change the rating.'}
          {hoveredButton === 'ignore' && !hasNewRating && 'Close this window without making any changes. The notification will appear again on the next visit.'}
          {!hoveredButton && ''}
        </p>
      </div>
    </div>
  );
}
