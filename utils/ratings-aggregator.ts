/**
 * @fileoverview Ratings aggregator utility
 * 
 * Aggregates ratings from different sources (database, JPG EXIF, RAW EXIF)
 * into organized buckets, respecting the source hierarchy.
 */

export interface RatingItem {
  fileName: string;
  rating: number;
}

export interface AggregatedRatings {
  dbRatings: RatingItem[];
  jpgRatings: RatingItem[];
  rawRatings: RatingItem[];
}

/**
 * Rating interface matching the database rating structure
 */
export interface DbRating {
  rating: number | null;
  overRuleFileRating: boolean;
}

/**
 * Aggregates ratings from multiple sources into organized buckets.
 * 
 * Rules:
 * - Database overRuleFileRating: If true, the database rating ALWAYS takes precedence over JPG and RAW ratings
 * - Database ratings: Only included if there's no JPG AND no RAW rating (and overRule is false)
 * - JPG ratings: Only included if there's no RAW rating AND no DB rating (and overRule is false)
 * - RAW ratings: Only included if there's no JPG rating AND no DB rating (and overRule is false)
 * 
 * @param dbRatingsMap - Map<fileId, DbRating | null> - database ratings (rating and overRuleFileRating boolean)
 * @param jpgRatingsMap - Map<fileId, number | null> - EXIF ratings from JPG
 * @param rawRatingsMap - Map<fileId, number | null> - EXIF ratings from RAW
 * @param hasConflicts - Optional flag to prevent use if conflicts exist. If true, function returns empty result.
 * @returns AggregatedRatings object with three arrays
 * 
 * @example
 * const aggregated = aggregateRatings(
 *   dbRatingsMap,
 *   exifDataMap,
 *   rawExifDataMap,
 *   hasConflicts
 * );
 * 
 * // Use aggregated.dbRatings, aggregated.jpgRatings, aggregated.rawRatings
 */
export function aggregateRatings(
  dbRatingsMap: Map<string, DbRating | null>,
  jpgRatingsMap: Map<string, number | null>,
  rawRatingsMap: Map<string, number | null>,
  hasConflicts: boolean = false
): AggregatedRatings {
  const result: AggregatedRatings = {
    dbRatings: [],
    jpgRatings: [],
    rawRatings: [],
  };

  // Cannot use this function if there are conflicts
  if (hasConflicts) {
    console.log('Cannot aggregate ratings: conflicts exist');
    return result;
  }

  // Collect all fileIds from all sources
  const allFileIds = new Set<string>();
  dbRatingsMap.forEach((value, fileId) => {
    if (value && value.rating !== null && value.rating !== 0) {
      allFileIds.add(fileId);
    }
  });
  jpgRatingsMap.forEach((value, fileId) => {
    if (value !== null && value !== 0) {
      allFileIds.add(fileId);
    }
  });
  rawRatingsMap.forEach((value, fileId) => {
    if (value !== null && value !== 0) {
      allFileIds.add(fileId);
    }
  });

  // Process each file
  for (const fileId of allFileIds) {
    const dbData = dbRatingsMap.get(fileId);
    const dbRating = dbData?.rating ?? null;
    const overRuleFlag = dbData?.overRuleFileRating ?? false;
    const jpgRating = jpgRatingsMap.get(fileId) ?? null;
    const rawRating = rawRatingsMap.get(fileId) ?? null;

    // OverRule flag: if true, database rating ALWAYS takes precedence
    if (overRuleFlag && dbRating !== null && dbRating !== 0) {
      result.dbRatings.push({
        fileName: fileId,
        rating: dbRating,
      });
    }
    // Database rating: only if no JPG AND no RAW rating (and rating is not 0)
    else if (dbRating !== null && dbRating !== 0 && (jpgRating === null || rawRating === null)) {
      result.dbRatings.push({
        fileName: fileId,
        rating: dbRating,
      });
    }
    // JPG rating: only if no RAW rating AND no DB rating (and rating is not 0)
    else if (jpgRating !== null && jpgRating !== 0 && rawRating === null && dbRating === null) {
      result.jpgRatings.push({
        fileName: fileId,
        rating: jpgRating,
      });
    }
    // RAW rating: only if no JPG rating AND no DB rating (and rating is not 0)
    else if (rawRating !== null && rawRating !== 0 && jpgRating === null && dbRating === null) {
      result.rawRatings.push({
        fileName: fileId,
        rating: rawRating,
      });
    }
  }

  return result;
}
