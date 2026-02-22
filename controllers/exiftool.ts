/**
 * @fileoverview EXIF metadata extraction module
 * 
 * Provides wrappers around the exiftool command-line utility for extracting
 * and parsing EXIF metadata from image files. Supports single file queries and
 * batch processing of entire directories.
 * 
 * **Requires exiftool to be installed and available in system PATH**
 * 
 * @example
 * const exifData = await getExifJson('C:\\Photos\\vacation.jpg');
 * const allRatings = await getBatchExifJson('C:\\Photos');
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

/**
 * Spawns the exiftool process and executes EXIF extraction on a single image
 * 
 * Runs the external exiftool CLI utility with JSON output format and numeric values.
 * Returns the raw JSON string from exiftool without parsing.
 * 
 * Flags used:
 * - `-json`: Output EXIF data as JSON
 * - `-n`: Return numeric values instead of descriptions (important for programmatic parsing)
 * - `windowsHide`: Hide the process window on Windows
 * 
 * @async
 * @param {string} imagePath - Full file system path to the image file
 * @returns {Promise<string>} Raw JSON output from exiftool
 * @throws {Error} If file doesn't exist, exiftool not found, or process exits with non-zero code
 * 
 * @example
 * try {
 *   const json = await runExifTool('C:\\Photos\\image.jpg');
 *   console.log(json); // Raw JSON string
 * } catch (error) {
 *   console.error('EXIF extraction failed:', error.message);
 * }
 */
export async function runExifTool(imagePath: string): Promise<string> {
  await fs.access(imagePath);

  return new Promise((resolve, reject) => {
    const proc = spawn('exiftool', ['-json', '-n', imagePath], { windowsHide: true });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code !== 0) {
        const message = stderr.trim() || `exiftool exited with code ${code}`;
        reject(new Error(message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Extracts and parses EXIF metadata from a single image file
 * 
 * Wrapper around runExifTool() that additionally parses the JSON output
 * into JavaScript objects for easy manipulation. First element of the returned
 * array contains the metadata for the image.
 * 
 * @async
 * @param {string} imagePath - Full file system path to the image file
 * @returns {Promise<any>} Array containing parsed EXIF object (first element contains the metadata)
 * @throws {Error} If file not found, exiftool fails, or JSON parsing fails
 * 
 * @example
 * const exifData = await getExifJson('C:\\Photos\\vacation.jpg');
 * console.log(exifData[0].DateTimeOriginal); // '2024:01:15 14:30:45'
 * console.log(exifData[0].Make); // 'Canon'
 * console.log(exifData[0].LensModel); // 'EF24-70mm f/2.8L II USM'
 */
export async function getExifJson(imagePath: string): Promise<any> {
  const output = await runExifTool(imagePath);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error('Could not parse exiftool output as JSON');
  }
}

/**
 * Batch extracts EXIF metadata from all images in a folder
 * 
 * Processes an entire directory and returns EXIF data for all images found.
 * Uses selective field extraction for performance: only retrieves filename and Rating.
 * Exiftool recursively scans the folder and its subdirectories.
 * 
 * Fields extracted:
 * - `FileName`: The filename of the image
 * - `Rating`: The star rating value (typically 0-5), if present in image metadata
 * 
 * Automatically normalizes the return value as an array (exiftool returns a single
 * object if only one file is found, this function ensures it's always an array).
 * 
 * @async
 * @param {string} folderPath - Full path to the folder to scan for images
 * @returns {Promise<any[]>} Array of EXIF objects, one per image found
 * @throws {Error} If folder doesn't exist, exiftool not found, or JSON parsing fails
 * 
 * @example
 * const results = await getBatchExifJson('C:\\Photos');
 * results.forEach(image => {
 *   console.log(`${image.FileName}: Rating=${image.Rating ?? 'unrated'}`);
 * });
 * // Output:
 * // vacation1.jpg: Rating=5
 * // vacation2.jpg: Rating=3
 * // vacation3.jpg: Rating=unrated
 */
export async function getBatchExifJson(folderPath: string): Promise<any[]> {
  await fs.access(folderPath);

  return new Promise((resolve, reject) => {
    const proc = spawn('exiftool', ['-srcfile', '%d%f.xmp', '-srcfile', '%d%f.%e', '-json', '-FileName', '-Rating', folderPath], { windowsHide: true });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code !== 0) {
        const message = stderr.trim() || `exiftool exited with code ${code}`;
        reject(new Error(message));
        return;
      }
      try {
        const data = JSON.parse(stdout.trim());
        resolve(Array.isArray(data) ? data : [data]);
      } catch {
        reject(new Error('Could not parse exiftool output as JSON'));
      }
    });
  });
}

/**
 * Rating update job specification
 */
export interface RatingUpdateJob {
  filePath: string;
  rating: number;
}

/**
 * Result of a rating update operation
 */
export interface RatingUpdateResult {
  filePath: string;
  success: boolean;
  error?: string;
}

/**
 * Helper to execute exiftool with custom arguments
 * 
 * @async
 * @param {string[]} args - Arguments to pass to exiftool
 * @returns {Promise<void>} Resolves when exiftool completes successfully
 * @throws {Error} If exiftool exits with non-zero code
 */
async function executeExiftool(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('exiftool', args, { windowsHide: true });

    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code !== 0) {
        const message = stderr.trim() || `exiftool exited with code ${code}`;
        reject(new Error(message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Check if a file exists
 * 
 * @async
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} True if file exists, false otherwise
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
 * Convert star rating (0-5) to Windows RatingPercent (0-99)
 * 
 * Windows uses this mapping:
 * - 0 stars = 0%
 * - 1 star = 1%
 * - 2 stars = 25%
 * - 3 stars = 50%
 * - 4 stars = 75%
 * - 5 stars = 99%
 * 
 * @param {number} rating - Star rating (0-5)
 * @returns {number} Percentage value (0-99)
 */
function ratingToPercent(rating: number): number {
  const percentMap: { [key: number]: number } = {
    0: 0,
    1: 1,
    2: 25,
    3: 50,
    4: 75,
    5: 99
  };
  return percentMap[rating] ?? 0;
}

/**
 * Create a minimal XMP sidecar file with rating
 * 
 * Generates a valid XMP 1.0 file with the specified rating value.
 * This is used for RAW files that don't have an XMP sidecar yet.
 * 
 * @async
 * @param {string} xmpPath - Path where the XMP file should be created
 * @param {number} rating - Rating value to set (typically 0-5)
 * @returns {Promise<void>}
 * @throws {Error} If file write fails
 */
async function createMinimalXmp(xmpPath: string, rating: number): Promise<void> {
  const xmpContent = `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" x:xmptk="Nogonad Photo Gallery">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmp:Rating="${rating}"/>
  </rdf:RDF>
</x:xmpmeta>`;

  await fs.writeFile(xmpPath, xmpContent, 'utf-8');
}

/**
 * Batch update ratings for JPG files
 * 
 * Groups JPG files by rating value and executes one exiftool batch command per rating.
 * Uses `-overwrite_original_in_place` to modify files in-place without recompression.
 * This ensures that existing metadata (like gainmaps) is preserved and the file
 * structure remains unchanged except for the rating field.
 * 
 * @async
 * @param {RatingUpdateJob[]} jobs - Array of JPG file rating update jobs
 * @returns {Promise<RatingUpdateResult[]>} Update results for all files
 */
async function batchUpdateJpgRatings(jobs: RatingUpdateJob[]): Promise<RatingUpdateResult[]> {
  const results: RatingUpdateResult[] = [];

  // Group files by rating value for batch processing
  const jobsByRating = new Map<number, string[]>();

  jobs.forEach((job) => {
    if (!jobsByRating.has(job.rating)) {
      jobsByRating.set(job.rating, []);
    }
    jobsByRating.get(job.rating)!.push(job.filePath);
  });

  // Execute one exiftool command per rating value
  for (const [rating, filePaths] of jobsByRating) {
    const ratingPercent = ratingToPercent(rating);
    const cmdArgs = ['-overwrite_original_in_place', `-Rating=${rating}`, `-RatingPercent=${ratingPercent}`, '-MicrosoftPhoto:Rating=', '-MicrosoftPhoto:RatingPercent=', ...filePaths];

    try {
      await executeExiftool(cmdArgs);
      filePaths.forEach((filePath) => {
        results.push({ filePath, success: true });
      });
    } catch (error) {
      filePaths.forEach((filePath) => {
        results.push({
          filePath,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  return results;
}

/**
 * Update rating for a RAW file (via XMP sidecar only)
 * 
 * RAW files themselves are never modified. Instead, an XMP sidecar file is used:
 * - If XMP doesn't exist: creates a new minimal XMP with the rating
 * - If XMP exists: updates only the rating field, preserving other metadata
 * 
 * @async
 * @param {RatingUpdateJob} job - RAW file rating update job
 * @returns {Promise<RatingUpdateResult>} Update result for the file
 */
async function updateRawRating(job: RatingUpdateJob): Promise<RatingUpdateResult> {
  const dir = path.dirname(job.filePath);
  const fileName = path.basename(job.filePath);
  const nameWithoutExt = path.parse(fileName).name;
  const xmpPath = path.join(dir, `${nameWithoutExt}.xmp`);

  try {
    const xmpExists = await fileExists(xmpPath);

    if (!xmpExists) {
      // Create new XMP sidecar with rating
      await createMinimalXmp(xmpPath, job.rating);
    } else {
      // Update existing XMP, preserving other metadata
      const ratingPercent = ratingToPercent(job.rating);
      await executeExiftool(['-overwrite_original_in_place', `-Rating=${job.rating}`, `-RatingPercent=${ratingPercent}`, '-MicrosoftPhoto:Rating=', '-MicrosoftPhoto:RatingPercent=', xmpPath]);
    }

    return { filePath: job.filePath, success: true };
  } catch (error) {
    return {
      filePath: job.filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Batch update ratings for multiple files (JPG and RAW)
 * 
 * Intelligently processes files based on format:
 * - **JPG files**: Updated in-place with `-overwrite_original_in_place` flag.
 *   This preserves all existing metadata (including gainmaps) and avoids
 *   recompression, ensuring file integrity.
 * - **RAW files** (.raw, .dng, .nef, .cr2, .arw, etc.): Never modified directly.
 *   Instead, an XMP sidecar file is created or updated to store the rating.
 * 
 * Performance optimizations:
 * - JPG files are grouped by rating value and processed in batch commands
 * - RAW files are processed with minimal XMP operations
 * 
 * @async
 * @param {RatingUpdateJob[]} jobs - Array of files with their target ratings
 * @returns {Promise<RatingUpdateResult[]>} Results for each file update attempt
 * 
 * @example
 * const jobs = [
 *   { filePath: 'C:\\Photos\\sunset.jpg', rating: 5 },
 *   { filePath: 'C:\\Photos\\photo.cr2', rating: 3 },
 *   { filePath: 'C:\\Photos\\another.jpg', rating: 4 }
 * ];
 * const results = await updateRatings(jobs);
 * results.forEach(r => {
 *   console.log(`${r.filePath}: ${r.success ? 'OK' : r.error}`);
 * });
 */
export async function updateRatings(jobs: RatingUpdateJob[]): Promise<RatingUpdateResult[]> {
  const results: RatingUpdateResult[] = [];

  // Separate files by type
  const jpgJobs = jobs.filter((j) => /\.jpe?g$/i.test(j.filePath));
  const rawJobs = jobs.filter((j) => /\.(raw|dng|nef|cr2|crw|arw|raf|rw2|orf|pef)$/i.test(j.filePath));

  // Batch process JPG files
  if (jpgJobs.length > 0) {
    const jpgResults = await batchUpdateJpgRatings(jpgJobs);
    results.push(...jpgResults);
  }

  // Process RAW files individually (need XMP sidecar management)
  for (const job of rawJobs) {
    const result = await updateRawRating(job);
    results.push(result);
  }

  return results;
}

