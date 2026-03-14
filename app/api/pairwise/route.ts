import { access } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';

import {
  getAllGroups,
  getGroup,
  getGroupRatedImages,
  getPairwiseComparisonsForImageIds,
  upsertPairwiseComparison,
  type GroupRatedImageRecord,
} from '@/controllers/database';

type NextPair = {
  leftImageId: string;
  rightImageId: string;
} | null;

type GroupProgress = {
  groupId: string;
  groupName: string;
  minRating: number;
  eligibleCount: number;
  totalPairs: number;
  completedPairs: number;
  remainingPairs: number;
  hasRanking: boolean;
};

type RankingRow = {
  imageId: string;
  rating: number;
  wins: number;
  losses: number;
  skips: number;
  score: number;
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMinRating(value: unknown, fallback: number = 1): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(5, parsed));
}

function calculatePairCount(count: number): number {
  return count < 2 ? 0 : (count * (count - 1)) / 2;
}

function buildPairKey(imageAId: string, imageBId: string): string {
  return imageAId < imageBId ? `${imageAId}::${imageBId}` : `${imageBId}::${imageAId}`;
}

function toNextPair(imageAId: string, imageBId: string): NextPair {
  if (Math.random() < 0.5) {
    return {
      leftImageId: imageAId,
      rightImageId: imageBId,
    };
  }

  return {
    leftImageId: imageBId,
    rightImageId: imageAId,
  };
}

function pickRandomRemainingPair(imageIds: string[], donePairKeys: Set<string>): NextPair {
  let candidateCount = 0;
  let selected: { imageAId: string; imageBId: string } | null = null;

  for (let i = 0; i < imageIds.length; i += 1) {
    for (let j = i + 1; j < imageIds.length; j += 1) {
      const imageAId = imageIds[i];
      const imageBId = imageIds[j];
      const key = buildPairKey(imageAId, imageBId);

      if (donePairKeys.has(key)) {
        continue;
      }

      candidateCount += 1;
      if (Math.random() < 1 / candidateCount) {
        selected = { imageAId, imageBId };
      }
    }
  }

  if (!selected) {
    return null;
  }

  return toNextPair(selected.imageAId, selected.imageBId);
}

function getDonePairKeys(folderPath: string, imageIds: string[]): Set<string> {
  const comparisons = getPairwiseComparisonsForImageIds(folderPath, imageIds);
  const doneKeys = new Set<string>();

  for (const comparison of comparisons) {
    doneKeys.add(buildPairKey(comparison.imageAId, comparison.imageBId));
  }

  return doneKeys;
}

function buildProgress(folderPath: string, groupId: string, minRating: number): {
  groupName: string;
  images: GroupRatedImageRecord[];
  progress: GroupProgress;
  nextPair: NextPair;
} {
  const group = getGroup(folderPath, groupId);
  if (!group) {
    throw new Error('Group not found');
  }

  const images = getGroupRatedImages(folderPath, groupId, minRating);
  const imageIds = images.map((image) => image.imageId);
  const totalPairs = calculatePairCount(imageIds.length);

  if (totalPairs === 0) {
    return {
      groupName: group.name,
      images,
      progress: {
        groupId: group.id,
        groupName: group.name,
        minRating,
        eligibleCount: imageIds.length,
        totalPairs,
        completedPairs: 0,
        remainingPairs: 0,
        hasRanking: false,
      },
      nextPair: null,
    };
  }

  const donePairKeys = getDonePairKeys(folderPath, imageIds);
  const completedPairs = Math.min(totalPairs, donePairKeys.size);
  const remainingPairs = Math.max(0, totalPairs - completedPairs);

  return {
    groupName: group.name,
    images,
    progress: {
      groupId: group.id,
      groupName: group.name,
      minRating,
      eligibleCount: imageIds.length,
      totalPairs,
      completedPairs,
      remainingPairs,
      hasRanking: completedPairs > 0,
    },
    nextPair: remainingPairs > 0 ? pickRandomRemainingPair(imageIds, donePairKeys) : null,
  };
}

function buildOverview(folderPath: string, minRating: number): GroupProgress[] {
  const groups = getAllGroups(folderPath);

  return groups.map((group) => {
    const images = getGroupRatedImages(folderPath, group.id, minRating);
    const imageIds = images.map((image) => image.imageId);
    const totalPairs = calculatePairCount(imageIds.length);

    if (totalPairs === 0) {
      return {
        groupId: group.id,
        groupName: group.name,
        minRating,
        eligibleCount: imageIds.length,
        totalPairs,
        completedPairs: 0,
        remainingPairs: 0,
        hasRanking: false,
      };
    }

    const completedPairs = Math.min(totalPairs, getDonePairKeys(folderPath, imageIds).size);

    return {
      groupId: group.id,
      groupName: group.name,
      minRating,
      eligibleCount: imageIds.length,
      totalPairs,
      completedPairs,
      remainingPairs: Math.max(0, totalPairs - completedPairs),
      hasRanking: completedPairs > 0,
    };
  });
}

function buildRankingRows(folderPath: string, groupId: string, minRating: number): {
  progress: GroupProgress;
  rows: RankingRow[];
} {
  const { progress, images } = buildProgress(folderPath, groupId, minRating);
  const imageIds = images.map((image) => image.imageId);

  const rowsById = new Map<string, RankingRow>();
  for (const image of images) {
    rowsById.set(image.imageId, {
      imageId: image.imageId,
      rating: image.rating,
      wins: 0,
      losses: 0,
      skips: 0,
      score: 0,
    });
  }

  if (imageIds.length > 1) {
    const comparisons = getPairwiseComparisonsForImageIds(folderPath, imageIds);

    for (const comparison of comparisons) {
      const imageARow = rowsById.get(comparison.imageAId);
      const imageBRow = rowsById.get(comparison.imageBId);

      if (!imageARow || !imageBRow) {
        continue;
      }

      if (comparison.skipped || comparison.winnerImageId === null) {
        imageARow.skips += 1;
        imageBRow.skips += 1;
        continue;
      }

      if (comparison.winnerImageId === comparison.imageAId) {
        imageARow.wins += 1;
        imageBRow.losses += 1;
        continue;
      }

      imageBRow.wins += 1;
      imageARow.losses += 1;
    }
  }

  const rows = Array.from(rowsById.values())
    .map((row) => ({
      ...row,
      score: row.wins + row.losses > 0
        ? Number(((row.wins / (row.wins + row.losses)) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      if (b.rating !== a.rating) {
        return b.rating - a.rating;
      }

      return a.imageId.localeCompare(b.imageId);
    });

  return {
    progress,
    rows,
  };
}

async function validateFolderPath(folderPath: string | null): Promise<string | NextResponse> {
  if (!folderPath) {
    return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
  }

  try {
    await access(folderPath);
  } catch {
    return NextResponse.json({ error: 'Folder path does not exist' }, { status: 400 });
  }

  return folderPath;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const validatedFolderPath = await validateFolderPath(searchParams.get('folderPath'));
    if (typeof validatedFolderPath !== 'string') {
      return validatedFolderPath;
    }

    const action = normalizeText(searchParams.get('action')) || 'overview';
    const minRating = normalizeMinRating(searchParams.get('minRating'), 1);

    if (action === 'overview') {
      const groups = buildOverview(validatedFolderPath, minRating);
      return NextResponse.json({ success: true, groups });
    }

    const groupId = normalizeText(searchParams.get('groupId'));
    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
    }

    if (action === 'prepare') {
      const { progress, nextPair } = buildProgress(validatedFolderPath, groupId, minRating);
      return NextResponse.json({ success: true, progress, nextPair });
    }

    if (action === 'results') {
      const { progress, rows } = buildRankingRows(validatedFolderPath, groupId, minRating);
      return NextResponse.json({ success: true, progress, rows });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('Pairwise GET API error:', error);
    if (error instanceof Error && error.message === 'Group not found') {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedFolderPath = await validateFolderPath(body.folderPath ?? null);
    if (typeof validatedFolderPath !== 'string') {
      return validatedFolderPath;
    }

    const action = normalizeText(body.action);
    if (action !== 'compare') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    const groupId = normalizeText(body.groupId);
    if (!groupId) {
      return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
    }

    const minRating = normalizeMinRating(body.minRating, 1);
    const leftImageId = normalizeText(body.leftImageId);
    const rightImageId = normalizeText(body.rightImageId);
    const winnerImageIdRaw = body.winnerImageId;

    if (!leftImageId || !rightImageId || leftImageId === rightImageId) {
      return NextResponse.json({ error: 'leftImageId and rightImageId must be two different image ids' }, { status: 400 });
    }

    const { images } = buildProgress(validatedFolderPath, groupId, minRating);
    const eligibleImageIds = new Set(images.map((image) => image.imageId));

    if (!eligibleImageIds.has(leftImageId) || !eligibleImageIds.has(rightImageId)) {
      return NextResponse.json(
        { error: 'Compared images are not part of the current group selection' },
        { status: 400 }
      );
    }

    const winnerImageId = winnerImageIdRaw === null || typeof winnerImageIdRaw === 'undefined'
      ? null
      : normalizeText(winnerImageIdRaw);

    if (winnerImageId !== null && winnerImageId !== leftImageId && winnerImageId !== rightImageId) {
      return NextResponse.json({ error: 'winnerImageId must be null, leftImageId or rightImageId' }, { status: 400 });
    }

    const comparison = upsertPairwiseComparison(validatedFolderPath, {
      imageAId: leftImageId,
      imageBId: rightImageId,
      winnerImageId,
      sourceGroupId: groupId,
      skipped: winnerImageId === null,
    });

    const { progress, nextPair } = buildProgress(validatedFolderPath, groupId, minRating);

    return NextResponse.json({
      success: true,
      comparison,
      progress,
      nextPair,
    });
  } catch (error) {
    console.error('Pairwise POST API error:', error);
    if (error instanceof Error && error.message === 'Group not found') {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (error instanceof Error && error.message.includes('FOREIGN KEY constraint failed')) {
      return NextResponse.json({ error: 'groupId or imageId does not exist' }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
