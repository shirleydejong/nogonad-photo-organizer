import { NextRequest, NextResponse } from 'next/server';
import { openWithDialog } from '@/controllers/open-with';

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();

    if (!filePath || typeof filePath !== 'string') {
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
