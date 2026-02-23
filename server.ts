import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import FolderWatcher, { FileChangeEvent } from './controllers/watcher';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

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

  // Initialize Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

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
      console.log('> Socket.IO server is running');
    });
});
