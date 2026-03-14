import { access } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';

import {
	createImageGroupRelation,
	deleteImageGroupRelation,
	getImageGroupRelations,
} from '@/controllers/database';

async function validateFolderPath(folderPath: string | null): Promise<string | NextResponse> {
	if (!folderPath) {
		return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
	}

	try {
		await access(folderPath);
	} catch {
		return NextResponse.json({ error: 'Folder path does not exist' }, { status: 400 });
	}

	return folderPath;
}

function normalizeText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const validatedFolderPath = await validateFolderPath(searchParams.get('folderPath'));
		if (typeof validatedFolderPath !== 'string') {
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

export async function POST(request: NextRequest) {
	try {
		const { folderPath, imageId, groupId } = await request.json();
		const validatedFolderPath = await validateFolderPath(folderPath ?? null);
		if (typeof validatedFolderPath !== 'string') {
			return validatedFolderPath;
		}

		const normalizedImageId = normalizeText(imageId);
		const normalizedGroupId = normalizeText(groupId);
		if (!normalizedImageId || !normalizedGroupId) {
			return NextResponse.json({ error: 'imageId and groupId are required' }, { status: 400 });
		}

		const relation = createImageGroupRelation(validatedFolderPath, normalizedImageId, normalizedGroupId);
		return NextResponse.json({ success: true, relation }, { status: 201 });
	} catch (error) {
		console.error('Image groups POST API error:', error);
		if (error instanceof Error && error.message.includes('FOREIGN KEY constraint failed')) {
			return NextResponse.json({ error: 'imageId or groupId does not exist' }, { status: 400 });
		}
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			return NextResponse.json({ error: 'Relation already exists' }, { status: 409 });
		}

		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const { folderPath, imageId, groupId } = await request.json();
		const validatedFolderPath = await validateFolderPath(folderPath ?? null);
		if (typeof validatedFolderPath !== 'string') {
			return validatedFolderPath;
		}

		const normalizedImageId = normalizeText(imageId);
		const normalizedGroupId = normalizeText(groupId);
		if (!normalizedImageId || !normalizedGroupId) {
			return NextResponse.json({ error: 'imageId and groupId are required' }, { status: 400 });
		}

		const deleted = deleteImageGroupRelation(validatedFolderPath, normalizedImageId, normalizedGroupId);
		if (!deleted) {
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
