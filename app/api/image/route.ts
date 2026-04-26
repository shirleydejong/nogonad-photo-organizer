import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import config from '@/config';

export async function POST(request: NextRequest) {
	try {
		const { folderPath } = await request.json();

		if(!folderPath) {
			return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
		}

    // Get all image files in the folder
		const files = await fs.readdir(folderPath);
		const imageFiles = files.filter((file) => {
			const ext = path.extname(file).toLowerCase();
			return config.SUPPORTED_EXTENSIONS.includes(ext);
		});

		return NextResponse.json({
			success: true,
			total: imageFiles.length,
			files: imageFiles,
		});
	} catch (error) {
		console.error('API Error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
