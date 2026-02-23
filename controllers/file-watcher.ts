import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import chokidar, { FSWatcher } from 'chokidar';
import sharp from 'sharp';
import CONFIG from '@/config';
import { getRating } from './database';

// Supported image extensions
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

interface FileWatcherCallbacks {
  onFileAdded?: (fileName: string, hasRating?: boolean) => void;
  onFileChanged?: (fileName: string) => void;
  onFileDeleted?: (fileName: string) => void;
  onThumbnailProgress?: (processed: number, total: number) => void;
  onThumbnailCreated?: (fileName: string) => void;
  onThumbnailDeleted?: (fileName: string) => void;
  onError?: (error: Error) => void;
}

export interface FileChangeEvent {
  type: 'added' | 'changed' | 'deleted';
  fileName: string;
  hasRating?: boolean;
}

class FileWatcher {
  private watcher: FSWatcher | null = null;
  private folderPath: string;
  private thumbsPath: string;
  private callbacks: Required<FileWatcherCallbacks>;

  constructor(folderPath: string, callbacks: FileWatcherCallbacks = {}) {
    this.folderPath = folderPath;
    this.thumbsPath = path.join(folderPath, CONFIG.NPO_FOLDER, CONFIG.THUMBNAILS_FOLDER);
    this.callbacks = {
      onFileAdded: callbacks.onFileAdded || (() => {}),
      onFileChanged: callbacks.onFileChanged || (() => {}),
      onFileDeleted: callbacks.onFileDeleted || (() => {}),
      onThumbnailProgress: callbacks.onThumbnailProgress || (() => {}),
      onThumbnailCreated: callbacks.onThumbnailCreated || (() => {}),
      onThumbnailDeleted: callbacks.onThumbnailDeleted || (() => {}),
      onError: callbacks.onError || ((error) => console.error('FileWatcher Error:', error)),
    };
  }

  /**
   * Start watching the folder and begin processing existing images
   */
  async start(): Promise<void> {
    try {
      // Ensure thumbnails folder exists
      await fs.mkdir(this.thumbsPath, { recursive: true });

      // Start the chokidar watcher
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
        ignoreInitial: true,
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

      console.log(`FileWatcher started for: ${this.folderPath}`);
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
      console.log('FileWatcher stopped');
    }
  }

  /**
   * Process all existing images in the folder and generate thumbnails
   * Returns the total number of images and list of filenames
   */
  async processExistingImages(): Promise<{ total: number; files: string[]; existingThumbnails: number }> {
    try {
      // Ensure thumbnails folder exists
      await fs.mkdir(this.thumbsPath, { recursive: true });

      // Get all files in the folder
      const files = await fs.readdir(this.folderPath);
      const imageFiles = files.filter((file) => this.isSupportedImage(file));

      // Count existing thumbnails
      let existingThumbnails = 0;
      for (const file of imageFiles) {
        const thumbName = this.getThumbnailFilename(file);
        const thumbPath = path.join(this.thumbsPath, thumbName);
        try {
          await fs.access(thumbPath);
          existingThumbnails++;
        } catch {
          // Thumbnail doesn't exist
        }
      }

      // Send initial progress with existing thumbnails
      if (imageFiles.length > 0) {
        this.callbacks.onThumbnailProgress(existingThumbnails, imageFiles.length);
      }

      // Process images that don't have thumbnails
      let processed = existingThumbnails;
      for (const file of imageFiles) {
        const thumbName = this.getThumbnailFilename(file);
        const thumbPath = path.join(this.thumbsPath, thumbName);

        try {
          // Check if thumbnail already exists
          await fs.access(thumbPath);
          // Thumbnail exists, skip
        } catch {
          // Thumbnail doesn't exist, create it
          const filepath = path.join(this.folderPath, file);
          await this.createThumbnail(filepath);
          processed++;
          this.callbacks.onThumbnailCreated(file);
          this.callbacks.onThumbnailProgress(processed, imageFiles.length);
        }
      }

      return { total: imageFiles.length, files: imageFiles, existingThumbnails };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onError(err);
      throw err;
    }
  }

  /**
   * Handle file addition event
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
   * Handle file change event
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
   * Handle file deletion event
   */
  private async handleFileDelete(filepath: string): Promise<void> {
    const filename = path.basename(filepath);

    if (!this.isSupportedImage(filename)) {
      return;
    }

    try {
      // Delete thumbnail
      await this.deleteThumbnail(filename);
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

    // Skip if thumbnail already exists
    if (fsSync.existsSync(thumbPath)) {
      return;
    }

    try {
      await sharp(filepath)
        .resize(CONFIG.THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
        .toFile(thumbPath);

      console.log(`Thumbnail created: ${thumbName}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw err;
    }
  }

  /**
   * Delete a thumbnail
   */
  private async deleteThumbnail(filename: string): Promise<void> {
    const thumbName = this.getThumbnailFilename(filename);
    const thumbPath = path.join(this.thumbsPath, thumbName);

    try {
      if (fsSync.existsSync(thumbPath)) {
        await fs.unlink(thumbPath);
        console.log(`Thumbnail deleted: ${thumbName}`);
        this.callbacks.onThumbnailDeleted(filename);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw err;
    }
  }

  /**
   * Check if file is a supported image
   */
  private isSupportedImage(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  /**
   * Get thumbnail filename from original filename
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

export default FileWatcher;
export type { FileWatcherCallbacks };
