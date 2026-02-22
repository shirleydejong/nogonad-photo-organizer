import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { upsertRating, resetOverRuleFlag } from '@/controllers/database';
import { updateRatings, RatingUpdateJob } from '@/controllers/exiftool';
import config from '@/config';

export interface AggregatedRatings {
  dbRatings: Array<{ fileName: string; rating: number }>;
  jpgRatings: Array<{ fileName: string; rating: number }>;
  rawRatings: Array<{ fileName: string; rating: number }>;
}

const RAW_EXTENSIONS = ['.raw', '.dng', '.nef', '.cr2', '.crw', '.arw', '.raf', '.rw2', '.orf', '.pef'];
const JPG_EXTENSIONS = ['.jpg', '.jpeg'];

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find all variants of a file with different extensions
 */
async function findFileVariants(folderPath: string, baseName: string, extensions: string[], subfolder?: string): Promise<string[]> {
  const searchPath = subfolder ? path.join(folderPath, subfolder) : folderPath;
  const variants: string[] = [];
  for (const ext of extensions) {
    const filePath = path.join(searchPath, baseName + ext);
    if (await fileExists(filePath)) {
      variants.push(filePath);
    }
  }
  return variants;
}

/**
 * Get the base name without extension from a filename
 */
function getBaseName(fileName: string): string {
  return path.parse(fileName).name;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as AggregatedRatings & { folderPath?: string };
    const { dbRatings = [], jpgRatings = [], rawRatings = [], folderPath } = body;

    if (!folderPath) {
      return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
    }

    const updateJobs: RatingUpdateJob[] = [];
    let dbUpdatesCount = 0;
    let fileUpdatesCount = 0;

    // 1. dbRatings: Apply to JPG and RAW files (not to database, already there)
    for (const rating of dbRatings) {
      const baseName = getBaseName(rating.fileName);
      
      // Find all JPG and RAW variants
      const jpgFiles = await findFileVariants(folderPath, baseName, JPG_EXTENSIONS);
      const rawFiles = await findFileVariants(folderPath, baseName, RAW_EXTENSIONS, config.RAW_FOLDER);
      
      // Add update jobs for all found files
      for (const filePath of [...jpgFiles, ...rawFiles]) {
        updateJobs.push({ filePath, rating: rating.rating });
      }
    }

    // 2. jpgRatings: Apply to RAW files and update database
    for (const rating of jpgRatings) {
      const baseName = getBaseName(rating.fileName);
      
      // Find RAW variants
      const rawFiles = await findFileVariants(folderPath, baseName, RAW_EXTENSIONS, config.RAW_FOLDER);
      
      // Add update jobs for RAW files
      for (const filePath of rawFiles) {
        updateJobs.push({ filePath, rating: rating.rating });
      }
      
      // Update database
      try {
        upsertRating(rating.fileName, folderPath, rating.rating, false);
        dbUpdatesCount++;
      } catch (err) {
        console.error(`Failed to update database for ${rating.fileName}:`, err);
      }
    }

    // 3. rawRatings: Apply to JPG files and update database
    for (const rating of rawRatings) {
      const baseName = getBaseName(rating.fileName);
      
      // Find JPG variants
      const jpgFiles = await findFileVariants(folderPath, baseName, JPG_EXTENSIONS);
      
      // Add update jobs for JPG files
      for (const filePath of jpgFiles) {
        updateJobs.push({ filePath, rating: rating.rating });
      }
      
      // Update database
      try {
        upsertRating(rating.fileName, folderPath, rating.rating, false);
        dbUpdatesCount++;
      } catch (err) {
        console.error(`Failed to update database for ${rating.fileName}:`, err);
      }
    }

    // Apply all file updates in batch
    if (updateJobs.length > 0) {
      const results = await updateRatings(updateJobs);
      fileUpdatesCount = results.filter(r => r.success).length;
      
      // Log any failures
      results.filter(r => !r.success).forEach(r => {
        console.error(`Failed to update ${r.filePath}: ${r.error}`);
      });
    }

    // Reset overrule flags after all ratings have been applied
    resetOverRuleFlag(folderPath);

    return NextResponse.json({
      success: true,
      message: `Applied ${dbUpdatesCount} database updates and ${fileUpdatesCount} file updates`,
      dbUpdatesCount,
      fileUpdatesCount,
      dbRatingsCount: dbRatings.length,
      jpgRatingsCount: jpgRatings.length,
      rawRatingsCount: rawRatings.length,
    });

  } catch (error) {
    console.error('Set ratings API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
