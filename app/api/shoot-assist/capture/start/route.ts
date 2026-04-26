import { NextRequest, NextResponse } from 'next/server';
import { sendShootAssistCommand } from '@/utils/shoot-assist-command-client';

/**
 * Initiates a capture sequence with the specified number of shots and interval.
 *
 * @route POST /api/shoot-assist/capture/start
 *
 * @param {Object} request - The Next.js request object.
 * @param {Object} request.body - JSON request body.
 * @param {number} request.body.shots - Required. Number of shots to capture (must be > 0).
 * @param {number} request.body.interval - Required. Delay between shots in milliseconds (must be >= 0).
 * @param {string} [request.body.path] - Optional. Output folder path for captured images.
 *
 * @returns {Object} JSON response with success status and message.
 * @returns {boolean} response.success - Indicates if the operation was successful.
 * @returns {string} response.message - Human-readable status message including shots and interval.
 * @returns {string} response.error - Error message if validation or operation failed.
 *
 * @throws {400} If shots is not a positive number or interval is negative.
 * @throws {500} If the capture command fails to execute.
 *
 * @example
 * // Request
 * POST /api/shoot-assist/capture/start
 * Content-Type: application/json
 * { "shots": 5, "interval": 1000, "path": "C:\\Users\\Photos" }
 *
 * // Response (200)
 * { "success": true, "message": "Starting capture of 5 shots with 1000ms interval" }
 *
 * // Response (400)
 * { "error": "Invalid shots parameter. Must be a number greater than 0" }
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { shots, interval, path } = body;

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
	} catch (error) {
		console.error('[ShootAssist Capture Start API] Error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
}