import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { access } from 'fs/promises';

import { ensureRatingsExist, getAllRatings, upsertRating } from '@/controllers/database';

function normalizeText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeImageIds(imageIds: unknown): string[] {
	if(!Array.isArray(imageIds)) {
		return [];
	}

	return Array.from(
		new Set(
			imageIds
				.map((value) => normalizeText(value))
				.filter((value) => value.length > 0)
		)
	);
}

function normalizeFileNamesToIds(fileNames: unknown): string[] {
	if(!Array.isArray(fileNames)) {
		return [];
	}

	return Array.from(
		new Set(
			fileNames
				.map((value) => normalizeText(value))
				.filter((value) => value.length > 0)
				.map((fileName) => path.parse(fileName).name)
				.filter((value) => value.length > 0)
		)
	);
}

/**
 * Returns all stored DB ratings for a local folder.
 *
 * Query parameters:
 * - folderPath: absolute folder path to load ratings for
 *
 * Responses:
 * - 200 with `{ success: true, ratings }`
 * - 400 when folderPath is missing or does not exist
 * - 500 on unexpected errors
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const folderPath = searchParams.get('folderPath');

		if(!folderPath) {
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

/**
 * Handles rating-related mutations for a local folder.
 *
 * Body fields:
 * - folderPath (required): absolute folder path
 * - action: when set to `ensure`, creates missing rating rows for `imageIds` and/or `fileNames`
 * - fileName: image file name used for single rating updates (required unless action is ensure)
 * - rating: integer 1-5 or null to clear
 * - overRuleFileRating: optional boolean flag for override behavior
 *
 * Responses:
 * - 200 with mutation result payload
 * - 400 for validation errors (missing folder/file, invalid rating, nonexistent folder)
 * - 500 on unexpected errors
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { action, fileName, rating, folderPath, overRuleFileRating } = body;

		if(!folderPath) {
			return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
		}
		
		try {
			await access(folderPath);
		} catch {
			return NextResponse.json({ error: 'Folder path does not exist' }, { status: 400 });
		}

		if(action === 'ensure') {
			const imageIds = normalizeImageIds(body.imageIds);
			const fileIds = normalizeFileNamesToIds(body.fileNames);
			const ensuredIds = ensureRatingsExist(folderPath, [...imageIds, ...fileIds]);

			if(ensuredIds.length === 0) {
				return NextResponse.json(
					{ error: 'At least one imageId or fileName is required for ensure action' },
					{ status: 400 }
				);
			}

			return NextResponse.json({ success: true, ensuredIds, count: ensuredIds.length });
		}

		if(!fileName) {
			return NextResponse.json({ error: 'File name and folder path are required' }, { status: 400 });
		}

		const fileId = path.parse(fileName).name;
		const isNullRating = rating === null || typeof rating === 'undefined';
		const isValidRating = Number.isInteger(rating) && rating >= 1 && rating <= 5;

		if(!isNullRating && !isValidRating) {
			return NextResponse.json(
				{ error: 'Rating must be an integer between 1 and 5, or null' },
				{ status: 400 }
			);
		}
		const result = upsertRating(fileId, folderPath, isNullRating ? null : rating, overRuleFileRating ?? false);

		return NextResponse.json({ success: true, ...result });
		
	} catch (error) {
		console.error('Rating API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
