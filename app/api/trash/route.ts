import { NextRequest, NextResponse } from 'next/server';
import { moveToTrash } from '@/controllers/trash';
import { access } from 'fs/promises';

/**
 * API route to move photos with 1-star rating to the trash folder.
 * 
 * Expectations:
 * - Method: POST
 * - Body: { folderPath: string }
 * 
 * Returns:
 * - JSON with success status and list of moved files.
 */
export async function POST(request: NextRequest) {
	try {
		const { folderPath } = await request.json();

		if (!folderPath) {
			return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
		}

		// Verify folder existence
		try {
			await access(folderPath);
		} catch {
			return NextResponse.json({ error: 'Folder path does not exist' }, { status: 400 });
		}

		// Execute move operation
		const movedFiles = await moveToTrash(folderPath);

		return NextResponse.json({
			success: true,
			message: `Moved ${movedFiles.length} files to trash`,
			movedFiles
		});
	} catch (error) {
		console.error('Trash API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
