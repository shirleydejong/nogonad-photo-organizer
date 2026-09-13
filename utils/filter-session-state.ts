import { sanitizeSelectedGroupIds, type GroupRecord } from '@/utils/group-filters';

const FILTER_STORAGE_PREFIX = 'npo:folder-filters:v1:';

export type FolderFilterState = {
	showUnrated: boolean;
	selectedRatings: Set<number>;
	selectedGroupIds: Set<string>;
	selectedFileTypes: Set<string>;
	showConflictsOnly: boolean;
};

type StoredFolderFilterState = {
	showUnrated?: boolean;
	selectedRatings?: number[];
	selectedGroupIds?: string[];
	selectedFileTypes?: string[];
	showConflictsOnly?: boolean;
};

function getStorageKey(folderPath: string): string {
	return `${FILTER_STORAGE_PREFIX}${folderPath}`;
}

function parseStoredFilterState(folderPath: string): StoredFolderFilterState | null {
	if(typeof window === 'undefined' || !folderPath) {
		return null;
	}

	try {
		const raw = sessionStorage.getItem(getStorageKey(folderPath));
		if(!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as StoredFolderFilterState;
		if(!parsed || typeof parsed !== 'object') {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function sanitizeRatings(ratings: number[] | undefined): Set<number> {
	const validRatings = new Set([1, 2, 3, 4, 5]);
	if(!Array.isArray(ratings)) {
		return new Set(validRatings);
	}
	return new Set(ratings.filter((rating) => validRatings.has(rating)));
}

function sanitizeFileTypes(selectedFileTypes: string[] | undefined, availableFileTypes: string[]): Set<string> {
	const availableSet = new Set(availableFileTypes);
	if(!Array.isArray(selectedFileTypes)) {
		return new Set(availableFileTypes);
	}
	return new Set(selectedFileTypes.filter((fileType) => availableSet.has(fileType)));
}

export function readFolderFilterState(folderPath: string, availableFileTypes: string[]): FolderFilterState {
	const stored = parseStoredFilterState(folderPath);
	return {
		showUnrated: stored?.showUnrated ?? true,
		selectedRatings: sanitizeRatings(stored?.selectedRatings),
		selectedGroupIds: new Set(Array.isArray(stored?.selectedGroupIds) ? stored.selectedGroupIds : []),
		selectedFileTypes: sanitizeFileTypes(stored?.selectedFileTypes, availableFileTypes),
		showConflictsOnly: stored?.showConflictsOnly ?? false,
	};
}

export function saveFolderFilterState(
	folderPath: string,
	state: {
		showUnrated: boolean;
		selectedRatings: Set<number>;
		selectedGroupIds: Set<string>;
		selectedFileTypes: Set<string>;
		showConflictsOnly?: boolean;
	},
	options?: {
		availableGroups?: GroupRecord[];
		availableFileTypes?: string[];
	}
): void {
	if(typeof window === 'undefined' || !folderPath) {
		return;
	}

	const existingState = parseStoredFilterState(folderPath);

	const sanitizedGroups = options?.availableGroups
		? sanitizeSelectedGroupIds(state.selectedGroupIds, options.availableGroups)
		: state.selectedGroupIds;

	const sanitizedFileTypes = options?.availableFileTypes
		? sanitizeFileTypes(Array.from(state.selectedFileTypes), options.availableFileTypes)
		: state.selectedFileTypes;

	const payload: StoredFolderFilterState = {
		showUnrated: state.showUnrated,
		selectedRatings: Array.from(state.selectedRatings).sort((a, b) => a - b),
		selectedGroupIds: Array.from(sanitizedGroups),
		selectedFileTypes: Array.from(sanitizedFileTypes).sort((a, b) => a.localeCompare(b)),
		showConflictsOnly: state.showConflictsOnly ?? existingState?.showConflictsOnly ?? false,
	};

	sessionStorage.setItem(getStorageKey(folderPath), JSON.stringify(payload));
}
