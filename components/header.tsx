"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

interface HeaderProps {
  folderName: string | null;
  title?: string | null;
  isFullscreen?: boolean;
  children?: React.ReactNode;
  onCameraControlClick?: () => void;
  showCaptureProgress?: boolean;
  captureProgress?: { current: number; total: number; percentage: number } | null;
}

export function Header({ 
  folderName, 
  title = '', 
  isFullscreen = false, 
  children,
  onCameraControlClick,
  showCaptureProgress = false,
  captureProgress,
}: HeaderProps) {
  const router = useRouter();

  return (
    <header 
      id="top-toolbar" 
      className={`w-full flex items-center justify-between px-8 py-3 border-b border-zinc-800 flex-shrink-0 ${isFullscreen ? 'hidden' : ''}`}
    >
      <div className="flex items-center gap-3">
        <button
          className="header-button"
          onClick={() => router.push('/select-folder')}
        >
          <Icon name="arrow_back" /> Choose another folder
        </button>
        {folderName && <span className="text-zinc-500 text-sm truncate max-w-[12rem]">{folderName}</span>}
      </div>
      <div className="flex items-center justify-center flex-1 gap-4">
        {title && (
          <span className="text-zinc-300 text-m font-bold truncate max-w-[20rem]">{title}</span>
        )}
        {/* Mini progress bar when capture is active and modal is closed */}
        {showCaptureProgress && captureProgress && (
          <div className="flex items-center gap-3 px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
            <Icon name="camera" size={16} />
            <div className="flex flex-col gap-1 min-w-[120px]">
              <span className="text-zinc-300 text-xs font-mono">
                {captureProgress.current}/{captureProgress.total}
              </span>
              <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${captureProgress.percentage}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {onCameraControlClick && (
          <button
            className="header-button"
            onClick={onCameraControlClick}
            title="Camera Control"
          >
            <Icon name="camera" /> Camera Control
          </button>
        )}
        {children}
      </div>
    </header>
  );
}
