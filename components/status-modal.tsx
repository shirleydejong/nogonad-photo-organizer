"use client";

import { Icon } from "@/components/icon";

interface StatusModalProps {
  isOpen: boolean;
  status: 'loading' | 'success' | 'error';
  message: string;
  errorDetails?: string;
  onClose: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  showProgress?: boolean;
}

export function StatusModal({
  isOpen,
  status,
  message,
  errorDetails,
  onClose,
  secondaryActionLabel,
  onSecondaryAction,
  showProgress,
}: StatusModalProps) {
  if (!isOpen) return null;

  const isComplete = (status === 'success' || status === 'error') && !showProgress;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-lg shadow-2xl max-w-[500px] w-full p-8 border border-zinc-700">
        {/* Icon and heading */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${status === 'loading' ? 'bg-blue-500/20' :
            status === 'success' ? 'bg-green-500/20' :
              'bg-red-500/20'
            }`}>
            {status === 'loading' && (
              <div className="animate-spin">
                <Icon name="hourglass_top" />
              </div>
            )}
            {status === 'success' && <Icon name="check_circle" />}
            {status === 'error' && <Icon name="error" />}
          </div>
          <div className="flex-1">
            <h3 className="text-zinc-100 font-semibold text-lg mb-1">
              {status === 'loading' ? 'Processing...' :
                status === 'success' ? 'Success' :
                  'Error'}
            </h3>
            <p className="text-zinc-300 text-sm">{message}</p>
            {errorDetails && status === 'error' && (
              <p className="text-zinc-400 text-xs mt-2">{errorDetails}</p>
            )}
          </div>
        </div>

        {/* Loading indicator */}
        {(status === 'loading' || showProgress) && (
          <div className="mb-6">
            <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full w-1/3 animate-pulse"></div>
            </div>
          </div>
        )}

        {/* Buttons */}
        {(!showProgress || status === 'error') && (
          <div className="flex gap-4">
            <button
              onClick={onClose}
              disabled={!isComplete && status !== 'error'}
              className={`flex-1 px-4 py-2.5 rounded font-medium transition ${isComplete || status === 'error'
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer border border-zinc-600'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-50'
                }`}
            >
              {isComplete || status === 'error' ? 'Close' : 'Please wait...'}
            </button>

            {status === 'success' && secondaryActionLabel && onSecondaryAction && !showProgress && (
              <button
                onClick={onSecondaryAction}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Icon name="delete" />
                {secondaryActionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
