'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (filename: string, prefix: string) => void;
  defaultFilename: string;
}

export function ExportModal({
	isOpen,
	onClose,
	onExport,
	defaultFilename,
}: ExportModalProps) {
	const [filename, setFilename] = useState(defaultFilename);
	const [prefix, setPrefix] = useState('');
	const [usePrefix, setUsePrefix] = useState(false);

	if(!isOpen) {return null;}

	const handleExport = (e: React.FormEvent) => {
		e.preventDefault();
		onExport(filename, usePrefix ? prefix : '');
		onClose();
	};

	return (
		<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
			<div className="bg-zinc-900 rounded-lg shadow-2xl max-w-[500px] w-full p-8 border border-zinc-700">
				<div className="flex items-start gap-4 mb-8">
					<div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
						<Icon name="download" />
					</div>
					<div className="flex-1">
						<h3 className="text-zinc-100 font-semibold text-xl mb-2">Export Ratings</h3>
						<p className="text-zinc-400 text-sm">Download your ratings as a JSON file.</p>
					</div>
				</div>

				<form onSubmit={handleExport} className="space-y-6">
					<div className="space-y-2">
						<label htmlFor="filename" className="block text-sm font-medium text-zinc-300">
              Filename
						</label>
						<div className="flex gap-2 items-center">
							<input
								id="filename"
								type="text"
								value={filename}
								onChange={(e) => setFilename(e.target.value)}
								className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
								placeholder="ratings"
								required
							/>
							<span className="text-zinc-500">.json</span>
						</div>
					</div>

					<div className="space-y-3 pt-2">
						<label className="flex items-center gap-3 cursor-pointer group">
							<div className="relative flex items-center">
								<input
									type="checkbox"
									checked={usePrefix}
									onChange={(e) => setUsePrefix(e.target.checked)}
									className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
								/>
							</div>
							<span className="text-zinc-300 text-sm font-medium group-hover:text-zinc-100">Add prefix to filenames</span>
						</label>

						{usePrefix && (
							<div className="pl-8 space-y-2">
								<input
									type="text"
									value={prefix}
									onChange={(e) => setPrefix(e.target.value)}
									className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="e.g. collection_"
									autoFocus
								/>
								<p className="text-xs text-zinc-500">
                  Example: <span className="text-zinc-400">{prefix}IMG_1234.jpg</span>
								</p>
							</div>
						)}
					</div>

					<div className="flex gap-3 justify-end pt-4">
						<button
							type="button"
							onClick={onClose}
							className="px-6 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition font-medium"
						>
              Cancel
						</button>
						<button
							type="submit"
							className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition font-medium"
						>
              Export JSON
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
