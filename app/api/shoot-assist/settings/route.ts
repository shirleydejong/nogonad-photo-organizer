import { NextResponse } from 'next/server';
import { sendShootAssistCommand } from '@/utils/shoot-assist-command-client';

type SettingsResponseData = {
	settings: Record<string, unknown>;
};

function shouldReturnServiceUnavailable(errorMessage: string | undefined): boolean {
	if(!errorMessage) {
		return false;
	}

	const message = errorMessage.toLowerCase();
	return message.includes('not ready') || message.includes('already in progress') || message.includes('shutting down');
}

/**
 * Reads the current camera settings from ShootAssist (`get_settings`).
 *
 * @route GET /api/shoot-assist/settings
 */
export async function GET() {
	try {
		const response = await sendShootAssistCommand<undefined, SettingsResponseData>('shoot-assist-get-settings');

		if(!response.success) {
			const error = response.error || 'Failed to read camera settings';
			const status = shouldReturnServiceUnavailable(error) ? 503 : 500;
			return NextResponse.json({ error }, { status });
		}

		const settings = response.data?.settings;
		if(!settings || typeof settings !== 'object' || Array.isArray(settings)) {
			return NextResponse.json(
				{ error: 'ShootAssist returned invalid settings data' },
				{ status: 502 }
			);
		}

		return NextResponse.json({ success: true, settings });
	} catch (error) {
		console.error('[ShootAssist Settings API] Error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
}
