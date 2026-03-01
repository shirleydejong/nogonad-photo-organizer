import { NextRequest, NextResponse } from 'next/server';
import getShootAssistController from '@/controllers/shoot-assist';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'Missing action parameter' },
        { status: 400 }
      );
    }

    const controller = getShootAssistController();

    // Fire and forget - respond immediately
    if (action === 'start') {
      // Start process in background
      controller.start().catch((err) => {
        console.error('[ShootAssist API] Failed to start:', err instanceof Error ? err.message : err);
      });

      return NextResponse.json({ 
        success: true, 
        message: 'ShootAssist starting...' 
      });
    } 
    
    if (action === 'stop') {
      // Stop process in background
      controller.stop().catch((err) => {
        console.error('[ShootAssist API] Failed to stop:', err instanceof Error ? err.message : err);
      });

      return NextResponse.json({ 
        success: true, 
        message: 'ShootAssist stopping...' 
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "start" or "stop"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[ShootAssist API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
