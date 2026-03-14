export type GroupRecord = {
  id: string;
  name: string;
};

export type ImageGroupRelation = {
  imageId: string;
  groupId: string;
};

export type GroupFilterData = {
  groups: GroupRecord[];
  groupCounts: Map<string, number>;
  imageGroupIdsByImageId: Map<string, Set<string>>;
};

export function emptyGroupFilterData(): GroupFilterData {
  return {
    groups: [],
    groupCounts: new Map(),
    imageGroupIdsByImageId: new Map(),
  };
}

export function sanitizeSelectedGroupIds(selectedGroupIds: Set<string>, groups: GroupRecord[]): Set<string> {
  const groupIdSet = new Set(groups.map((group) => group.id));
  return new Set(Array.from(selectedGroupIds).filter((groupId) => groupIdSet.has(groupId)));
}

export async function fetchGroupFilterData(folderPath: string): Promise<GroupFilterData> {
  if (!folderPath) {
    return emptyGroupFilterData();
  }

  const encodedFolderPath = encodeURIComponent(folderPath);
  const [groupsResponse, relationsResponse] = await Promise.all([
    fetch(`/api/groups?folderPath=${encodedFolderPath}`),
    fetch(`/api/image-groups?folderPath=${encodedFolderPath}`),
  ]);

  if (!groupsResponse.ok || !relationsResponse.ok) {
    throw new Error('Failed to load groups for filtering');
  }

  const groupsData = await groupsResponse.json();
  const relationsData = await relationsResponse.json();

  const groups: GroupRecord[] = Array.isArray(groupsData?.groups)
    ? groupsData.groups.filter((group: GroupRecord) => group && typeof group.id === 'string' && typeof group.name === 'string')
    : [];

  const relations: ImageGroupRelation[] = Array.isArray(relationsData?.relations)
    ? relationsData.relations.filter(
        (relation: ImageGroupRelation) =>
          relation &&
          typeof relation.imageId === 'string' &&
          typeof relation.groupId === 'string'
      )
    : [];

  const relationMap = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  for (const relation of relations) {
    if (!relationMap.has(relation.imageId)) {
      relationMap.set(relation.imageId, new Set());
    }
    relationMap.get(relation.imageId)?.add(relation.groupId);
    counts.set(relation.groupId, (counts.get(relation.groupId) ?? 0) + 1);
  }

  return {
    groups,
    groupCounts: counts,
    imageGroupIdsByImageId: relationMap,
  };
}
