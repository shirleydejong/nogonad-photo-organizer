import { NextRequest, NextResponse } from 'next/server';
import getShootAssistController from '@/controllers/shoot-assist';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, shots, interval, path } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'Missing action parameter' },
        { status: 400 }
      );
    }

    const controller = getShootAssistController();

    // Fire and forget - respond immediately
    if (action === 'start') {
      if (typeof shots !== 'number' || shots <= 0) {
        return NextResponse.json(
          { error: 'Invalid shots parameter. Must be a number greater than 0' },
          { status: 400 }
        );
      }

      if (typeof interval !== 'number' || interval < 0) {
        return NextResponse.json(
          { error: 'Invalid interval parameter. Must be a number >= 0' },
          { status: 400 }
        );
      }

      // Start capture in background
      (async () => {
        try {
          // Optionally set download path if provided
          if (path && typeof path === 'string') {
            await controller.setDownloadPath(path);
          }
          
          await controller.startBulkShoot(shots, interval);
        } catch (err) {
          console.log('[Capture API] Failed to start capture:', err instanceof Error ? err.message : err);
        }
      })();

      return NextResponse.json({ 
        success: true, 
        message: `Starting capture of ${shots} shots with ${interval}ms interval` 
      });
    } 
    
    if (action === 'stop') {
      // Stop capture in background
      controller.stopBulkShoot().catch((err) => {
        console.error('[Capture API] Failed to stop capture:', err instanceof Error ? err.message : err);
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Stopping capture...' 
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "start" or "stop"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[Capture API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
