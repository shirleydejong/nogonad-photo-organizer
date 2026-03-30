import { NextRequest, NextResponse } from 'next/server';
import { sendShootAssistCommand } from '@/utils/shoot-assist-command-client';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { action } = body;

		if(!action) {
			return NextResponse.json(
				{ error: 'Missing action parameter' },
				{ status: 400 }
			);
		}

		if(action === 'start') {
			const response = await sendShootAssistCommand('shoot-assist-start');

			if(!response.success) {
				return NextResponse.json(
					{ error: response.error || 'Failed to start ShootAssist' },
					{ status: 500 }
				);
			}

			return NextResponse.json({
				success: true,
				message: response.message || 'ShootAssist starting...'
			});
		}
    
		if(action === 'stop') {
			const response = await sendShootAssistCommand('shoot-assist-stop');

			if(!response.success) {
				return NextResponse.json(
					{ error: response.error || 'Failed to stop ShootAssist' },
					{ status: 500 }
				);
			}

			return NextResponse.json({
				success: true,
				message: response.message || 'ShootAssist stopping...'
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
