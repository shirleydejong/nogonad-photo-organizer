import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import chokidar from 'chokidar';
import sharp from 'sharp';
import CONFIG from '@/config';

// Ondersteunde afbeeldingsextensies
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

interface WatcherConfig {
  sourcePath: string;
  onError?: (error: Error) => void;
  onThumbnailCreated?: (filename: string) => void;
  onThumbnailDeleted?: (filename: string) => void;
}

class ImageWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private sourcePath: string;
  private thumbsPath: string;
  private config: Required<WatcherConfig>;

  constructor(config: WatcherConfig) {
    this.sourcePath = config.sourcePath;
    this.thumbsPath = path.join(config.sourcePath, CONFIG.THUMBNAILS_FOLDER);
    this.config = {
      ...config,
      onError: config.onError || ((error) => console.error('ImageWatcher Error:', error)),
      onThumbnailCreated: config.onThumbnailCreated || (() => {}),
      onThumbnailDeleted: config.onThumbnailDeleted || (() => {}),
    };
  }

  /**
   * Start de file watcher
   */
  async start(): Promise<void> {
    try {
      // Zorg ervoor dat de thumbnails map bestaat
      await fs.mkdir(this.thumbsPath, { recursive: true });

      // Verwerk bestaande afbeeldingen
      await this.processExistingImages();

      // Start de watcher
      this.watcher = chokidar.watch(this.sourcePath, {
        ignored: [
          (filepath: string) => {
            const filename = path.basename(filepath);
            // Negeer de thumbs map zelf
            return filepath.includes(CONFIG.THUMBNAILS_FOLDER);
          },
          /node_modules/,
          /\./,
        ],
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100,
        },
      });

      this.watcher.on('add', (filepath) => this.handleFileAdd(filepath));
      this.watcher.on('change', (filepath) => this.handleFileChange(filepath));
      this.watcher.on('unlink', (filepath) => this.handleFileDelete(filepath));
      this.watcher.on('error', (error) => this.config.onError(error));

      console.log(`ImageWatcher gestart voor: ${this.sourcePath}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.config.onError(err);
      throw err;
    }
  }

  /**
   * Stop de file watcher
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      console.log('ImageWatcher gestopt');
    }
  }

  /**
   * Verwerk alle bestaande afbeeldingen in de map
   */
  private async processExistingImages(): Promise<void> {
    try {
      const files = await fs.readdir(this.sourcePath);

      for (const file of files) {
        const filepath = path.join(this.sourcePath, file);
        const stat = await fs.stat(filepath);

        if (stat.isFile() && this.isSupportedImage(file)) {
          await this.createThumbnail(filepath);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.config.onError(err);
    }
  }

  /**
   * Handle when a file is added
   */
  private async handleFileAdd(filepath: string): Promise<void> {
    const filename = path.basename(filepath);

    if (!this.isSupportedImage(filename)) {
      return;
    }

    try {
      await this.createThumbnail(filepath);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.config.onError(err);
    }
  }

  /**
   * Handle when a file is changed
   */
  private async handleFileChange(filepath: string): Promise<void> {
    const filename = path.basename(filepath);

    if (!this.isSupportedImage(filename)) {
      return;
    }

    try {
      // Verwijder de oude thumbnail en maak een nieuwe
      await this.deleteThumbnail(filename);
      await this.createThumbnail(filepath);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.config.onError(err);
    }
  }

  /**
   * Handle when a file is deleted
   */
  private async handleFileDelete(filepath: string): Promise<void> {
    const filename = path.basename(filepath);

    if (!this.isSupportedImage(filename)) {
      return;
    }

    try {
      await this.deleteThumbnail(filename);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.config.onError(err);
    }
  }

  /**
   * Maak een thumbnail van een afbeelding
   */
  private async createThumbnail(filepath: string): Promise<void> {
    const filename = path.basename(filepath);
    const thumbnailFilename = this.getThumbnailFilename(filename);
    const thumbnailPath = path.join(this.thumbsPath, thumbnailFilename);

    // Check of thumbnail al bestaat
    if (fsSync.existsSync(thumbnailPath)) {
      return;
    }

    try {
      // Maak thumbnail met sharp
      await sharp(filepath)
        .resize(CONFIG.THUMBNAIL_WIDTH, CONFIG.THUMBNAIL_WIDTH, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toFile(thumbnailPath);

      console.log(`Thumbnail gemaakt: ${thumbnailFilename}`);
      this.config.onThumbnailCreated(thumbnailFilename);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw err;
    }
  }

  /**
   * Verwijder een thumbnail
   */
  private async deleteThumbnail(filename: string): Promise<void> {
    const thumbnailFilename = this.getThumbnailFilename(filename);
    const thumbnailPath = path.join(this.thumbsPath, thumbnailFilename);

    try {
      if (fsSync.existsSync(thumbnailPath)) {
        await fs.unlink(thumbnailPath);
        console.log(`Thumbnail verwijderd: ${thumbnailFilename}`);
        this.config.onThumbnailDeleted(thumbnailFilename);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw err;
    }
  }

  /**
   * Get de thumbnail bestandsnaam op basis van de originele bestandsnaam
   */
  private getThumbnailFilename(filename: string): string {
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    return `${name}${CONFIG.THUMBNAIL_SUFFIX}${ext}`;
  }

  /**
   * Check of het bestand een ondersteunde afbeelding is
   */
  private isSupportedImage(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  }
}

export default ImageWatcher;
export type { WatcherConfig };
