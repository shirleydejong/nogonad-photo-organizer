"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { getSocket } from "@/utils/socket";

export default function DisplayPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session") || "default";
  
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    console.log('Display page mounted with session:', sessionId);

    const handleConnect = () => {
      console.log('Display connected:', socket.id, 'Joining session:', sessionId);
      setIsConnected(true);
      // Join session room
      socket.emit('join-display-session', sessionId);
    };

    const handleDisconnect = () => {
      console.log('Display disconnected');
      setIsConnected(false);
    };

    const handleImageSync = ({ folderPath, fileName }: { folderPath: string; fileName: string }) => {
      console.log('Image sync received:', { folderPath, fileName, sessionId });

      // Construct image path
      const normalizedPath = folderPath.replace(/\//g, '\\');
      const encodedPath = encodeURIComponent(fileName);
      const imagePath = `/api/image/${encodedPath}?folderPath=${encodeURIComponent(normalizedPath)}&fileName=${encodedPath}`;
      console.log('Setting image path:', imagePath);
      setImagePath(imagePath);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('display-image-sync', handleImageSync);

    // If already connected, join session
    if (socket.connected) {
      console.log('Socket already connected, joining session immediately');
      handleConnect();
    }

    return () => {
      console.log('Display page unmounting, leaving session:', sessionId);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('display-image-sync', handleImageSync);
      socket.emit('leave-display-session', sessionId);
    };
  }, [sessionId]);

  return (
    <div className="w-screen h-screen bg-black flex items-center justify-center overflow-hidden">
      {imagePath ? (
        <img
          key={imagePath}
          src={imagePath}
          alt="Display image"
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-zinc-800 border-t-zinc-400 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <p className="text-lg text-zinc-300">Waiting for image...</p>
        </div>
      )}
    </div>
  );
}
