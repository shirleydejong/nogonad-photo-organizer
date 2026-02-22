import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { upsertRating } from '@/controllers/database';

export interface AggregatedRatings {
  dbRatings: Array<{ fileName: string; rating: number }>;
  jpgRatings: Array<{ fileName: string; rating: number }>;
  rawRatings: Array<{ fileName: string; rating: number }>;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as AggregatedRatings & { folderPath?: string };
    const { dbRatings = [], jpgRatings = [], rawRatings = [], folderPath } = body;

    if (!folderPath) {
      return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
    }

    // Combine all ratings
    const allRatings = [
      ...dbRatings.map(r => ({ ...r, source: 'database' })),
      ...jpgRatings.map(r => ({ ...r, source: 'jpg' })),
      ...rawRatings.map(r => ({ ...r, source: 'raw' })),
    ];

    if (allRatings.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No ratings to apply',
        appliedCount: 0 
      });
    }

    // Apply each rating to the database
    let appliedCount = 0;
    for (const ratingItem of allRatings) {
      try {
        // Add file extension based on source
        let fileName = ratingItem.fileName;
        // Try to find the actual file to determine extension
        // For now, we'll just use the fileName as provided
        
        upsertRating(ratingItem.fileName, folderPath, ratingItem.rating, false);
        appliedCount++;
      } catch (err) {
        console.error(`Failed to apply rating for ${ratingItem.fileName}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Applied ${appliedCount} ratings`,
      appliedCount,
      dbRatingsCount: dbRatings.length,
      jpgRatingsCount: jpgRatings.length,
      rawRatingsCount: rawRatings.length,
    });

  } catch (error) {
    console.error('Set ratings API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
