"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

interface HeaderProps {
  folderName: string | null;
  title?: string | null;
  isFullscreen?: boolean;
  children?: React.ReactNode;
  onCameraControlClick?: () => void;
  onStopCapture?: () => void;
}

export function Header({ 
  folderName, 
  title = '', 
  isFullscreen = false, 
  children,
  onCameraControlClick,
  onStopCapture,
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
      </div>
      <div className="flex items-center gap-3">
        {onCameraControlClick && (
          <button
            className="header-button"
            onClick={onCameraControlClick}
            title="Camera Control"
          >
            <Icon name="camera" />
          </button>
        )}
        {children}
      </div>
    </header>
  );
}
