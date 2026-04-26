import { NextResponse } from 'next/server';
import { sendShootAssistCommand } from '@/utils/shoot-assist-command-client';

/**
 * Starts the ShootAssist system.
 *
 * @route GET /api/shoot-assist/startup
 * @returns {Object} JSON response with success status and message.
 * @returns {boolean} response.success - Indicates if the operation was successful.
 * @returns {string} response.message - Human-readable status message.
 * @returns {string} response.error - Error message if the operation failed (status 500).
 *
 * @example
 * // Request
 * GET /api/shoot-assist/startup
 *
 * // Response (200)
 * { "success": true, "message": "ShootAssist starting..." }
 *
 * // Response (500)
 * { "error": "Failed to start ShootAssist" }
 */
export async function GET() {
	try {
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
		
	} catch (error) {
		console.error('[ShootAssist Startup API] Error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
}