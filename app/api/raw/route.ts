import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readdir, access } from 'fs/promises';
import { getBatchExifJson } from '@/controllers/exiftool';

export async function POST(request: NextRequest) {
  try {
    const { folderPath } = await request.json();

    if (!folderPath) {
      return NextResponse.json(
        { error: 'Folder path is required' },
        { status: 400 }
      );
    }

    // Check if the folder exists
    try {
      await access(folderPath);
    } catch {
      return NextResponse.json(
        { error: 'Folder path does not exist' },
        { status: 400 }
      );
    }

    // Look for a 'raw' subfolder (case-insensitive)
    const entries = await readdir(folderPath, { withFileTypes: true });
    const rawFolder = entries.find(
      (entry) => entry.isDirectory() && entry.name.toLowerCase() === 'raw'
    );

    if (!rawFolder) {
      return NextResponse.json({
        success: true,
        hasRawFolder: false,
        ratings: [],
      });
    }

    const rawFolderPath = path.join(folderPath, rawFolder.name);

    // Get all files in the raw folder
    const rawFiles = await readdir(rawFolderPath, { withFileTypes: true });
    
    // Filter for RAW file extensions
    const rawImageFiles = rawFiles.filter(
      (file) => {
        if (!file.isFile()) return false;
        const ext = path.extname(file.name).toLowerCase();
        return ext === '.raw' || ext === '.arw' || ext === '.dng';
      }
    );

    // If no RAW files found
    if (rawImageFiles.length === 0) {
      return NextResponse.json({
        success: true,
        hasRawFolder: true,
        rawFolderPath,
        ratings: [],
      });
    }

    console.log(`Found ${rawImageFiles.length} RAW files in:`, rawFolderPath);

    // Get EXIF data with ratings
    const exifData = await getBatchExifJson(rawFolderPath);

    // Filter only RAW file extensions from EXIF results
    const filteredExifData = exifData.filter((data) => {
      if (!data.FileName) return false;
      const ext = path.extname(data.FileName).toLowerCase();
      return ext === '.raw' || ext === '.arw' || ext === '.dng';
    });

    return NextResponse.json({
      success: true,
      hasRawFolder: true,
      rawFolderPath,
      fileCount: rawImageFiles.length,
      ratings: filteredExifData,
    });
  } catch (error) {
    console.error('RAW folder API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process RAW folder' },
      { status: 500 }
    );
  }
}
