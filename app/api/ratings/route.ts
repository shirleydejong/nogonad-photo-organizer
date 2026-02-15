import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { access } from 'fs/promises';

import { upsertRating, getAllRatings } from '@/controllers/database';

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const folderPath = searchParams.get('folderPath');

		if (!folderPath) {
			return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
		}

		try {
			await access(folderPath);
		} catch {
			return NextResponse.json({ error: 'Folder path does not exist' }, { status: 400 });
		}

		const ratings = getAllRatings(folderPath);

		return NextResponse.json({ success: true, ratings });
	} catch (error) {
		console.error('Rating GET API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const { fileName, rating, folderPath } = await request.json();
		
		console.log('⭐', { fileName, rating, folderPath });

		if (!fileName || !folderPath) {
			return NextResponse.json({ error: 'File name and folder path are required' }, { status: 400 });
		}
		
		try {
			await access(folderPath);
		} catch {
			return NextResponse.json({ error: 'Folder path does not exist' }, { status: 400 });
		}

		const fileId = path.parse(fileName).name;
		const isNullRating = rating === null || typeof rating === 'undefined';
		const isValidRating = Number.isInteger(rating) && rating >= 1 && rating <= 5;

		if (!isNullRating && !isValidRating) {
			return NextResponse.json(
				{ error: 'Rating must be an integer between 1 and 5, or null' },
				{ status: 400 }
			);
		}
		const result = upsertRating(fileId, folderPath, isNullRating ? null : rating);

		return NextResponse.json({ success: true, ...result });
		
	} catch (error) {
		console.error('Rating API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
