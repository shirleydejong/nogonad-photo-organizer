import path from 'path';
import fs from 'fs/promises';
import chokidar, { FSWatcher } from 'chokidar';
import sharp from 'sharp';
import CONFIG from '@/config';
import { getRating } from './database';

// Supported image extensions
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

interface WatcherCallbacks {
  onFileAdded?: (fileName: string, hasRating: boolean) => void;
  onFileChanged?: (fileName: string) => void;
  onFileDeleted?: (fileName: string) => void;
  onError?: (error: Error) => void;
}

export interface FileChangeEvent {
  type: 'added' | 'changed' | 'deleted';
  fileName: string;
  hasRating?: boolean;
}

class FolderWatcher {
  private watcher: FSWatcher | null = null;
  private folderPath: string;
  private thumbsPath: string;
  private callbacks: Required<WatcherCallbacks>;

  constructor(folderPath: string, callbacks: WatcherCallbacks = {}) {
    this.folderPath = folderPath;
    this.thumbsPath = path.join(folderPath, CONFIG.NPO_FOLDER, CONFIG.THUMBNAILS_FOLDER);
    this.callbacks = {
      onFileAdded: callbacks.onFileAdded || (() => {}),
      onFileChanged: callbacks.onFileChanged || (() => {}),
      onFileDeleted: callbacks.onFileDeleted || (() => {}),
      onError: callbacks.onError || ((error) => console.error('FolderWatcher Error:', error)),
    };
  }

  /**
   * Start watching the folder
   */
  async start(): Promise<void> {
    try {
      // Ensure thumbnails folder exists
      await fs.mkdir(this.thumbsPath, { recursive: true });

      // Start the watcher
      this.watcher = chokidar.watch(this.folderPath, {
        ignored: [
          (filepath: string) => {
            // Ignore the _npo folder and its contents
            const relativePath = path.relative(this.folderPath, filepath);
            return relativePath.startsWith(CONFIG.NPO_FOLDER);
          },
          /node_modules/,
        ],
        persistent: true,
        ignoreInitial: true, // Don't trigger events for existing files
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100,
        },
      });

      this.watcher.on('add', (filepath: string) => this.handleFileAdd(filepath));
      this.watcher.on('change', (filepath: string) => this.handleFileChange(filepath));
      this.watcher.on('unlink', (filepath: string) => this.handleFileDelete(filepath));
      this.watcher.on('error', (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.callbacks.onError(err);
      });

      console.log(`FolderWatcher started for: ${this.folderPath}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onError(err);
      throw err;
    }
  }

  /**
   * Stop the file watcher
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      console.log('FolderWatcher stopped');
    }
  }

  /**
   * Handle file addition
   */
  private async handleFileAdd(filepath: string): Promise<void> {
    const filename = path.basename(filepath);
    
    if (!this.isSupportedImage(filename)) {
      return;
    }

    try {
      // Create thumbnail
      await this.createThumbnail(filepath);

      // Check if file has a rating
      const fileId = this.getFileId(filename);
      const rating = getRating(fileId, this.folderPath);
      const hasRating = rating !== null && rating !== undefined && rating >= 1;

      this.callbacks.onFileAdded(filename, hasRating);
    } catch (error) {
      console.error(`Error handling file add for ${filename}:`, error);
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle file change
   */
  private async handleFileChange(filepath: string): Promise<void> {
    const filename = path.basename(filepath);
    
    if (!this.isSupportedImage(filename)) {
      return;
    }

    try {
      // Regenerate thumbnail
      await this.createThumbnail(filepath);

      this.callbacks.onFileChanged(filename);
    } catch (error) {
      console.error(`Error handling file change for ${filename}:`, error);
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle file deletion
   */
  private async handleFileDelete(filepath: string): Promise<void> {
    const filename = path.basename(filepath);
    
    if (!this.isSupportedImage(filename)) {
      return;
    }

    try {
      // Delete thumbnail
      const thumbName = this.getThumbnailFilename(filename);
      const thumbPath = path.join(this.thumbsPath, thumbName);
      
      try {
        await fs.unlink(thumbPath);
      } catch (err) {
        // Thumbnail might not exist, ignore error
      }

      this.callbacks.onFileDeleted(filename);
    } catch (error) {
      console.error(`Error handling file delete for ${filename}:`, error);
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Create thumbnail for an image
   */
  private async createThumbnail(filepath: string): Promise<void> {
    const filename = path.basename(filepath);
    const thumbName = this.getThumbnailFilename(filename);
    const thumbPath = path.join(this.thumbsPath, thumbName);

    await sharp(filepath)
      .resize(CONFIG.THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
      .toFile(thumbPath);

    console.log(`Thumbnail created: ${thumbName}`);
  }

  /**
   * Check if a file is a supported image
   */
  private isSupportedImage(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Get thumbnail filename
   */
  private getThumbnailFilename(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return filename + CONFIG.THUMBNAIL_SUFFIX;
    return filename.substring(0, lastDot) + CONFIG.THUMBNAIL_SUFFIX + filename.substring(lastDot);
  }

  /**
   * Get file ID (filename without extension)
   */
  private getFileId(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return filename;
    return filename.substring(0, lastDot);
  }
}

export default FolderWatcher;
