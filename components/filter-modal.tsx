'use client';

import { Icon } from '@/components/icon';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  showUnrated: boolean;
  setShowUnrated: (value: boolean) => void;
  selectedRatings: Set<number>;
  setSelectedRatings: (ratings: Set<number>) => void;
  availableGroups?: Array<{ id: string; name: string; imageCount?: number }>;
  selectedGroupIds?: Set<string>;
  setSelectedGroupIds?: (groupIds: Set<string>) => void;
  conflictOption?: boolean;
  showConflictsOnly?: boolean;
  setShowConflictsOnly?: (value: boolean) => void;
}

export function FilterModal({
	isOpen,
	onClose,
	showUnrated,
	setShowUnrated,
	selectedRatings,
	setSelectedRatings,
	availableGroups,
	selectedGroupIds,
	setSelectedGroupIds,
	conflictOption,
	showConflictsOnly,
	setShowConflictsOnly,
}: FilterModalProps) {
	if(!isOpen) {return null;}

	const handleClearFilters = () => {
		setShowUnrated(true);
		setSelectedRatings(new Set([1, 2, 3, 4, 5]));
		setSelectedGroupIds?.(new Set());
		setShowConflictsOnly?.(false);
	};

	return (
		<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
			<div className="bg-zinc-900 rounded-lg shadow-2xl max-w-[600px] w-full p-8 border border-zinc-700">
				<div className="flex items-start gap-4 mb-8">
					<div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
						<Icon name="filter_list" />
					</div>
					<div className="flex-1">
						<h3 className="text-zinc-100 font-semibold text-xl mb-2">Filter images</h3>
						<p className="text-zinc-400 text-sm">Click ratings to filter. Hold Shift to select multiple.</p>
					</div>
				</div>

				<div className="space-y-8 mb-8">
					{/* Star ratings */}
					<div>
						<div className="text-zinc-300 text-sm font-medium mb-4">Star ratings</div>
						<div className="flex gap-4 flex-wrap">
							{[1, 2, 3, 4, 5].map((rating) => {
								const emoji = rating === 1 ? '🗑️' : rating === 2 ? '😐' : rating === 3 ? '🤔' : rating === 4 ? '😀' : '🤩';
								const isSelected = selectedRatings.has(rating);
								return (
									<button
										key={rating}
										onClick={(e) => {
											const newSet = new Set(selectedRatings);
											if(e.shiftKey) {
                        // Shift+click: toggle this rating
												if(isSelected) {
													newSet.delete(rating);
												} else {
													newSet.add(rating);
												}
											} else {
                        // Normal click: select only this rating
												newSet.clear();
												newSet.add(rating);
											}
											setSelectedRatings(newSet);
										}}
										className={`flex flex-col items-center justify-center w-20 h-20 rounded-xl transition font-medium cursor-pointer ${
											isSelected
												? 'bg-blue-600 text-white shadow-lg'
												: 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
										}`}
										title={`${rating} star${rating === 1 ? '' : 's'}. Shift+click to select multiple.`}
									>
										<span className="text-4xl mb-1 noto-color-emoji-regular">{emoji}</span>
										<span className="text-xs">{rating} ⭐</span>
									</button>
								);
							})}
						</div>
					</div>

					{/* Groups */}
					{availableGroups && selectedGroupIds && setSelectedGroupIds && (
						<div>
							<div className="text-zinc-300 text-sm font-medium mb-4">Groups</div>
							{availableGroups.length === 0 ? (
								<div className="text-zinc-500 text-sm bg-zinc-800/40 border border-zinc-800 rounded-lg px-3 py-2">
                  No groups available. Group filter is disabled.
								</div>
							) : (
								<div className="max-h-48 overflow-auto space-y-2 pr-1">
									{availableGroups.map((group) => {
										const isSelected = selectedGroupIds.has(group.id);
										const countLabel = typeof group.imageCount === 'number'
											? `${group.imageCount} photo${group.imageCount === 1 ? '' : 's'}`
											: null;

										return (
											<label
												key={group.id}
												className={`flex items-center justify-between gap-4 cursor-pointer p-3 rounded-lg border transition ${
													isSelected
														? 'border-blue-500 bg-blue-500/10'
														: 'border-zinc-800 hover:bg-zinc-800/50'
												}`}
											>
												<div className="flex items-center gap-3 min-w-0">
													<input
														type="checkbox"
														checked={isSelected}
														onChange={(e) => {
															const next = new Set(selectedGroupIds);
															if(e.target.checked) {
																next.add(group.id);
															} else {
																next.delete(group.id);
															}
															setSelectedGroupIds(next);
														}}
														className="w-5 h-5 rounded cursor-pointer"
													/>
													<span className="text-zinc-100 font-medium truncate">{group.name}</span>
												</div>
												{countLabel && (
													<span className="text-zinc-400 text-xs whitespace-nowrap">{countLabel}</span>
												)}
											</label>
										);
									})}
								</div>
							)}
							<p className="text-zinc-500 text-xs mt-2">
                No groups selected keeps current behavior. Selected groups are OR, then combined with ratings as AND.
							</p>
						</div>
					)}
          
					{/* Unrated images and Conflicts */}
					<div>
						<div className="text-zinc-300 text-sm font-medium mb-4">Filter options</div>
						<div className="space-y-3">
							{conflictOption && (
								<label className="flex items-center gap-4 cursor-pointer hover:bg-zinc-800/50 p-3 rounded-lg transition">
									<input
										type="checkbox"
										checked={showConflictsOnly || false}
										onChange={(e) => setShowConflictsOnly?.(e.target.checked)}
										className="w-5 h-5 rounded cursor-pointer"
									/>
									<span className="text-zinc-100 font-medium">Show conflicts only</span>
								</label>
							)}
							<label className="flex items-center gap-4 cursor-pointer hover:bg-zinc-800/50 p-3 rounded-lg transition">
								<input
									type="checkbox"
									checked={showUnrated}
									onChange={(e) => setShowUnrated(e.target.checked)}
									className="w-5 h-5 rounded cursor-pointer"
								/>
								<span className="text-zinc-100 font-medium">Show unrated images</span>
							</label>
						</div>
					</div>
				</div>

				<div className="flex gap-3">
					<button
						className="flex-1 px-4 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg font-medium transition"
						onClick={handleClearFilters}
					>
            Clear filters
					</button>
					<button
						className="flex-1 px-4 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg font-medium transition"
						onClick={onClose}
					>
            Close
					</button>
				</div>
			</div>
		</div>
	);
}
