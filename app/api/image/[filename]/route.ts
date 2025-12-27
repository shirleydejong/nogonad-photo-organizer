import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    //const { filename } = await params;
    const { searchParams } = new URL(request.url);
    const folderPath = searchParams.get('folderPath');
    const fileName = searchParams.get('fileName');

    if (!folderPath || !fileName) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const fileBuffer = await fs.readFile(path.join(folderPath, fileName));

    // Determine content type based on extension
    const ext = path.extname(fileName).toLowerCase();
    const contentType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    }[ext] || 'image/jpeg';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=6000',
      },
    });
  } catch (error) {
    console.error('Thumbnail fetch error:', error);
    return NextResponse.json(
      { error: 'Thumbnail not found' },
      { status: 404 }
    );
  }
}
