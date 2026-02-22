import fs from 'fs/promises';
import path from 'path';
import config from '../config';
import { getBatchExifJson } from './exiftool';

/**
 * Checks if a file exists
 * 
 * @param filePath Path to the file
 * @returns True if file exists, false otherwise
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
 * Scans a folder for 1-star rated photos and moves them to a trash folder.
 * If raw files are moved, their corresponding XMP sidecar files are also moved.
 * The trash folder is located within the .npo folder.
 * 
 * @param folderPath The root folder to scan
 * @returns List of files moved to trash
 */
export async function moveToTrash(folderPath: string) {
	const npoPath = path.join(folderPath, config.NPO_FOLDER);
	const trashPath = path.join(npoPath, config.TRASH_FOLDER);

	// Ensure NPO folder exists
	if (!(await fileExists(npoPath))) {
		await fs.mkdir(npoPath, { recursive: true });
	}

	// Ensure trash folder exists
	if (!(await fileExists(trashPath))) {
		await fs.mkdir(trashPath, { recursive: true });
	}

	// Folders to scan: main folder and raw folder (if it exists)
	const foldersToScan = [folderPath];
	const rawFolderPath = path.join(folderPath, config.RAW_FOLDER);

	if (await fileExists(rawFolderPath)) {
		foldersToScan.push(rawFolderPath);
	}

	const movedFiles: string[] = [];
	const alreadyMoved = new Set<string>();

	for (const scanPath of foldersToScan) {
		const metadata = await getBatchExifJson(scanPath);

		for (const item of metadata) {
			// Check if rating is exactly 1 (from exiftool -json output)
			if (item.Rating === 1) {
				const sourceFile = item.SourceFile; // Full path provided by exiftool -json
				if (!sourceFile || alreadyMoved.has(sourceFile)) continue;

				const parsed = path.parse(sourceFile);
				const isRaw = /\.(raw|dng|nef|cr2|crw|arw|raf|rw2|orf|pef)$/i.test(sourceFile);
				const isXmp = parsed.ext.toLowerCase() === '.xmp';

				try {
					// 1. Determine files to move
					const filesToMove: string[] = [];

					if (isRaw) {
						filesToMove.push(sourceFile);
						// Look for corresponding XMP
						const xmpPath = path.join(parsed.dir, parsed.name + '.xmp');
						if (await fileExists(xmpPath)) {
							filesToMove.push(xmpPath);
						}
					} else if (isXmp) {
						filesToMove.push(sourceFile);
						// Look for corresponding RAW (iterate common extensions)
						const rawExtensions = ['.raw', '.dng', '.nef', '.cr2', '.crw', '.arw', '.raf', '.rw2', '.orf', '.pef'];
						for (const ext of rawExtensions) {
							const rawPath = path.join(parsed.dir, parsed.name + ext);
							if (await fileExists(rawPath)) {
								filesToMove.push(rawPath);
								break; // Assume only one RAW per XMP
							}
							// Also check with uppercase if needed, but fileExists should be case-insensitive on Windows anyway
							const rawPathUpper = path.join(parsed.dir, parsed.name + ext.toUpperCase());
							if (ext.toUpperCase() !== ext && await fileExists(rawPathUpper)) {
								filesToMove.push(rawPathUpper);
								break;
							}
						}
					} else {
						// Normal file (JPG, etc.)
						filesToMove.push(sourceFile);
					}

					// 2. Perform moves
					for (const file of filesToMove) {
						if (!alreadyMoved.has(file) && await fileExists(file)) {
							const fileName = path.basename(file);
							const destinationFile = path.join(trashPath, fileName);

							await fs.rename(file, destinationFile);
							movedFiles.push(file);
							alreadyMoved.add(file);
						}
					}
				} catch (error) {
					console.error(`Failed to move files related to ${sourceFile}:`, error);
				}
			}
		}
	}

	return movedFiles;
}
