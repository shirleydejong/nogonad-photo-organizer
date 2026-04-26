'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icon';
import { emptyGroupFilterData, fetchGroupFilterData, type GroupRecord } from '@/utils/group-filters';

interface GroupWithCount extends GroupRecord {
  imageCount: number;
}

interface GroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderPath: string;
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

export function GroupsModal({ isOpen, onClose, folderPath }: GroupsModalProps) {
	const [groups, setGroups] = useState<GroupRecord[]>([]);
	const [groupCounts, setGroupCounts] = useState<Map<string, number>>(new Map());
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [newGroupName, setNewGroupName] = useState<string>('');
	const [isCreating, setIsCreating] = useState<boolean>(false);
	const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState<string>('');
	const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
	const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

	const loadGroups = useCallback(async() => {
		if(!folderPath) {
			const emptyData = emptyGroupFilterData();
			setGroups(emptyData.groups);
			setGroupCounts(emptyData.groupCounts);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const groupFilterData = await fetchGroupFilterData(folderPath);
			setGroups(groupFilterData.groups);
			setGroupCounts(groupFilterData.groupCounts);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load groups');
		} finally {
			setIsLoading(false);
		}
	}, [folderPath]);

	useEffect(() => {
		if(isOpen) {
			void loadGroups();
		}
	}, [isOpen, loadGroups]);

	useEffect(() => {
		if(!isOpen) {
			setNewGroupName('');
			setEditingGroupId(null);
			setEditingName('');
			setError(null);
		}
	}, [isOpen]);

	const groupsWithCounts = useMemo<GroupWithCount[]>(
		() => groups.map((group) => ({ ...group, imageCount: groupCounts.get(group.id) ?? 0 })),
		[groups, groupCounts]
	);

	const handleCreateGroup = async() => {
		const normalizedName = newGroupName.trim();
		if(!normalizedName || !folderPath) {
			return;
		}

		setIsCreating(true);
		setError(null);

		try {
			const response = await fetch('/api/groups', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					folderPath,
					name: normalizedName,
				}),
			});

			if(!response.ok) {
				throw new Error(await getErrorMessage(response, 'Failed to create group'));
			}

			setNewGroupName('');
			await loadGroups();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create group');
		} finally {
			setIsCreating(false);
		}
	};

	const handleSaveGroup = async() => {
		const normalizedName = editingName.trim();
		if(!editingGroupId || !normalizedName || !folderPath) {
			return;
		}

		setSavingGroupId(editingGroupId);
		setError(null);

		try {
			const response = await fetch('/api/groups', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					folderPath,
					id: editingGroupId,
					name: normalizedName,
				}),
			});

			if(!response.ok) {
				throw new Error(await getErrorMessage(response, 'Failed to update group'));
			}

			setEditingGroupId(null);
			setEditingName('');
			await loadGroups();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update group');
		} finally {
			setSavingGroupId(null);
		}
	};

	const handleDeleteGroup = async(group: GroupWithCount) => {
		if(!folderPath) {
			return;
		}

		const confirmed = window.confirm(
			`Delete group "${group.name}"?\n\nThis group currently has ${group.imageCount} photo${group.imageCount === 1 ? '' : 's'}.`
		);

		if(!confirmed) {
			return;
		}

		setDeletingGroupId(group.id);
		setError(null);

		try {
			const response = await fetch('/api/groups', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					folderPath,
					id: group.id,
				}),
			});

			if(!response.ok) {
				throw new Error(await getErrorMessage(response, 'Failed to delete group'));
			}

			if(editingGroupId === group.id) {
				setEditingGroupId(null);
				setEditingName('');
			}

			await loadGroups();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete group');
		} finally {
			setDeletingGroupId(null);
		}
	};

	if(!isOpen) {
		return null;
	}

	return (
		<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
			<div className="bg-zinc-900 rounded-lg shadow-2xl max-w-[760px] w-full p-6 border border-zinc-700">
				<div className="flex items-start gap-4 mb-6">
					<div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500/20 text-zinc-200 flex items-center justify-center">
						<Icon name="folder_managed" />
					</div>
					<div className="flex-1">
						<h3 className="text-zinc-100 font-semibold text-xl mb-2">Manage groups</h3>
						<p className="text-zinc-400 text-sm">View, rename, create and delete groups. Photo counts are shown per group.</p>
					</div>
				</div>

				{error && (
					<div className="mb-4 px-3 py-2 rounded border border-red-800 bg-red-950/40 text-red-300 text-sm">
						{error}
					</div>
				)}

				<div className="mb-5 flex gap-2">
					<input
						type="text"
						value={newGroupName}
						onChange={(event) => setNewGroupName(event.target.value)}
						onKeyDown={(event) => {
							if(event.key === 'Enter') {
								event.preventDefault();
								void handleCreateGroup();
							}
						}}
						placeholder="New group name"
						className="flex-1 px-3 py-2 rounded border border-zinc-700 bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					<button
						type="button"
						onClick={() => void handleCreateGroup()}
						disabled={isCreating || !newGroupName.trim() || !folderPath}
						className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition cursor-pointer flex items-center gap-2"
					>
						<Icon name="add" />
            Create
					</button>
				</div>

				<div className="border border-zinc-700 rounded-lg overflow-hidden">
					<div className="grid grid-cols-[minmax(0,1fr)_140px_170px] gap-2 bg-zinc-800 px-4 py-2 text-xs uppercase tracking-wider text-zinc-400">
						<div>Group</div>
						<div>Photos</div>
						<div>Actions</div>
					</div>

					<div className="max-h-[420px] overflow-auto">
						{isLoading && (
							<div className="px-4 py-5 text-zinc-400 text-sm">Loading groups…</div>
						)}

						{!isLoading && groupsWithCounts.length === 0 && (
							<div className="px-4 py-5 text-zinc-500 text-sm">No groups yet. Create your first group above.</div>
						)}

						{!isLoading &&
              groupsWithCounts.map((group) => {
              	const isEditing = editingGroupId === group.id;
              	const isSaving = savingGroupId === group.id;
              	const isDeleting = deletingGroupId === group.id;

              	return (
              		<div
              			key={group.id}
              			className="grid grid-cols-[minmax(0,1fr)_140px_170px] gap-2 px-4 py-3 border-t border-zinc-800 items-center"
              		>
              			<div>
              				{isEditing ? (
              					<input
              						type="text"
              						value={editingName}
              						onChange={(event) => setEditingName(event.target.value)}
              						onKeyDown={(event) => {
              							if(event.key === 'Enter') {
              								event.preventDefault();
              								void handleSaveGroup();
              							}
              							if(event.key === 'Escape') {
              								setEditingGroupId(null);
              								setEditingName('');
              							}
              						}}
              						autoFocus
              						className="w-full px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              					/>
              				) : (
              					<div className="text-zinc-100 truncate" title={group.name}>
              						{group.name}
              					</div>
              				)}
              			</div>

              			<div className="text-zinc-300 text-sm">
              				{group.imageCount} photo{group.imageCount === 1 ? '' : 's'}
              			</div>

              			<div className="flex items-center gap-2">
              				{isEditing ? (
              					<>
              						<button
              							type="button"
              							onClick={() => void handleSaveGroup()}
              							disabled={isSaving || !editingName.trim()}
              							className="px-2.5 py-1.5 rounded bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition cursor-pointer flex items-center gap-1"
              							title="Save group name"
              						>
              							<Icon name="check" size={16} /> Save
              						</button>
              						<button
              							type="button"
              							onClick={() => {
              								setEditingGroupId(null);
              								setEditingName('');
              							}}
              							className="px-2.5 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-xs font-medium transition cursor-pointer"
              							title="Cancel editing"
              						>
                            Cancel
              						</button>
              					</>
              				) : (
              					<>
              						<button
              							type="button"
              							onClick={() => {
              								setEditingGroupId(group.id);
              								setEditingName(group.name);
              							}}
              							disabled={isDeleting}
              							className="px-2.5 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-100 text-xs font-medium transition cursor-pointer flex items-center gap-1"
              							title="Rename group"
              						>
              							<Icon name="edit" size={16} /> Rename
              						</button>
              						<button
              							type="button"
              							onClick={() => void handleDeleteGroup(group)}
              							disabled={isDeleting}
              							className="px-2.5 py-1.5 rounded bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition cursor-pointer flex items-center gap-1"
              							title="Delete group"
              						>
              							<Icon name="delete" size={16} /> Delete
              						</button>
              					</>
              				)}
              			</div>
              		</div>
              	);
              })}
					</div>
				</div>

				<div className="mt-5 flex justify-end">
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
