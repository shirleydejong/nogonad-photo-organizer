import { io, Socket } from 'socket.io-client';
import config from '../config';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const socketURL = new URL(window.location.origin);
    socketURL.port = config.SOCKET_PORT.toString();
    
    socket = io(socketURL.toString(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log('Socket connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
