"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File) => void;
  isLoading?: boolean;
}

export function ImportModal({
  isOpen,
  onClose,
  onImport,
  isLoading = false,
}: ImportModalProps) {
  const [dragActive, setDragActive] = useState(false);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/json" || file.name.endsWith(".json")) {
        onImport(file);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      onImport(files[0]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-lg shadow-2xl max-w-[500px] w-full p-8 border border-zinc-700">
        <div className="flex items-start gap-4 mb-8">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
            <Icon name="upload" />
          </div>
          <div className="flex-1">
            <h3 className="text-zinc-100 font-semibold text-xl mb-2">Import Ratings</h3>
            <p className="text-zinc-400 text-sm">Upload a JSON file with ratings. Existing ratings in the database will be skipped.</p>
          </div>
        </div>

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer ${
            dragActive
              ? "border-blue-500 bg-blue-500/10"
              : "border-zinc-600 hover:border-zinc-500 hover:bg-zinc-800/30"
          } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="flex flex-col items-center gap-3">
            <Icon name="cloud_upload" size={32} className="text-zinc-400" />
            <div>
              <p className="text-zinc-100 font-medium">Drag and drop your JSON file here</p>
              <p className="text-zinc-500 text-sm mt-1">or</p>
            </div>
            <label className="relative cursor-pointer">
              <input
                type="file"
                accept=".json"
                onChange={handleFileInput}
                disabled={isLoading}
                className="hidden"
              />
              <span className="text-blue-400 hover:text-blue-300 font-medium">click to browse</span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-6 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
