import { NextResponse } from 'next/server';

import { closeDatabase } from '@/controllers/database';

export async function POST() {
	try {
		closeDatabase();
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Database close API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}