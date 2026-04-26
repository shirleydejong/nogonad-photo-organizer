import { NextResponse } from 'next/server';
import { sendShootAssistCommand } from '@/utils/shoot-assist-command-client';

/**
 * Stops an active capture sequence.
 *
 * @route GET /api/shoot-assist/capture/stop
 *
 * @returns {Object} JSON response with success status and message.
 * @returns {boolean} response.success - Indicates if the operation was successful.
 * @returns {string} response.message - Human-readable status message.
 * @returns {string} response.error - Error message if the operation failed (status 500).
 *
 * @example
 * // Request
 * GET /api/shoot-assist/capture/stop
 *
 * // Response (200)
 * { "success": true, "message": "Stopping capture..." }
 *
 * // Response (500)
 * { "error": "Failed to stop capture" }
 */
export async function GET() {
	try {
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
		
	} catch (error) {
		console.error('[ShootAssist Capture Stop API] Error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
}