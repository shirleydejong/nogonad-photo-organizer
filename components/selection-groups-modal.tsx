'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/icon';
import type { GroupRecord } from '@/utils/group-filters';

type SelectedImageRef = {
  fileId: string;
  fileName: string;
};

interface SelectionGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderPath: string;
  groups: GroupRecord[];
  selectedImages: SelectedImageRef[];
  imageGroupIdsByImageId: Map<string, Set<string>>;
  onRelationsUpdated: () => Promise<void> | void;
}

async function getErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
	try {
		const data = await response.json();
		if(typeof data?.error === 'string' && data.error.trim()) {
			return data.error;
		}
	} catch {
    // Ignore parse failures and use fallback message.
	}

	return fallbackMessage;
}

export function SelectionGroupsModal({
	isOpen,
	onClose,
	folderPath,
	groups,
	selectedImages,
	imageGroupIdsByImageId,
	onRelationsUpdated,
}: SelectionGroupsModalProps) {
	const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
	const [busyAction, setBusyAction] = useState<'link' | 'unlink' | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const selectedCount = selectedImages.length;
	const isBusy = busyGroupId !== null;

	const linkedCountByGroup = useMemo(() => {
		const result = new Map<string, number>();
		for(const group of groups) {
			let linkedCount = 0;
			for(const image of selectedImages) {
				if(imageGroupIdsByImageId.get(image.fileId)?.has(group.id)) {
					linkedCount += 1;
				}
			}
			result.set(group.id, linkedCount);
		}
		return result;
	}, [groups, selectedImages, imageGroupIdsByImageId]);

	async function linkGroupToSelection(groupId: string, groupName: string) {
		if(!folderPath || selectedCount === 0) {
			return;
		}

		setBusyGroupId(groupId);
		setBusyAction('link');
		setError(null);
		setNotice(null);

		try {
			const pendingImageIds = selectedImages
				.filter((image) => !(imageGroupIdsByImageId.get(image.fileId)?.has(groupId) ?? false))
				.map((image) => image.fileId);

			if(pendingImageIds.length === 0) {
				setNotice(`All selected images are already linked to "${groupName}".`);
				return;
			}

			const linkResponse = await fetch('/api/image-groups', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					folderPath,
					imageIds: pendingImageIds,
					groupId,
				}),
			});

			if(!linkResponse.ok) {
				throw new Error(await getErrorMessage(linkResponse, `Failed to link group "${groupName}"`));
			}

			const linkData = await linkResponse.json();

			await Promise.resolve(onRelationsUpdated());
			setNotice(`Linked ${linkData.createdCount ?? pendingImageIds.length} selected image${pendingImageIds.length === 1 ? '' : 's'} to "${groupName}".`);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to link selected images');
		} finally {
			setBusyGroupId(null);
			setBusyAction(null);
		}
	}

	async function unlinkGroupFromSelection(groupId: string, groupName: string) {
		if(!folderPath || selectedCount === 0) {
			return;
		}

		setBusyGroupId(groupId);
		setBusyAction('unlink');
		setError(null);
		setNotice(null);

		try {
			const linkedImageIds = selectedImages
				.filter((image) => imageGroupIdsByImageId.get(image.fileId)?.has(groupId) ?? false)
				.map((image) => image.fileId);

			if(linkedImageIds.length === 0) {
				setNotice(`No selected images are linked to "${groupName}".`);
				return;
			}

			const unlinkResponse = await fetch('/api/image-groups', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					folderPath,
					imageIds: linkedImageIds,
					groupId,
				}),
			});

			if(!unlinkResponse.ok) {
				throw new Error(await getErrorMessage(unlinkResponse, `Failed to unlink group "${groupName}"`));
			}

			const unlinkData = await unlinkResponse.json();

			await Promise.resolve(onRelationsUpdated());
			setNotice(`Unlinked ${unlinkData.deletedCount ?? linkedImageIds.length} selected image${linkedImageIds.length === 1 ? '' : 's'} from "${groupName}".`);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to unlink selected images');
		} finally {
			setBusyGroupId(null);
			setBusyAction(null);
		}
	}

	if(!isOpen) {
		return null;
	}

	return (
		<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
			<div className="bg-zinc-900 rounded-lg shadow-2xl max-w-[760px] w-full p-6 border border-zinc-700">
				<div className="flex items-start gap-4 mb-6">
					<div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
						<Icon name="group_work" />
					</div>
					<div className="flex-1">
						<h3 className="text-zinc-100 font-semibold text-xl mb-2">Selected images groups</h3>
						<p className="text-zinc-400 text-sm">
              Link or unlink {selectedCount} selected image{selectedCount === 1 ? '' : 's'} to groups.
						</p>
					</div>
				</div>

				{error && (
					<div className="mb-4 px-3 py-2 rounded border border-red-800 bg-red-950/40 text-red-300 text-sm">
						{error}
					</div>
				)}

				{notice && (
					<div className="mb-4 px-3 py-2 rounded border border-green-800 bg-green-950/40 text-green-300 text-sm">
						{notice}
					</div>
				)}

				<div className="border border-zinc-700 rounded-lg overflow-hidden mb-5">
					<div className="grid grid-cols-[minmax(0,1fr)_130px_230px] gap-2 bg-zinc-800 px-4 py-2 text-xs uppercase tracking-wider text-zinc-400">
						<div>Group</div>
						<div>Linked</div>
						<div>Actions</div>
					</div>

					<div className="max-h-[420px] overflow-auto">
						{groups.length === 0 ? (
							<div className="px-4 py-5 text-zinc-500 text-sm">No groups available. Create a group first.</div>
						) : (
							groups.map((group) => {
								const linkedCount = linkedCountByGroup.get(group.id) ?? 0;
								const allLinked = linkedCount === selectedCount && selectedCount > 0;
								const noneLinked = linkedCount === 0;
								const thisRowBusy = busyGroupId === group.id;

								return (
									<div
										key={group.id}
										className="grid grid-cols-[minmax(0,1fr)_130px_230px] gap-2 px-4 py-3 border-t border-zinc-800 items-center"
									>
										<div className="text-zinc-100 truncate" title={group.name}>
											{group.name}
										</div>

										<div className="text-zinc-300 text-sm">
											{linkedCount}/{selectedCount}
										</div>

										<div className="flex items-center gap-2">
											<button
												type="button"
												onClick={() => void linkGroupToSelection(group.id, group.name)}
												disabled={isBusy || allLinked || selectedCount === 0}
												className="px-2.5 py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition cursor-pointer"
												title="Link selected images to this group"
											>
												{thisRowBusy && busyAction === 'link' ? 'Linking...' : 'Link'}
											</button>

											<button
												type="button"
												onClick={() => void unlinkGroupFromSelection(group.id, group.name)}
												disabled={isBusy || noneLinked || selectedCount === 0}
												className="px-2.5 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 text-xs font-medium transition cursor-pointer"
												title="Unlink selected images from this group"
											>
												{thisRowBusy && busyAction === 'unlink' ? 'Unlinking...' : 'Unlink'}
											</button>
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>

				<div className="flex justify-end">
					<button
						type="button"
						className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg font-medium transition"
						onClick={onClose}
					>
            Close
					</button>
				</div>
			</div>
		</div>
	);
}
