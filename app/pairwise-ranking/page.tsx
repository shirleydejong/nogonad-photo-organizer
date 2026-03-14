"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CONFIG from "@/config";
import { Header } from "@/components/header";
import { Icon } from "@/components/icon";

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

type NextPair = {
  leftImageId: string;
  rightImageId: string;
} | null;

type RankingRow = {
  imageId: string;
  rating: number;
  score: number;
};

function normalizeWindowsPath(path: string): string {
  return path.replace(/\//g, "\\");
}

function getFolderName(folderPath: string): string {
  const parts = folderPath.split("\\");
  return parts[parts.length - 1] || folderPath;
}

function getFileId(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) {
    return fileName;
  }

  return fileName.substring(0, lastDot);
}

function getThumbnailFilename(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) {
    return `${fileName}-thumb`;
  }

  return `${fileName.substring(0, lastDot)}-thumb${fileName.substring(lastDot)}`;
}

function clampRating(value: number): number {
  return Math.max(1, Math.min(5, Math.trunc(value)));
}

function formatRatingStars(rating: number): string {
  const normalizedRating = Math.max(0, Math.min(5, Math.trunc(rating)));
  return normalizedRating > 0 ? "⭐".repeat(normalizedRating) : "-";
}

export default function PairwiseRankingPage() {
  const router = useRouter();

  const [folderPath, setFolderPath] = useState<string>("");
  const [folderName, setFolderName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [groups, setGroups] = useState<GroupProgress[]>([]);
  const [fileNameById, setFileNameById] = useState<Map<string, string>>(new Map());

  const [startGroup, setStartGroup] = useState<GroupProgress | null>(null);
  const [startMinRating, setStartMinRating] = useState<number>(3);
  const [isPreparingStart, setIsPreparingStart] = useState<boolean>(false);
  const [startPreview, setStartPreview] = useState<{ progress: GroupProgress; nextPair: NextPair } | null>(null);

  const [selectedResultsGroupId, setSelectedResultsGroupId] = useState<string | null>(null);
  const [resultsMinRating, setResultsMinRating] = useState<number>(1);
  const [isLoadingResults, setIsLoadingResults] = useState<boolean>(false);
  const [resultsProgress, setResultsProgress] = useState<GroupProgress | null>(null);
  const [resultsRows, setResultsRows] = useState<RankingRow[]>([]);

  const thumbFolderPath = useMemo(() => {
    if (!folderPath) {
      return "";
    }

    return `${folderPath}\\${CONFIG.NPO_FOLDER}\\${CONFIG.THUMBNAILS_FOLDER}`;
  }, [folderPath]);

  const loadOverview = useCallback(async (activeFolderPath: string) => {
    const response = await fetch(`/api/pairwise?action=overview&folderPath=${encodeURIComponent(activeFolderPath)}&minRating=1`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Could not load pairwise group overview");
    }

    const data = await response.json();
    const nextGroups = Array.isArray(data?.groups) ? data.groups as GroupProgress[] : [];
    setGroups(nextGroups);
  }, []);

  const loadImageFileMap = useCallback(async (activeFolderPath: string) => {
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath: activeFolderPath, action: "start" }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Could not load images for pairwise ranking");
    }

    const data = await response.json();
    const files = Array.isArray(data?.files) ? data.files as string[] : [];
    const fileMap = new Map<string, string>();

    for (const fileName of files) {
      const fileId = getFileId(fileName);
      if (!fileMap.has(fileId)) {
        fileMap.set(fileId, fileName);
      }
    }

    setFileNameById(fileMap);
  }, []);

  const loadResults = useCallback(async (groupId: string, minRating: number) => {
    if (!folderPath) {
      return;
    }

    setIsLoadingResults(true);
    try {
      const response = await fetch(
        `/api/pairwise?action=results&folderPath=${encodeURIComponent(folderPath)}&groupId=${encodeURIComponent(groupId)}&minRating=${encodeURIComponent(String(minRating))}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Could not load pairwise results");
      }

      const data = await response.json();
      setSelectedResultsGroupId(groupId);
      setResultsProgress(data.progress as GroupProgress);
      setResultsRows(Array.isArray(data.rows) ? data.rows as RankingRow[] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error while loading pairwise results");
    } finally {
      setIsLoadingResults(false);
    }
  }, [folderPath]);

  useEffect(() => {
    const activeFolder = localStorage.getItem("activeFolder");
    if (!activeFolder) {
      router.push("/select-folder");
      return;
    }

    const normalizedPath = normalizeWindowsPath(activeFolder);
    setFolderPath(normalizedPath);
    setFolderName(getFolderName(normalizedPath));

    let cancelled = false;

    async function loadInitialData() {
      setIsLoading(true);
      setError(null);
      try {
        await Promise.all([
          loadImageFileMap(normalizedPath),
          loadOverview(normalizedPath),
        ]);

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load pairwise page");
          setIsLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [router, loadImageFileMap, loadOverview]);

  const selectedResultsGroupName = useMemo(() => {
    if (!selectedResultsGroupId) {
      return null;
    }

    return groups.find((group) => group.groupId === selectedResultsGroupId)?.groupName ?? selectedResultsGroupId;
  }, [groups, selectedResultsGroupId]);

  const resolveImageData = useCallback((imageId: string) => {
    const fileName = fileNameById.get(imageId) ?? null;

    if (!fileName || !folderPath || !thumbFolderPath) {
      return {
        fileName,
        thumbPath: null,
        originalPath: null,
      };
    }

    const thumbnailName = getThumbnailFilename(fileName);
    return {
      fileName,
      thumbPath: `/api/image/${encodeURIComponent(thumbnailName)}?folderPath=${encodeURIComponent(thumbFolderPath)}&fileName=${encodeURIComponent(thumbnailName)}`,
      originalPath: `/api/image/${encodeURIComponent(fileName)}?folderPath=${encodeURIComponent(folderPath)}&fileName=${encodeURIComponent(fileName)}`,
    };
  }, [fileNameById, folderPath, thumbFolderPath]);

  const prepareStart = useCallback(async () => {
    if (!folderPath || !startGroup) {
      return;
    }

    setIsPreparingStart(true);
    try {
      const minRating = clampRating(startMinRating);
      const response = await fetch(
        `/api/pairwise?action=prepare&folderPath=${encodeURIComponent(folderPath)}&groupId=${encodeURIComponent(startGroup.groupId)}&minRating=${encodeURIComponent(String(minRating))}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Could not prepare pairwise ranking");
      }

      const data = await response.json();
      setStartMinRating(minRating);
      setStartPreview({
        progress: data.progress as GroupProgress,
        nextPair: data.nextPair as NextPair,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare pairwise ranking");
    } finally {
      setIsPreparingStart(false);
    }
  }, [folderPath, startGroup, startMinRating]);

  const beginSession = useCallback(() => {
    if (!startGroup || !startPreview) {
      return;
    }

    const minRating = clampRating(startMinRating);
    router.push(
      `/pairwise-ranking/compare?groupId=${encodeURIComponent(startGroup.groupId)}&minRating=${encodeURIComponent(String(minRating))}`
    );

    setStartGroup(null);
    setStartPreview(null);
  }, [router, startGroup, startPreview, startMinRating]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-black font-sans">
        <Header folderName={folderName} title="Pairwise Ranking" isFullscreen={false}>
          <div className="text-zinc-400 text-sm">Loading...</div>
        </Header>
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-zinc-300">
            <div className="w-12 h-12 border-4 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
            <span>Loading pairwise data...</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-black font-sans">
      <Header folderName={folderName} title="Pairwise Ranking" isFullscreen={false}>
      </Header>

      <main className="flex-1 px-6 py-6 space-y-6">
        {error && (
          <div className="rounded border border-red-800 bg-red-950/40 text-red-200 px-4 py-3 text-sm">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <section className="rounded border border-zinc-800 overflow-hidden">
          <div className="bg-zinc-900 px-4 py-3 flex items-center justify-between">
            <h2 className="text-zinc-100 font-semibold">Groups</h2>
            <span className="text-zinc-400 text-xs">Indicator based on min rating 1+</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 px-4 text-zinc-300 text-sm">Group</th>
                  <th className="text-right py-2 px-4 text-zinc-300 text-sm">Photos</th>
                  <th className="text-right py-2 px-4 text-zinc-300 text-sm">Progress</th>
                  <th className="text-left py-2 px-4 text-zinc-300 text-sm">Status</th>
                  <th className="text-right py-2 px-4 text-zinc-300 text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-zinc-500">No groups available.</td>
                  </tr>
                )}
                {groups.map((group) => (
                  <tr key={group.groupId} className="border-b border-zinc-900 hover:bg-zinc-950/50">
                    <td className="py-3 px-4 text-zinc-200">{group.groupName}</td>
                    <td className="py-3 px-4 text-right text-zinc-400">{group.eligibleCount}</td>
                    <td className="py-3 px-4 text-right text-zinc-400">{group.completedPairs} / {group.totalPairs}</td>
                    <td className="py-3 px-4">
                      {group.hasRanking ? (
                        <span className="text-emerald-300 text-sm">Ranking available</span>
                      ) : (
                        <span className="text-zinc-500 text-sm">Not started yet</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="header-button"
                          onClick={() => {
                            setStartGroup(group);
                            setStartMinRating(3);
                            setStartPreview(null);
                          }}
                        >
                          <Icon name="play_arrow" />
                          Start
                        </button>
                        <button
                          className="header-button"
                          onClick={() => {
                            void loadResults(group.groupId, resultsMinRating);
                          }}
                        >
                          <Icon name="leaderboard" />
                          Results
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </section>

          <section className="rounded border border-zinc-800 overflow-hidden">
            <div className="bg-zinc-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-zinc-100 font-semibold">
                {selectedResultsGroupName ? `Results: ${selectedResultsGroupName}` : "Results"}
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-zinc-400 text-sm">Min rating</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={resultsMinRating}
                  onChange={(e) => setResultsMinRating(clampRating(Number.parseInt(e.target.value || "1", 10)))}
                  className="w-16 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm"
                />
                <button
                  className="header-button"
                  disabled={!selectedResultsGroupId || isLoadingResults}
                  onClick={() => {
                    if (selectedResultsGroupId) {
                      void loadResults(selectedResultsGroupId, resultsMinRating);
                    }
                  }}
                >
                  <Icon name="refresh" />
                  Refresh
                </button>
              </div>
            </div>

            {!selectedResultsGroupId ? (
              <div className="py-8 text-center text-zinc-500">Select Results on a group above.</div>
            ) : isLoadingResults ? (
              <div className="py-8 text-center text-zinc-400">Loading ranking...</div>
            ) : (
              <div>
                {resultsProgress && (
                  <div className="px-4 py-3 text-zinc-400 text-sm border-b border-zinc-800">
                    {resultsProgress.eligibleCount} photos • {resultsProgress.completedPairs}/{resultsProgress.totalPairs} comparisons finished
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 px-4 text-zinc-300 text-sm w-16">#</th>
                        <th className="text-left py-2 px-4 text-zinc-300 text-sm w-28">Thumb</th>
                        <th className="text-left py-2 px-4 text-zinc-300 text-sm">Image</th>
                        <th className="text-right py-2 px-4 text-zinc-300 text-sm">Score (%)</th>
                        <th className="text-right py-2 px-4 text-zinc-300 text-sm">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultsRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-500">No ranking rows for this selection.</td>
                        </tr>
                      )}
                      {resultsRows.map((row, index) => {
                        const imageData = resolveImageData(row.imageId);
                        return (
                          <tr key={row.imageId} className="border-b border-zinc-900 hover:bg-zinc-950/50">
                            <td className="py-2 px-4 text-zinc-300">{index + 1}</td>
                            <td className="py-2 px-4">
                              {imageData.thumbPath ? (
                                <img src={imageData.thumbPath} alt={imageData.fileName ?? row.imageId} className="w-20 h-20 rounded object-cover bg-zinc-900" />
                              ) : (
                                <div className="w-20 h-20 rounded bg-zinc-900 flex items-center justify-center text-zinc-600 text-xs">N/A</div>
                              )}
                            </td>
                            <td className="py-2 px-4 text-zinc-300 text-sm break-all">{imageData.fileName ?? row.imageId}</td>
                            <td className="py-2 px-4 text-right text-zinc-200 font-semibold">{row.score.toFixed(1)}%</td>
                            <td className="py-2 px-4 text-right text-zinc-300">
                              <span className="noto-color-emoji-regular">{formatRatingStars(row.rating)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {startGroup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl rounded border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-zinc-100 font-semibold">Start Pairwise Ranking</h2>
              <button className="header-button" onClick={() => setStartGroup(null)}>
                <Icon name="close" />
              </button>
            </div>

            <div className="text-zinc-300">Group: {startGroup.groupName}</div>

            <div className="flex items-end gap-3">
              <div>
                <label className="text-zinc-400 text-sm">Minimum rating</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={startMinRating}
                  onChange={(e) => {
                    setStartMinRating(clampRating(Number.parseInt(e.target.value || "1", 10)));
                    setStartPreview(null);
                  }}
                  className="block mt-1 w-20 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200"
                />
              </div>
              <button className="header-button" onClick={() => void prepareStart()} disabled={isPreparingStart}>
                <Icon name="calculate" />
                Calculate
              </button>
            </div>

            {startPreview && (
              <div className="rounded border border-zinc-700 bg-zinc-950 p-4 space-y-2">
                <div className="text-zinc-300">Photos in selection: {startPreview.progress.eligibleCount}</div>
                <div className="text-zinc-300">Combinations total: {startPreview.progress.totalPairs}</div>
                <div className="text-zinc-300">Already done: {startPreview.progress.completedPairs}</div>
                <div className="text-zinc-300">Remaining: {startPreview.progress.remainingPairs}</div>

                {startPreview.progress.totalPairs === 0 && (
                  <div className="text-zinc-500 text-sm">At least 2 photos are needed for pairwise ranking.</div>
                )}

                {startPreview.progress.totalPairs > 0 && (
                  <button className="header-button mt-2" onClick={beginSession}>
                    <Icon name="play_arrow" />
                    {startPreview.progress.remainingPairs > 0 ? "Open comparison page" : "Open completed comparison"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
