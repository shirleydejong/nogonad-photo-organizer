import { NextResponse } from 'next/server';
import { sendShootAssistCommand } from '@/utils/shoot-assist-command-client';

/**
 * Stops the ShootAssist system.
 *
 * @route GET /api/shoot-assist/shutdown
 * @returns {Object} JSON response with success status and message.
 * @returns {boolean} response.success - Indicates if the operation was successful.
 * @returns {string} response.message - Human-readable status message.
 * @returns {string} response.error - Error message if the operation failed (status 500).
 *
 * @example
 * // Request
 * GET /api/shoot-assist/shutdown
 *
 * // Response (200)
 * { "success": true, "message": "ShootAssist stopping..." }
 *
 * // Response (500)
 * { "error": "Failed to stop ShootAssist" }
 */
export async function GET() {
	try {
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
		
	} catch (error) {
		console.error('[ShootAssist Shutdown API] Error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
}