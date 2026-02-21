
/**
 * @fileoverview Ratings database management module
 * 
 * Handles SQLite database operations for photo ratings in the Nogonad Photo Organizer.
 * The module manages database connections with caching per folder and provides
 * operations to store and retrieve photo ratings.
 * 
 * Rating Scale:
 * - NULL = Not yet rated
 * - 1⭐ = Mark for deletion
 * - 2⭐ = Failed, keep anyway
 * - 3⭐ = Doubt, OK
 * - 4⭐ = Nice shot
 * - 5⭐ = Favorite
 * 
 * @example
 * const dbInfo = getDatabase(folderPath);
 * upsertRating(fileId, folderPath, 5, false);
 * const ratings = getAllRatings(folderPath);
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import config from '@/config';

/**
 * Database connection information container
 * 
 * @typedef {Object} DbInfo
 * @property {Database.Database} db - The better-sqlite3 database instance
 * @property {string} dbPath - Full file system path to the SQLite database file
 * @property {boolean} created - Indicates if the database was newly created (true) or already existed (false)
 */
export type DbInfo = {
	db: Database.Database;
	dbPath: string;
	created: boolean;
};

/**
 * In-memory cache of database connections, keyed by database file path.
 * Prevents opening multiple connections to the same database file.
 * 
 * @type {Map<string, DbInfo>}
 */
const cachedDbs = new Map<string, DbInfo>();

/**
 * Resolves the database file path for a given folder
 * 
 * Creates the NPO folder (${NPO_FOLDER}) in the specified folder path if it doesn't exist,
 * then returns the full path to the ratings database file within that folder.
 * 
 * @param {string} folderPath - The root folder path where photos are stored
 * @returns {string} The full path to the SQLite database file
 * 
 * @example
 * const dbPath = resolveDbPath('C:\\Users\\Photos');
 * // Returns: 'C:\\Users\\Photos\\_npo\\ratings.db'
 */
function resolveDbPath(folderPath: string): string {
	const fullPath = path.join(folderPath, config.NPO_FOLDER);
	if (!fs.existsSync(fullPath)) {
		fs.mkdirSync(fullPath, { recursive: true });
	}

	return path.join(fullPath, config.DB);
};

/**
 * Gets or creates a database connection for the specified folder
 * 
 * Returns a cached database connection if one already exists for the folder path.
 * If no cache exists, creates a new SQLite connection and caches it for future use.
 * Tracks whether the database file is newly created.
 * 
 * @param {string} folderPath - The root folder path for the photo collection
 * @returns {DbInfo} Database connection info containing the db instance, path, and creation status
 * 
 * @example
 * const dbInfo = getDatabase('C:\\Users\\Photos');
 * if (dbInfo.created) {
 *   console.log('New database created');
 * }
 */
function getDatabase(folderPath: string): DbInfo {
	const dbPath = resolveDbPath(folderPath);
	const cached = cachedDbs.get(dbPath);
	if (cached) {
		return cached;
	}

	const existed = fs.existsSync(dbPath);
	const db = new Database(dbPath);

	const dbInfo = {
		db,
		dbPath,
		created: !existed,
	};

	cachedDbs.set(dbPath, dbInfo);
	return dbInfo;
};

/**
 * Closes database connection(s)
 * 
 * If a folderPath is provided, closes only the connection for that specific folder
 * and removes it from the cache. If no folderPath is provided, closes all cached
 * database connections and clears the entire cache.
 * 
 * @param {string} [folderPath] - Optional folder path to close a specific database connection.
 *                                If omitted, closes all connections.
 * 
 * @example
 * // Close specific folder's database
 * closeDatabase('C:\\Users\\Photos');
 * 
 * @example
 * // Close all cached databases
 * closeDatabase();
 */
function closeDatabase(folderPath?: string) {
	if (!folderPath) {
		for (const dbInfo of cachedDbs.values()) {
			dbInfo.db.close();
		}
		cachedDbs.clear();
		return;
	}

	const dbPath = resolveDbPath(folderPath);
	const dbInfo = cachedDbs.get(dbPath);
	if (!dbInfo) {
		return;
	}

	dbInfo.db.close();
	cachedDbs.delete(dbPath);
};

/**
 * Ensures the ratings table exists in the database
 * 
 * Creates the 'ratings' table and its unique index if they don't already exist.
 * If the table already exists, just ensures the unique index is created.
 * 
 * Table schema:
 * - id (varchar, PRIMARY KEY): Unique file identifier
 * - rating (int): Rating value from 1-5 or NULL
 * - overRuleFileRating (boolean): Whether to override file's embedded rating
 * - createdAt (datetime): Timestamp when rating was created/updated
 * 
 * @param {DbInfo} [dbInfo] - Database connection info. Must be provided.
 * @throws {Error} If dbInfo is not provided
 * 
 * @example
 * const dbInfo = getDatabase('C:\\Users\\Photos');
 * ensureRatingsTable(dbInfo);
 */
function ensureRatingsTable(dbInfo?: DbInfo) {
	if( !dbInfo) {
		throw new Error('Database connection is required to ensure ratings table exists');
	}
	
	const row = dbInfo.db
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ratings'")
		.get();

	if (row) {
		dbInfo.db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS ratings_id_unique ON ratings(id)').run();
		return;
	}

	dbInfo.db.prepare(
		'CREATE TABLE ratings (id varchar(255) PRIMARY KEY, rating int, overRuleFileRating boolean,createdAt datetime)'
	).run();
	dbInfo.db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS ratings_id_unique ON ratings(id)').run();
};

/**
 * Inserts or updates a photo rating in the database
 * 
 * Uses an INSERT OR REPLACE operation to either create a new rating record
 * or update an existing one. If a record with the same fileId already exists,
 * its rating, overRuleFileRating flag, and timestamp are updated.
 * 
 * @param {string} fileId - Unique identifier for the file (typically filename or hash)
 * @param {string} folderPath - The folder path where the photo collection is stored
 * @param {number | null} rating - Rating value (1-5) or null for unrated
 * @param {boolean | null} overRuleFileRating - Whether to override file's embedded rating
 * @returns {Object} The upserted rating record with generated timestamp
 * @returns {string} returns.id - The file ID
 * @returns {number | null} returns.rating - The rating value
 * @returns {boolean | null} returns.overRuleFileRating - The override flag
 * @returns {string} returns.createdAt - ISO timestamp of the operation
 * 
 * @example
 * const result = upsertRating(
 *   'photo-001.jpg',
 *   'C:\\Users\\Photos',
 *   5,
 *   false
 * );
 * // Result: { id: 'photo-001.jpg', rating: 5, overRuleFileRating: false, createdAt: '2026-02-21T...' }
 */
export function upsertRating(fileId: string, folderPath: string, rating: number | null, overRuleFileRating: boolean | null): { id: string; rating: number | null; overRuleFileRating: boolean | null; createdAt: string } {
	const dbInfo = getDatabase(folderPath);
	ensureRatingsTable(dbInfo);

	const createdAt = new Date().toISOString();
	dbInfo.db
		.prepare(
			`INSERT INTO ratings (id, rating, overRuleFileRating, createdAt)
			 VALUES (@id, @rating, @overRuleFileRating, @createdAt)
			 ON CONFLICT(id) DO UPDATE SET rating=excluded.rating, overRuleFileRating=excluded.overRuleFileRating, createdAt=excluded.createdAt`
		)
		.run({
			id: fileId,
			rating,
			overRuleFileRating: overRuleFileRating !== null ? (overRuleFileRating ? 1 : 0) : null,
			createdAt,
		});

	return { id: fileId, rating, overRuleFileRating, createdAt };
};

/**
 * Retrieves all rating records from the database for a folder
 * 
 * Fetches the complete set of ratings stored for all photos in the given folder.
 * Creates the ratings table if it doesn't exist.
 * 
 * @param {string} folderPath - The folder path where the photo collection is stored
 * @returns {Array<Object>} Array of all rating records in the database
 * @returns {string} returns[].id - The file identifier
 * @returns {number | null} returns[].rating - The rating value (1-5) or null
 * @returns {boolean | null} returns[].overRuleFileRating - Whether to override file rating
 * @returns {string} returns[].createdAt - ISO timestamp of when the rating was created/updated
 * 
 * @example
 * const ratings = getAllRatings('C:\\Users\\Photos');
 * ratings.forEach(r => {
 *   console.log(`${r.id}: ${r.rating} stars`);
 * });
 */
export function getAllRatings(folderPath: string): Array<{ id: string; rating: number | null; overRuleFileRating: boolean | null; createdAt: string }> {
	const dbInfo = getDatabase(folderPath);
	ensureRatingsTable(dbInfo);

	const rows = dbInfo.db.prepare('SELECT id, rating, overRuleFileRating, createdAt FROM ratings').all();
	return rows as Array<{ id: string; rating: number | null; overRuleFileRating: boolean | null; createdAt: string }>;
};

