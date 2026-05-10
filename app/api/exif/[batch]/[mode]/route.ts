import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { access, readdir } from 'fs/promises';
import { getExifJson, getBatchExifJson } from '@/controllers/exiftool';
import config from '@/config';

/**
 * Batch parameter type: 'batch' for multiple files, 'single' for one file
 */
type BatchParam = 'batch' | 'single';

/**
 * Mode parameter type: 'default' for regular image files, 'raw' for RAW files in /raw subfolder
 */
type ModeParam = 'default' | 'raw';

/**
 * Returns a standardized error response in JSON format
 * @param error - Human-readable error message
 * @param batch - The batch parameter value for context
 * @param mode - The mode parameter value for context
 * @param status - HTTP status code (400, 404, 500, etc.)
 */
function jsonError(error: string, batch: string, mode: string, status: number) {
	return NextResponse.json(
		{ success: false, batch, mode, error },
		{ status }
	);
}

/**
 * Type guard to validate batch parameter
 */
function isBatchParam(value: string): value is BatchParam {
	return value === 'batch' || value === 'single';
}

/**
 * Type guard to validate mode parameter
 */
function isModeParam(value: string): value is ModeParam {
	return value === 'default' || value === 'raw';
}

/**
 * Unified EXIF data endpoint
 * 
 * Path parameters:
 * - :batch - 'batch' for multiple files or 'single' for one file
 * - :mode - 'default' for regular images in folderPath, or 'raw' for RAW files in a /raw subfolder
 * 
 * Query parameters:
 * - folderPath (required) - Base folder path to scan
 * - file/fileName (optional) - Specific filename when batch='single'
 * 
 * Examples:
 * GET /api/exif/batch/default?folderPath=C:\Photos
 * GET /api/exif/batch/raw?folderPath=C:\Photos
 * GET /api/exif/single/default?folderPath=C:\Photos&file=photo.jpg
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ batch: string; mode: string }> }
) {
	try {
		const { batch: rawBatch, mode: rawMode } = await params;
		const batch = rawBatch?.toLowerCase() ?? '';
		const mode = rawMode?.toLowerCase() ?? '';

		// Validate path parameters
		if(!isBatchParam(batch)) {
			return jsonError("Invalid batch. Use 'batch' or 'single'", batch, mode, 400);
		}

		if(!isModeParam(mode)) {
			return jsonError("Invalid mode. Use 'default' or 'raw'", batch, mode, 400);
		}

		// Extract query parameters
		const searchParams = request.nextUrl.searchParams;
		const folderPath = searchParams.get('folderPath') ?? '';
		const file = searchParams.get('file') ?? searchParams.get('fileName') ?? '';

		// Validate required parameters
		if(!folderPath) {
			return jsonError('Folder path is required', batch, mode, 400);
		}

		// RAW mode only works with batch processing
		if(batch === 'single' && mode === 'raw') {
			return jsonError('RAW mode only supports batch requests', batch, mode, 400);
		}

		// Handle RAW file mode: look for /raw subfolder and extract RAW file metadata
		// Handle RAW file mode: look for /raw subfolder and extract RAW file metadata
		if(mode === 'raw') {
			try {
				await access(folderPath);
			} catch {
				return jsonError('Folder path does not exist', batch, mode, 400);
			}

			// Look for 'raw' subfolder (case-insensitive)
			const entries = await readdir(folderPath, { withFileTypes: true });
			const rawFolder = entries.find(
				(entry) => entry.isDirectory() && entry.name.toLowerCase() === 'raw'
			);

			// No RAW subfolder found
			if(!rawFolder) {
				return NextResponse.json({
					success: true,
					batch,
					mode,
					folderPath,
					hasRawFolder: false,
					rawFolderPath: null,
					fileCount: 0,
					exifData: [],
				});
			}

			const rawFolderPath = path.join(folderPath, rawFolder.name);
			const rawFiles = await readdir(rawFolderPath, { withFileTypes: true });

		// Filter for RAW file extensions
			const rawImageFiles = rawFiles.filter((entry) => {
				if(!entry.isFile()) {return false;}
				const ext = path.extname(entry.name).toLowerCase();
				return config.RAW_EXTENSIONS.includes(ext);
			});

		// Build set of XMP sidecar filenames for quick lookup
			const xmpFiles = new Set(
				rawFiles
					.filter((entry) => path.extname(entry.name).toLowerCase() === '.xmp')
					.map((entry) => path.parse(entry.name).name.toLowerCase())
			);

		// No RAW files in the subfolder
			if(rawImageFiles.length === 0) {
				return NextResponse.json({
					success: true,
					batch,
					mode,
					folderPath,
					hasRawFolder: true,
					rawFolderPath,
					fileCount: 0,
					exifData: [],
				});
			}

			// Extract EXIF metadata from all RAW files
			console.log(`Found ${rawImageFiles.length} RAW files in:`, rawFolderPath);
			const exifData = await getBatchExifJson(rawFolderPath);

			// Filter results to only RAW file types and add hasXmp indicator
			const filteredExifData = exifData
				.filter((data) => {
					if(!data.FileName) {return false;}
					const ext = path.extname(data.FileName).toLowerCase();
					return config.RAW_EXTENSIONS.includes(ext) || ext === '.xmp';
				})
				.map((data) => {
					const baseName = path.parse(data.FileName).name.toLowerCase();
					return {
						...data,
						hasXmp: xmpFiles.has(baseName),
					};
				})
				.filter((data, index, self) => 
					index === self.findIndex((item) => 
						path.parse(item.FileName).name.toLowerCase() === path.parse(data.FileName).name.toLowerCase()
					)
				);

			return NextResponse.json({
				success: true,
				batch,
				mode,
				folderPath,
				hasRawFolder: true,
				rawFolderPath,
				fileCount: rawImageFiles.length,
				exifData: filteredExifData,
			});
		}

		// Handle batch mode: extract EXIF data from all image files in the folder
		if(batch === 'batch') {
			console.log('Extracting batch EXIF data from:', folderPath);
			const exifData = await getBatchExifJson(folderPath);

			// Check if RAW subfolder exists (useful for UI to know if RAW files are available)
			let hasRawFolder = false;
			let rawFolderPath: string | null = null;
			try {
				const entries = await readdir(folderPath, { withFileTypes: true });
				const rawFolder = entries.find(
					(entry) => entry.isDirectory() && entry.name.toLowerCase() === 'raw'
				);
				if(rawFolder) {
					hasRawFolder = true;
					rawFolderPath = path.join(folderPath, rawFolder.name);
				}
			} catch {
				// If we can't read the folder, just continue without RAW info
			}

			return NextResponse.json({
				success: true,
				batch,
				mode,
				folderPath,
				hasRawFolder,
				rawFolderPath,
				fileCount: exifData.length,
				exifData,
			});
		}

		// Handle single file mode: extract EXIF data from a specific file
		// Handle single file mode: extract EXIF data from a specific file
		if(!file) {
			return jsonError('Folder path and file are required', batch, mode, 400);
		}

		const filePath = path.join(folderPath, file);

		console.log('Extracting EXIF data from:', folderPath, file, filePath);

		// Extract EXIF metadata from the single file (getExifJson returns array, pop gets the single result)
		const exifData = (await getExifJson(filePath)).pop() ?? null;

		return NextResponse.json({
			success: true,
			batch,
			mode,
			folderPath,
			hasRawFolder: null,
			rawFolderPath: null,
			fileCount: exifData ? 1 : 0,
			exifData,
		});
	} catch (error) {
		// Log error and return standardized error response
		console.error('EXIF extraction error:', error);
		return jsonError(
			error instanceof Error ? error.message : 'Failed to extract EXIF data',
			'unknown',
			'unknown',
			500
		);
	}
}