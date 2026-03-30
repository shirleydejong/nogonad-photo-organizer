import { NextRequest, NextResponse } from 'next/server';
import { sendShootAssistCommand } from '@/utils/shoot-assist-command-client';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { action, shots, interval, path } = body;

		if(!action) {
			return NextResponse.json(
				{ error: 'Missing action parameter' },
				{ status: 400 }
			);
		}

		if(action === 'start') {
			if(typeof shots !== 'number' || shots <= 0) {
				return NextResponse.json(
					{ error: 'Invalid shots parameter. Must be a number greater than 0' },
					{ status: 400 }
				);
			}

			if(typeof interval !== 'number' || interval < 0) {
				return NextResponse.json(
					{ error: 'Invalid interval parameter. Must be a number >= 0' },
					{ status: 400 }
				);
			}

			const response = await sendShootAssistCommand('capture-start', {
				shots,
				interval,
				path: typeof path === 'string' ? path : undefined,
			});

			if(!response.success) {
				return NextResponse.json(
					{ error: response.error || 'Failed to start capture' },
					{ status: 500 }
				);
			}

			return NextResponse.json({
				success: true,
				message: response.message || `Starting capture of ${shots} shots with ${interval}ms interval`
			});
		}
    
		if(action === 'stop') {
			const response = await sendShootAssistCommand('capture-stop');

			if(!response.success) {
				return NextResponse.json(
					{ error: response.error || 'Failed to stop capture' },
					{ status: 500 }
				);
			}

			return NextResponse.json({
				success: true,
				message: response.message || 'Stopping capture...'
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
