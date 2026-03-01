"use client";

import { useState, useEffect } from "react";
import { Icon } from "@/components/icon";

interface CameraControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  isShootAssistRunning: boolean;
  isCapturing: boolean;
  captureProgress: { current: number; total: number; percentage: number } | null;
  folderPath: string;
  onStartShootAssist: () => void;
  onStopShootAssist: () => void;
  onStartCapture: (shots: number, interval: number) => void;
  onStopCapture: () => void;
}

export function CameraControlModal({
  isOpen,
  onClose,
  isShootAssistRunning,
  isCapturing,
  captureProgress,
  folderPath,
  onStartShootAssist,
  onStopShootAssist,
  onStartCapture,
  onStopCapture,
}: CameraControlModalProps) {
  const [shots, setShots] = useState<number>(20);
  const [interval, setInterval] = useState<number>(1000);

  if (!isOpen) return null;

  const handleStartCapture = () => {
    if (shots > 0 && interval >= 0) {
      onStartCapture(shots, interval);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-lg shadow-2xl max-w-[500px] w-full p-8 border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-zinc-100 font-semibold text-xl">Camera Control</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition"
            title="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* ShootAssist Status */}
        {!isShootAssistRunning ? (
          <div className="mb-6">
            <p className="text-zinc-300 text-sm mb-4">
              ShootAssist is not running. Start it to control your camera.
            </p>
            <button
              onClick={onStartShootAssist}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition flex items-center justify-center gap-2"
            >
              <Icon name="play_arrow" />
              Start ShootAssist
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status indicator */}
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-zinc-300">ShootAssist Running</span>
            </div>

            {/* Capture Configuration */}
            <div className="space-y-4">
              <div>
                <label className="block text-zinc-300 text-sm font-medium mb-2">
                  Number of Photos
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={shots}
                  onChange={(e) => setShots(parseInt(e.target.value) || 1)}
                  disabled={isCapturing}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-zinc-300 text-sm font-medium mb-2">
                  Interval (milliseconds)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60000"
                  value={interval}
                  onChange={(e) => setInterval(parseInt(e.target.value) || 0)}
                  disabled={isCapturing}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="text-xs text-zinc-400">
                <Icon name="folder" size={14} /> Saving to: {folderPath || 'No folder selected'}
              </div>
            </div>

            {/* Progress Bar */}
            {isCapturing && captureProgress && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-300">Capturing...</span>
                  <span className="text-zinc-300 font-mono">
                    {captureProgress.current}/{captureProgress.total}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${captureProgress.percentage}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {!isCapturing ? (
                <button
                  onClick={handleStartCapture}
                  disabled={!folderPath}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded font-medium transition flex items-center justify-center gap-2"
                >
                  <Icon name="camera" />
                  Start Bulk Capture
                </button>
              ) : (
                <button
                  onClick={onStopCapture}
                  className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded font-medium transition flex items-center justify-center gap-2"
                >
                  <Icon name="stop" />
                  Stop Current Bulk
                </button>
              )}

              {/* Terminate ShootAssist - less prominent */}
              <button
                onClick={onStopShootAssist}
                className="w-full px-4 py-2 bg-zinc-800 hover:bg-red-900 text-zinc-400 hover:text-white rounded text-sm transition flex items-center justify-center gap-2"
              >
                <Icon name="power_settings_new" size={16} />
                Terminate ShootAssist
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
