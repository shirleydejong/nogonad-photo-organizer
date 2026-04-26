import { NextRequest, NextResponse } from 'next/server';
import { openWithDialog } from '@/controllers/open-with';

/**
 * Opens a file with the system's "Open With" dialog.
 *
 * @param request The incoming Next.js request object containing the file path.
 * @returns A JSON response indicating success or failure.
 */
export async function POST(request: NextRequest) {
	try {
		const { filePath } = await request.json();

		if(!filePath || typeof filePath !== 'string') {
			return NextResponse.json(
				{ error: 'filePath is required and must be a string' },
				{ status: 400 }
			);
		}

		await openWithDialog(filePath);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error opening with dialog:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
