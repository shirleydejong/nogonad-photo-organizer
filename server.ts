import os from 'os';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import config from '@/config';
import { Server as SocketIOServer } from 'socket.io';
import FileWatcher, { FileChangeEvent } from '@/controllers/file-watcher';
import getShootAssistController from '@/controllers/shoot-assist';

const dev = process.env.NODE_ENV !== 'production';

console.log('Starting server in:', dev ? 'development' : 'production', 'mode');

// @ts-ignore - Allow undefined config for development without .env file
const hostname = config?.HOSTNAME || Object.values(os.networkInterfaces())
  .flat()
  .find((iface) => iface?.family === 'IPv4' && !iface.internal)?.address || 'localhost';
const port = config.HTTP_PORT;
const socketPort = config.SOCKET_PORT; // Separate port for Socket.IO to avoid conflicts with Next.js HMR

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

type CommandAck = {
  success: boolean;
  message?: string;
  error?: string;
};

// Store active watchers per folder
const activeWatchers = new Map<string, FileWatcher>();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Create separate HTTP server for Socket.IO
  const socketServer = createServer();

  // Initialize Socket.IO on separate server
  const io = new SocketIOServer(socketServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Setup ShootAssist controller with Socket.IO integration
  const shootAssistController = getShootAssistController();
  const toErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);
  let captureState = {
    isCapturing: false,
    totalShots: 0,
    currentShot: 0,
  };

  // Listen to ShootAssist events and broadcast via Socket.IO
  shootAssistController.on('ready', () => {
    console.log('[ShootAssist] Process ready');
    io.emit('shoot-assist-ready');
    io.emit('shoot-assist-status', { isRunning: true });
  });

  shootAssistController.on('exit', ({ code, signal }) => {
    if ((code ?? 0) !== 0) {
      const message = `[ShootAssist] Process exited with error code ${code} (signal: ${signal})`;
      console.error(message);
      io.emit('shoot-assist-error', { message });
    } else {
      console.log('[ShootAssist] Process exited:', code, signal);
    }

    io.emit('shoot-assist-stopped', { code, signal });
    io.emit('shoot-assist-status', { isRunning: false });
    captureState = { isCapturing: false, totalShots: 0, currentShot: 0 };
  });

  shootAssistController.on('error', (message) => io.emit('shoot-assist-error', { message }));

  shootAssistController.on('warning', (message) => io.emit('shoot-assist-warning', { message }));

  shootAssistController.on('status', (message) => io.emit('shoot-assist-message', { message }));
  
  shootAssistController.on('command-complete', () => io.emit('shoot-assist-command-complete'));
  
  shootAssistController.on('file', (message) => io.emit('shoot-assist-file', { message }));

  shootAssistController.on('capture-started', ({ count, delayMs }) => {
    console.log(`[ShootAssist] Capture started: ${count} shots, ${delayMs}ms interval`);
    captureState = { isCapturing: true, totalShots: count, currentShot: 0 };
    io.emit('capture-started', { total: count, interval: delayMs });
  });

  shootAssistController.on('capture-progress', ({ current, total }) => {
    console.log(`[ShootAssist] Capture progress: ${current}/${total}`);
    captureState.currentShot = current;
    captureState.totalShots = total;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    io.emit('capture-progress', { current, total, percentage });
  });

  shootAssistController.on('capture-complete', ({ count }) => {
    console.log(`[ShootAssist] Capture complete: ${count} shots`);
    io.emit('capture-complete', { total: count });
    captureState = { isCapturing: false, totalShots: 0, currentShot: 0 };
  });
  
  shootAssistController.on('capture-stopped', () => {
    console.log(`[ShootAssist] Capture stopped`);
    io.emit('capture-stopped');
    captureState = { isCapturing: false, totalShots: 0, currentShot: 0 };
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current ShootAssist status to newly connected client
    socket.emit('shoot-assist-status', { 
      isRunning: shootAssistController.isRunning() 
    });
    
    if (captureState.isCapturing) {
      const percentage = captureState.totalShots > 0 
        ? Math.round((captureState.currentShot / captureState.totalShots) * 100) 
        : 0;
      socket.emit('capture-progress', {
        current: captureState.currentShot,
        total: captureState.totalShots,
        percentage
      });
    }

    socket.on('shoot-assist-start', (_payload: unknown, ack?: (response: CommandAck) => void) => {
      shootAssistController.start().catch((error) => {
        const message = `[ShootAssist] Failed to start: ${toErrorMessage(error)}`;
        console.error(message);
        io.emit('shoot-assist-error', { message });
      });

      ack?.({ success: true, message: 'ShootAssist starting...' });
    });

    socket.on('shoot-assist-stop', (_payload: unknown, ack?: (response: CommandAck) => void) => {
      shootAssistController.stop().catch((error) => {
        const message = `[ShootAssist] Failed to stop: ${toErrorMessage(error)}`;
        console.error(message);
        io.emit('shoot-assist-error', { message });
      });

      ack?.({ success: true, message: 'ShootAssist stopping...' });
    });

    socket.on(
      'capture-start',
      (
        payload: { shots?: number; interval?: number; path?: string } | undefined,
        ack?: (response: CommandAck) => void
      ) => {
        const shots = payload?.shots;
        const interval = payload?.interval;
        const path = payload?.path;

        if (typeof shots !== 'number' || shots <= 0) {
          ack?.({ success: false, error: 'Invalid shots parameter. Must be a number greater than 0' });
          return;
        }

        if (typeof interval !== 'number' || interval < 0) {
          ack?.({ success: false, error: 'Invalid interval parameter. Must be a number >= 0' });
          return;
        }

        (async () => {
          try {
            if (path && typeof path === 'string') {
              await shootAssistController.setDownloadPath(path);
            }

            await shootAssistController.startBulkShoot(shots, interval);
          } catch (error) {
            const message = `[Capture] Failed to start capture: ${toErrorMessage(error)}`;
            console.error(message);
            io.emit('shoot-assist-error', { message });
          }
        })();

        ack?.({ success: true, message: `Starting capture of ${shots} shots with ${interval}ms interval` });
      }
    );

    socket.on('capture-stop', (_payload: unknown, ack?: (response: CommandAck) => void) => {
      shootAssistController.stopBulkShoot().catch((error) => {
        const message = `[Capture] Failed to stop capture: ${toErrorMessage(error)}`;
        console.error(message);
        io.emit('shoot-assist-error', { message });
      });

      ack?.({ success: true, message: 'Stopping capture...' });
    });

    // Handle display session joining
    socket.on('join-display-session', (sessionId: string) => {
      console.log(`🔌Display joined session: ${sessionId} (socket: ${socket.id})`);
      socket.join(`display-session-${sessionId}`);
      // Notify all viewers in this session that a display joined
      socket.to(`viewer-session-${sessionId}`).emit('display-joined', { sessionId });
    });

    // Handle viewer session joining
    socket.on('join-viewer-session', (sessionId: string) => {
      console.log(`Viewer joined session: ${sessionId} (socket: ${socket.id})`);
      socket.join(`viewer-session-${sessionId}`);
    });

    // Handle display session leaving
    socket.on('leave-display-session', (sessionId: string) => {
      console.log(`Display left session: ${sessionId} (socket: ${socket.id})`);
      socket.leave(`display-session-${sessionId}`);
    });

    // Handle viewer session leaving
    socket.on('leave-viewer-session', (sessionId: string) => {
      console.log(`Viewer left session: ${sessionId} (socket: ${socket.id})`);
      socket.leave(`viewer-session-${sessionId}`);
    });

    // Handle image sync from main viewer to displays
    socket.on('sync-image-to-display', ({ sessionId, folderPath, fileName }: { sessionId: string; folderPath: string; fileName: string }) => {
      console.log(`Syncing image to display session ${sessionId}:`, fileName);
      // Broadcast to all displays in this session
      io.to(`display-session-${sessionId}`).emit('display-image-sync', { folderPath, fileName });
    });

    // Handle thumbnail generation
    socket.on('generate-thumbnails', async (folderPath: string) => {
      console.log('Generate thumbnails request:', folderPath);

      try {
        const watcher = new FileWatcher(folderPath, {
          onThumbnailProgress: (processed: number, total: number) => {
            const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
            console.log(`Progress: ${processed}/${total} (${percentage}%)`);
            socket.emit('thumbnail-progress', { processed, total, percentage, folderPath });
          },
          onThumbnailCreated: (fileName: string) => {
            console.log('Thumbnail created:', fileName);
          },
          onError: (error: Error) => {
            console.error('Thumbnail generation error:', error);
            socket.emit('thumbnail-error', { error: error.message, folderPath });
          },
        });

        // Process existing images - this will call onThumbnailProgress for each created thumbnail
        const result = await watcher.processExistingImages();
        
        console.log(`Thumbnail processing complete: ${result.total} total, ${result.existingThumbnails} existing`);

        // Emit completion
        socket.emit('thumbnail-complete', { 
          total: result.total, 
          files: result.files, 
          folderPath 
        });
      } catch (error) {
        console.error('Failed to generate thumbnails:', error);
        socket.emit('thumbnail-error', { 
          error: error instanceof Error ? error.message : 'Failed to generate thumbnails', 
          folderPath 
        });
      }
    });

    // Handle folder watching
    socket.on('watch-folder', async (folderPath: string) => {
      console.log('Watch folder request:', folderPath);

      try {
        // Stop any existing watcher for this folder
        const existingWatcher = activeWatchers.get(folderPath);
        if (existingWatcher) {
          await existingWatcher.stop();
        }

        // Create new watcher
        const watcher = new FileWatcher(folderPath, {
          onFileAdded: (fileName: string, hasRating?: boolean) => {
            console.log('File added:', fileName, 'hasRating:', hasRating);
            io.emit('file-added', { fileName, hasRating, folderPath });
          },
          onFileChanged: (fileName: string) => {
            console.log('File changed:', fileName);
            io.emit('file-changed', { fileName, folderPath });
          },
          onFileDeleted: (fileName: string) => {
            console.log('File deleted:', fileName);
            io.emit('file-deleted', { fileName, folderPath });
          },
          onError: (error: Error) => {
            console.error('Watcher error:', error);
            socket.emit('watcher-error', { error: error.message, folderPath });
          },
        });

        // Start watching
        await watcher.start();
        activeWatchers.set(folderPath, watcher);

        socket.emit('watch-started', { folderPath });
      } catch (error) {
        console.error('Failed to start watcher:', error);
        socket.emit('watcher-error', { 
          error: error instanceof Error ? error.message : 'Failed to start watcher', 
          folderPath 
        });
      }
    });

    // Handle stop watching
    socket.on('unwatch-folder', async (folderPath: string) => {
      console.log('Unwatch folder request:', folderPath);
      
      try {
        const watcher = activeWatchers.get(folderPath);
        if (watcher) {
          await watcher.stop();
          activeWatchers.delete(folderPath);
        }

        socket.emit('watch-stopped', { folderPath });
      } catch (error) {
        console.error('Failed to stop watcher:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });

  socketServer
    .once('error', (err) => {
      console.error('Socket.IO server error:', err);
      process.exit(1);
    })
    .listen(socketPort, () => {
      console.log(`> Socket.IO server running on http://${hostname}:${socketPort}`);
    });
});
