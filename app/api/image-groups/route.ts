import { access } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';

import {
	createImageGroupRelation,
	createImageGroupRelations,
	deleteImageGroupRelation,
	deleteImageGroupRelations,
	getImageGroupRelations,
} from '@/controllers/database';

/**
 * Validates that a folder path is provided and exists on disk.
 *
 * @param folderPath Folder path from request input.
 * @returns A validated folder path string, or a 400 response when invalid.
 */
async function validateFolderPath(folderPath: string | null): Promise<string | NextResponse> {
	if(!folderPath) {
		return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
	}

	try {
		await access(folderPath);
	} catch {
		return NextResponse.json({ error: 'Folder path does not exist' }, { status: 400 });
	}

	return folderPath;
}

/**
 * Normalizes a value to a trimmed string.
 *
 * @param value Unknown input value.
 * @returns Trimmed string or an empty string for non-string inputs.
 */
function normalizeText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalizes an unknown value to a deduplicated list of non-empty image ids.
 *
 * @param value Unknown input value expected to be an array of ids.
 * @returns Unique, trimmed, non-empty image id list.
 */
function normalizeImageIds(value: unknown): string[] {
	if(!Array.isArray(value)) {
		return [];
	}

	return Array.from(
		new Set(
			value
				.map((entry) => normalizeText(entry))
				.filter((entry) => entry.length > 0)
		)
	);
}

/**
 * Retrieves image-group relations for a folder, optionally filtered by image or group id.
 *
 * Query params:
 * - folderPath: required absolute folder path.
 * - imageId: optional image id filter.
 * - groupId: optional group id filter.
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const validatedFolderPath = await validateFolderPath(searchParams.get('folderPath'));
		if(typeof validatedFolderPath !== 'string') {
			return validatedFolderPath;
		}

		const imageId = normalizeText(searchParams.get('imageId'));
		const groupId = normalizeText(searchParams.get('groupId'));

		const relations = getImageGroupRelations(validatedFolderPath, {
			imageId: imageId || undefined,
			groupId: groupId || undefined,
		});

		return NextResponse.json({ success: true, relations });
	} catch (error) {
		console.error('Image groups GET API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

/**
 * Creates one or many image-group relations.
 *
 * Body:
 * - folderPath: required absolute folder path.
 * - groupId: required group id.
 * - imageId: required when imageIds is not provided.
 * - imageIds: optional list for batch creation.
 */
export async function POST(request: NextRequest) {
	try {
		const { folderPath, imageId, imageIds, groupId } = await request.json();
		const validatedFolderPath = await validateFolderPath(folderPath ?? null);
		if(typeof validatedFolderPath !== 'string') {
			return validatedFolderPath;
		}

		const normalizedImageId = normalizeText(imageId);
		const normalizedImageIds = normalizeImageIds(imageIds);
		const normalizedGroupId = normalizeText(groupId);
		if(!normalizedGroupId) {
			return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
		}

		if(normalizedImageIds.length > 0) {
			const result = createImageGroupRelations(validatedFolderPath, normalizedImageIds, normalizedGroupId);
			return NextResponse.json({
				success: true,
				created: result.created,
				existing: result.existing,
				createdCount: result.created.length,
				existingCount: result.existing.length,
			});
		}

		if(!normalizedImageId) {
			return NextResponse.json({ error: 'imageId and groupId are required' }, { status: 400 });
		}

		const relation = createImageGroupRelation(validatedFolderPath, normalizedImageId, normalizedGroupId);
		return NextResponse.json({ success: true, relation }, { status: 201 });
	} catch (error) {
		console.error('Image groups POST API error:', error);
		if(error instanceof Error && error.message.includes('FOREIGN KEY constraint failed')) {
			return NextResponse.json({ error: 'imageId or groupId does not exist' }, { status: 400 });
		}
		if(error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			return NextResponse.json({ error: 'Relation already exists' }, { status: 409 });
		}

		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

/**
 * Deletes one or many image-group relations.
 *
 * Body:
 * - folderPath: required absolute folder path.
 * - groupId: required group id.
 * - imageId: required when imageIds is not provided.
 * - imageIds: optional list for batch deletion.
 */
export async function DELETE(request: NextRequest) {
	try {
		const { folderPath, imageId, imageIds, groupId } = await request.json();
		const validatedFolderPath = await validateFolderPath(folderPath ?? null);
		if(typeof validatedFolderPath !== 'string') {
			return validatedFolderPath;
		}

		const normalizedImageId = normalizeText(imageId);
		const normalizedImageIds = normalizeImageIds(imageIds);
		const normalizedGroupId = normalizeText(groupId);
		if(!normalizedGroupId) {
			return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
		}

		if(normalizedImageIds.length > 0) {
			const result = deleteImageGroupRelations(validatedFolderPath, normalizedImageIds, normalizedGroupId);
			return NextResponse.json({
				success: true,
				deleted: result.deleted,
				missing: result.missing,
				deletedCount: result.deleted.length,
				missingCount: result.missing.length,
			});
		}

		if(!normalizedImageId) {
			return NextResponse.json({ error: 'imageId and groupId are required' }, { status: 400 });
		}

		const deleted = deleteImageGroupRelation(validatedFolderPath, normalizedImageId, normalizedGroupId);
		if(!deleted) {
			return NextResponse.json({ error: 'Relation not found' }, { status: 404 });
		}

		return NextResponse.json({ success: true, relation: { imageId: normalizedImageId, groupId: normalizedGroupId } });
	} catch (error) {
		console.error('Image groups DELETE API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
