import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import config from './config';
import { Server as SocketIOServer } from 'socket.io';
import FolderWatcher, { FileChangeEvent } from './controllers/watcher';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = config.HTTP_PORT;
const socketPort = config.SOCKET_PORT; // Separate port for Socket.IO to avoid conflicts with Next.js HMR

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store active watchers per folder
const activeWatchers = new Map<string, FolderWatcher>();

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

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle thumbnail generation
    socket.on('generate-thumbnails', async (folderPath: string) => {
      console.log('Generate thumbnails request:', folderPath);

      try {
        const watcher = new FolderWatcher(folderPath, {
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
        const watcher = new FolderWatcher(folderPath, {
          onFileAdded: (fileName: string, hasRating: boolean) => {
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
