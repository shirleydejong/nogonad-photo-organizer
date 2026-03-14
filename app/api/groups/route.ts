import { randomUUID } from 'crypto';
import { access } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';

import {
	createGroup,
	deleteGroup,
	getAllGroups,
	getGroup,
	updateGroup,
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

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const validatedFolderPath = await validateFolderPath(searchParams.get('folderPath'));
		if (typeof validatedFolderPath !== 'string') {
			return validatedFolderPath;
		}

		const id = searchParams.get('id');
		if (id) {
			const group = getGroup(validatedFolderPath, id);
			if (!group) {
				return NextResponse.json({ error: 'Group not found' }, { status: 404 });
			}

			return NextResponse.json({ success: true, group });
		}

		const groups = getAllGroups(validatedFolderPath);
		return NextResponse.json({ success: true, groups });
	} catch (error) {
		console.error('Groups GET API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const { folderPath, id, name } = await request.json();
		const validatedFolderPath = await validateFolderPath(folderPath ?? null);
		if (typeof validatedFolderPath !== 'string') {
			return validatedFolderPath;
		}

		const normalizedName = typeof name === 'string' ? name.trim() : '';
		if (!normalizedName) {
			return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
		}

		const normalizedId = typeof id === 'string' && id.trim() ? id.trim() : randomUUID();
		const group = createGroup(validatedFolderPath, normalizedId, normalizedName);

		return NextResponse.json({ success: true, group }, { status: 201 });
	} catch (error) {
		console.error('Groups POST API error:', error);
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			return NextResponse.json({ error: 'Group id already exists' }, { status: 409 });
		}

		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

export async function PUT(request: NextRequest) {
	try {
		const { folderPath, id, name } = await request.json();
		const validatedFolderPath = await validateFolderPath(folderPath ?? null);
		if (typeof validatedFolderPath !== 'string') {
			return validatedFolderPath;
		}

		const normalizedId = typeof id === 'string' ? id.trim() : '';
		const normalizedName = typeof name === 'string' ? name.trim() : '';

		if (!normalizedId || !normalizedName) {
			return NextResponse.json({ error: 'Group id and name are required' }, { status: 400 });
		}

		const group = updateGroup(validatedFolderPath, normalizedId, normalizedName);
		if (!group) {
			return NextResponse.json({ error: 'Group not found' }, { status: 404 });
		}

		return NextResponse.json({ success: true, group });
	} catch (error) {
		console.error('Groups PUT API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const { folderPath, id } = await request.json();
		const validatedFolderPath = await validateFolderPath(folderPath ?? null);
		if (typeof validatedFolderPath !== 'string') {
			return validatedFolderPath;
		}

		const normalizedId = typeof id === 'string' ? id.trim() : '';
		if (!normalizedId) {
			return NextResponse.json({ error: 'Group id is required' }, { status: 400 });
		}

		const deleted = deleteGroup(validatedFolderPath, normalizedId);
		if (!deleted) {
			return NextResponse.json({ error: 'Group not found' }, { status: 404 });
		}

		return NextResponse.json({ success: true, id: normalizedId });
	} catch (error) {
		console.error('Groups DELETE API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
