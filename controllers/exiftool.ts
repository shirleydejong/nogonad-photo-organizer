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
    const proc = spawn('exiftool', ['-json', '-filename', '-Rating', folderPath], { windowsHide: true });

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