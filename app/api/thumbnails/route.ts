import { NextRequest, NextResponse } from 'next/server';
import ImageWatcher from '@/controllers/image-processor';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import CONFIG from '@/config';

// In-memory progress tracking
const progressStore = new Map<string, { total: number; processed: number; files: string[] }>();

function getThumbnailFilename(filename: string): string {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);
  return `${name}-thumb${ext}`;
}

async function countExistingThumbnails(folderPath: string): Promise<number> {
  try {
    const thumbsPath = path.join(folderPath, CONFIG.THUMBNAILS_FOLDER);
    if (!fsSync.existsSync(thumbsPath)) {
      return 0;
    }
    const files = await fs.readdir(thumbsPath);
    return files.length;
  } catch {
    return 0;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { folderPath, action } = await request.json();

    if (!folderPath) {
      return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
    }

    if (action === 'start') {
      // Count how many images there are
      const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
      const files = await fs.readdir(folderPath);
      const imageFiles = files.filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return SUPPORTED_EXTENSIONS.includes(ext);
      });

      // Count existing thumbnails
      const existingThumbnailCount = await countExistingThumbnails(folderPath);

      // Initialize progress - start with existing thumbnails
      progressStore.set(folderPath, {
        total: imageFiles.length,
        processed: existingThumbnailCount,
        files: imageFiles,
      });

      // Start thumbnail generation in the background
      setTimeout(async () => {
        try {
          const watcher = new ImageWatcher({
            sourcePath: folderPath,
            onThumbnailCreated: (filename) => {
              const progress = progressStore.get(folderPath);
              if (progress) {
                progress.processed++;
                progressStore.set(folderPath, progress);
              }
            },
            onError: (error) => {
              console.error('Thumbnail error:', error);
            },
          });

          await watcher.start();
          await watcher.stop();
        } catch (error) {
          console.error('Background thumbnail generation error:', error);
        }
      }, 0);

      return NextResponse.json({
        success: true,
        total: imageFiles.length,
        files: imageFiles,
      });
    } else if (action === 'progress') {
      const progress = progressStore.get(folderPath);
      if (!progress) {
        return NextResponse.json({ error: 'No progress found' }, { status: 404 });
      }

      return NextResponse.json({
        total: progress.total,
        processed: progress.processed,
        percentage: progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folderPath = searchParams.get('folderPath');
    const fileName = searchParams.get('fileName');

    if (!folderPath || !fileName) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const fileBuffer = await fs.readFile(path.join(folderPath, fileName));

    // Determine content type based on extension
    const ext = path.extname(fileName).toLowerCase();
    const contentType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    }[ext] || 'image/jpeg';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=6000',
      },
    });
  } catch (error) {
    console.error('Thumbnail fetch error:', error);
    return NextResponse.json(
      { error: 'Thumbnail not found' },
      { status: 404 }
    );
  }
}
