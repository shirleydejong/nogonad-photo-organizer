import { spawn, ChildProcess } from 'child_process';
import config from '@/config';
import { EventEmitter } from 'events';

const CONNECTION_TIMEOUT_MS = 15000;

/**
 * Controller for managing the ShootAssist camera control process.
 * Handles process lifecycle, command execution, and graceful shutdown.
 */
export class ShootAssistController extends EventEmitter {
	private process: ChildProcess | null = null;
	private isReady = false;
	private isShuttingDown = false;
	private startupTimeout: NodeJS.Timeout | null = null;
	private currentCapture: { count: number; delayMs: number } | null = null;

	constructor() {
		super();
		this.on('newListener', (eventName) => {
			if(eventName === 'error') {
				console.log('📸 Error listener attached');
			}
		});
	}

	/**
	 * Start the ShootAssist process and wait for it to be ready.
	 * @throws {Error} If process fails to start or doesn't become ready within the connection timeout
	 */
	async start(): Promise<void> {
		if(this.process) {
			console.log('ShootAssist process is already running');
	  return;
		}

		console.log(`📸 Starting process: ${config.SHOOT_ASSIST}`);
		this.isShuttingDown = false;
		this.isReady = false;

		return new Promise((resolve, reject) => {
			try {
			// Spawn the process without inheriting stdin
				this.process = spawn(config.SHOOT_ASSIST, [], {
					stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
				});

			// Set up timeout for startup
				this.startupTimeout = setTimeout(() => {
					this.cleanup();
					reject(new Error(`ShootAssist process did not become ready within ${CONNECTION_TIMEOUT_MS / 1000} seconds`));
				}, CONNECTION_TIMEOUT_MS);

			// Handle stdout - log to console and check for READY status
				this.process.stdout?.on('data', (data: Buffer) => {
					const output = data.toString().trim();
					console.log(`📸 ${output}`);

				// Check if process is ready
					if(output.includes('[STATUS] READY')) {
						this.isReady = true;
						if(this.startupTimeout) {
							clearTimeout(this.startupTimeout);
							this.startupTimeout = null;
						}
						this.emit('ready');
						resolve();
					} else if(output.includes('[STATUS] OK')) {
						this.emit('command-complete');
					}
				});

			// Handle stderr - log to console and emit status events
				this.process.stderr?.on('data', (data: Buffer) => {
					const output = data.toString().trim();
					console.log(`📸 ${output}`);

				// Parse status messages
					if(output.includes('[STATUS]')) {
						this.emit('status', output);

			// Try to parse capture progress
			// Look for patterns like "[STATUS] Shot 6/10"
						const progressMatch = output.match(/Shot\s+(\d+)\/(\d+)/);
						if(progressMatch && this.currentCapture) {
							const current = parseInt(progressMatch[1], 10);
							const total = parseInt(progressMatch[2], 10);
							this.emit('capture-progress', { current, total });
						}
			
						const bulkComplete = output.includes('[STATUS] Bulk AF capture completed');
						if(bulkComplete && this.currentCapture) {
							this.emit('capture-complete', this.currentCapture);
							this.currentCapture = null;
						}
			
						const bulkStopped = output.includes('[STATUS] Bulk AF capture stopped by stop command');
						if(bulkStopped) {
							this.emit('capture-stopped');
						}
			
					} else if(output.includes('[ERROR]')) {
						this.safeEmitError(output);
					} else if(output.includes('[WARNING]')) {
			
						const noBulkInProgress = output.includes('[WARNING] No bulk AF capture in progress');
						if( noBulkInProgress ) {
							this.emit('capture-stopped');
						}
			
						this.emit('warning', output);
					} else if(output.includes('[FILE]')) {
						this.emit('file', output);
					}
				});

			// Handle process exit
				this.process.on('exit', (code, signal) => {
					const exitCode = code ?? -1;
					if(exitCode !== 0 && !this.isShuttingDown) {
						const errorMessage = `ShootAssist Process exited unexpectedly with code ${exitCode} and signal ${signal}`;
						console.error(errorMessage);
						this.safeEmitError(errorMessage);
					} else {
						console.log(`📸 Process exited with code ${code} and signal ${signal}`);
					}

					this.isReady = false;
					this.emit('exit', { code, signal });
					this.cleanup();
				});

			// Handle process errors
				this.process.on('error', (err: Error) => {
					console.error(`📸 Process error:`, err);
					this.safeEmitError(err.message);
					if(this.startupTimeout) {
						clearTimeout(this.startupTimeout);
						this.startupTimeout = null;
					}
					this.cleanup();
					reject(err);
				});

			} catch (err) {
				this.cleanup();
				reject(err);
			}
		});
	}

	/**
	 * Set the download path for captured images
	 * @param path Directory path where 2MP previews will be saved
	 */
	async setDownloadPath(path: string): Promise<void> {
		this.ensureReady();
		this.sendCommand(`set_path ${path}`);
	}

	/**
	 * Start bulk capture with autofocus
	 * @param count Number of photos to capture
	 * @param delayMs Delay in milliseconds between shots
	 */
	async startBulkShoot(count: number, delayMs: number): Promise<void> {
		this.ensureReady();

		if(count <= 0) {
			throw new Error('Count must be greater than 0');
		}
		if(delayMs < 0) {
			throw new Error('Delay must be 0 or greater');
		}

		this.currentCapture = { count, delayMs };
		this.emit('capture-started', { count, delayMs });
		this.sendCommand(`bulk_af ${count} ${delayMs}`);
	}

	/**
	 * Stop the current bulk shoot operation
	 */
	async stopBulkShoot(): Promise<void> {
		this.ensureReady();
		this.currentCapture = null;
		this.sendCommand('stop');
	}

	/**
	 * Gracefully stop the ShootAssist process
	 * Sends exit command and waits for process to terminate
	 */
	async stop(): Promise<void> {
		if(!this.process || this.isShuttingDown) {
			return;
		}

		this.isShuttingDown = true;
		console.log('📸 Stopping process…');

		return new Promise((resolve) => {
	// Set a safety timeout
			const timeout = setTimeout(() => {
				console.log('📸 Forcing process termination…');
				this.process?.kill('SIGKILL');
				resolve();
			}, 5000);

	// Wait for clean exit
			this.process?.once('exit', () => {
				clearTimeout(timeout);
				resolve();
			});

	// Send exit command
			this.sendCommand('exit');
		});
	}

/**
 * Check if the process is running and ready for commands
 */
	isRunning(): boolean {
		return this.process !== null && this.isReady && !this.isShuttingDown;
	}

/**
 * Send a command to the ShootAssist process
 * @private
 */
	private sendCommand(command: string): void {
		if(!this.process?.stdin) {
			throw new Error('Process stdin is not available');
		}

		console.log(`📸 Sending command: ${command}`);
		this.process.stdin.write(`${command}\n`);
	}

/**
 * Ensure the process is ready before sending commands
 * @private
 */
	private ensureReady(): void {
		if(!this.isReady) {
			throw new Error('ShootAssist process is not ready');
		}
		if(this.isShuttingDown) {
			throw new Error('ShootAssist process is shutting down');
		}
	}

	private safeEmitError(message: string): void {
		if(this.listenerCount('error') > 0) {
			this.emit('error', message);
			return;
		}

		console.error(`📸 ${message}`);
	}

/**
 * Cleanup internal state
 * @private
 */
	private cleanup(): void {
		if(this.startupTimeout) {
			clearTimeout(this.startupTimeout);
			this.startupTimeout = null;
		}

		this.currentCapture = null;
		this.isShuttingDown = false;
		this.process = null;
		this.isReady = false;
	}
}

// Singleton instance
let controllerInstance: ShootAssistController | null = null;

/**
 * Get the singleton ShootAssist controller instance
 */
export function getShootAssistController(): ShootAssistController {
	if(!controllerInstance) {
		controllerInstance = new ShootAssistController();
		setupGracefulShutdown(controllerInstance);
	}
	return controllerInstance;
}

/**
 * Setup graceful shutdown handlers for the ShootAssist process
 * Ensures the process is always properly closed on exit
 */
function setupGracefulShutdown(controller: ShootAssistController): void {
	let isShuttingDown = false;

	const shutdown = async(signal: string) => {
		if(isShuttingDown) {
			return;
		}
		isShuttingDown = true;

		console.log(`📸 Received ${signal}, shutting down gracefully…`);
    
		try {
			if(controller.isRunning()) {
				await controller.stop();
				console.log('📸 Process stopped successfully');
			}
		} catch (err) {
			console.error('📸 Error during shutdown:', err);
		} finally {
			process.exit(0);
		}
	};

  // Handle process exit
	process.on('exit', () => {
		if(controller.isRunning() && !isShuttingDown) {
			console.log('📸 Process exit detected, attempting cleanup…');
      // Can't use async here, so we send exit command synchronously
			try {
				controller.stop();
			} catch (err) {
				console.error('📸 Error during exit cleanup:', err);
			}
		}
	});

  // Handle shutdown signals
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGHUP', () => shutdown('SIGHUP'));

  // Handle uncaught errors
	process.on('uncaughtException', async(err) => {
		console.error('📸 Uncaught exception:', err);
		await shutdown('uncaughtException');
	});

	process.on('unhandledRejection', async(reason) => {
		console.error('📸 Unhandled rejection:', reason);
		await shutdown('unhandledRejection');
	});
}

export default getShootAssistController;
