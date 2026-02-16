import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getExifJson, getBatchExifJson } from '@/controllers/exiftool';

export async function POST(request: NextRequest) {
  try {
    const { folderPath, fileName, action } = await request.json();

    // Batch EXIF extraction for all files in a folder
    if (action === 'batch') {
      if (!folderPath) {
        return NextResponse.json(
          { error: 'Folder path is required' },
          { status: 400 }
        );
      }

      console.log('Extracting batch EXIF data from:', folderPath);

      const exifData = await getBatchExifJson(folderPath);

      return NextResponse.json({
        success: true,
        exifData: exifData,
      });
    }

    // Single file EXIF extraction
    if (!folderPath || !fileName) {
      return NextResponse.json(
        { error: 'Folder path and file name are required' },
        { status: 400 }
      );
    }

    const filePath = path.join(folderPath, fileName);
    
    console.log('Extracting EXIF data from:', folderPath, fileName, filePath);
    
    getExifJson(filePath);
    const exifData = (await getExifJson(filePath)).pop();

    return NextResponse.json({
      success: true,
      exifData: exifData,
    });
  } catch (error) {
    console.error('EXIF extraction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract EXIF data' },
      { status: 500 }
    );
  }
}