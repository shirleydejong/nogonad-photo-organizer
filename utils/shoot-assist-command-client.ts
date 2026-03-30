import { io, Socket } from 'socket.io-client';
import config from '@/config';

type CommandAck = {
  success: boolean;
  message?: string;
  error?: string;
};

const MAX_CONNECT_RETRIES = 4;
const INITIAL_BACKOFF_MS = 250;
const CONNECT_TIMEOUT_MS = 4000;

let commandSocket: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function closeCommandSocket(): void {
	if(commandSocket) {
		commandSocket.close();
		commandSocket = null;
	}
}

function connectOnce(): Promise<Socket> {
	return new Promise<Socket>((resolve, reject) => {
		const socket = io(`http://localhost:${config.SOCKET_PORT}`, {
			transports: ['websocket', 'polling'],
			reconnection: true,
			reconnectionDelay: 1000,
			reconnectionAttempts: 5,
		});

		const timeout = setTimeout(() => {
			cleanup();
			socket.close();
			reject(new Error(`Socket connection timeout after ${CONNECT_TIMEOUT_MS}ms`));
		}, CONNECT_TIMEOUT_MS);

		const onConnect = () => {
			cleanup();
			commandSocket = socket;
			resolve(socket);
		};

		const onError = (error: Error) => {
			cleanup();
			socket.close();
			reject(error);
		};

		const cleanup = () => {
			clearTimeout(timeout);
			socket.off('connect', onConnect);
			socket.off('connect_error', onError);
		};

		socket.once('connect', onConnect);
		socket.once('connect_error', onError);
	});
}

async function getCommandSocket(): Promise<Socket> {
	if(commandSocket?.connected) {
		return commandSocket;
	}

	if(connectPromise) {
		return connectPromise;
	}

	closeCommandSocket();

	connectPromise = (async() => {
		let lastError: unknown;

		for(let attempt = 0; attempt <= MAX_CONNECT_RETRIES; attempt += 1) {
			try {
				return await connectOnce();
			} catch (error) {
				lastError = error;

				if(attempt === MAX_CONNECT_RETRIES) {
					break;
				}

				const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
				await sleep(delay);
			}
		}

		throw lastError instanceof Error ? lastError : new Error('Failed to connect to command socket');
	})().finally(() => {
		connectPromise = null;
	});

	return connectPromise;
}

function emitCommand<TPayload extends Record<string, unknown> | undefined = undefined>(
	socket: Socket,
	event: string,
	payload?: TPayload,
	timeoutMs = 10000
): Promise<CommandAck> {
	return new Promise<CommandAck>((resolve, reject) => {
		socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, response?: CommandAck) => {
			if(err) {
				reject(err);
				return;
			}

			if(!response) {
				resolve({ success: false, error: 'No response from server' });
				return;
			}

			resolve(response);
		});
	});
}

export async function sendShootAssistCommand<TPayload extends Record<string, unknown> | undefined = undefined>(
	event: string,
	payload?: TPayload,
	timeoutMs = 10000
): Promise<CommandAck> {
	try {
		const socket = await getCommandSocket();
		return await emitCommand(socket, event, payload, timeoutMs);
	} catch {
		closeCommandSocket();
		const socket = await getCommandSocket();
		return emitCommand(socket, event, payload, timeoutMs);
	}
}
