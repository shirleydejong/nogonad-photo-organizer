
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

export type GroupRecord = {
	id: string;
	name: string;
};

export type ImageGroupRecord = {
	imageId: string;
	groupId: string;
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
	db.pragma('foreign_keys = ON');

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
		ensureImageGroupsTable(dbInfo);
		return;
	}

	dbInfo.db.prepare(
		'CREATE TABLE ratings (id varchar(255) PRIMARY KEY, rating int, overRuleFileRating boolean,createdAt datetime)'
	).run();
	dbInfo.db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS ratings_id_unique ON ratings(id)').run();
	ensureImageGroupsTable(dbInfo);
};

/**
 * Ensures the groups table exists in the database
 *
 * Table schema:
 * - id (varchar, PRIMARY KEY): Unique group identifier
 * - name (varchar): Display name of the group
 *
 * @param {DbInfo} [dbInfo] - Database connection info. Must be provided.
 * @throws {Error} If dbInfo is not provided
 */
function ensureGroupsTable(dbInfo?: DbInfo) {
	if (!dbInfo) {
		throw new Error('Database connection is required to ensure groups table exists');
	}

	const row = dbInfo.db
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'")
		.get();

	if (row) {
		dbInfo.db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS groups_id_unique ON groups(id)').run();
		ensureImageGroupsTable(dbInfo);
		return;
	}

	dbInfo.db.prepare('CREATE TABLE groups (id varchar(255) PRIMARY KEY, name varchar(255) NOT NULL)').run();
	dbInfo.db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS groups_id_unique ON groups(id)').run();
	ensureImageGroupsTable(dbInfo);
};

/**
 * Ensures the image-group relation table exists in the database
 *
 * Table schema:
 * - imageId (varchar): References ratings.id
 * - groupId (varchar): References groups.id
 *
 * Composite primary key ensures one group assignment per image/group pair.
 * Foreign keys cascade deletions to avoid orphaned relations.
 *
 * @param {DbInfo} [dbInfo] - Database connection info. Must be provided.
 * @throws {Error} If dbInfo is not provided
 */
function ensureImageGroupsTable(dbInfo?: DbInfo) {
	if (!dbInfo) {
		throw new Error('Database connection is required to ensure image_groups table exists');
	}

	dbInfo.db.prepare(
		`CREATE TABLE IF NOT EXISTS image_groups (
			imageId varchar(255) NOT NULL,
			groupId varchar(255) NOT NULL,
			PRIMARY KEY (imageId, groupId),
			FOREIGN KEY (imageId) REFERENCES ratings(id) ON DELETE CASCADE ON UPDATE CASCADE,
			FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE ON UPDATE CASCADE
		)`
	).run();
	dbInfo.db.prepare('CREATE INDEX IF NOT EXISTS image_groups_imageId_idx ON image_groups(imageId)').run();
	dbInfo.db.prepare('CREATE INDEX IF NOT EXISTS image_groups_groupId_idx ON image_groups(groupId)').run();
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

/**
 * Retrieves all groups from the database for a folder
 *
 * @param {string} folderPath - The folder path where the database is stored
 * @returns {GroupRecord[]} Array of groups
 */
export function getAllGroups(folderPath: string): GroupRecord[] {
	const dbInfo = getDatabase(folderPath);
	ensureGroupsTable(dbInfo);

	const rows = dbInfo.db.prepare('SELECT id, name FROM groups ORDER BY name COLLATE NOCASE ASC').all();
	return rows as GroupRecord[];
};

/**
 * Retrieves one group by id from the database
 *
 * @param {string} folderPath - The folder path where the database is stored
 * @param {string} id - Group identifier
 * @returns {GroupRecord | null} The group record or null when not found
 */
export function getGroup(folderPath: string, id: string): GroupRecord | null {
	const dbInfo = getDatabase(folderPath);
	ensureGroupsTable(dbInfo);

	const row = dbInfo.db.prepare('SELECT id, name FROM groups WHERE id = ?').get(id) as GroupRecord | undefined;
	return row ?? null;
};

/**
 * Creates a new group record
 *
 * @param {string} folderPath - The folder path where the database is stored
 * @param {string} id - Group identifier
 * @param {string} name - Group name
 * @returns {GroupRecord} Newly created group
 */
export function createGroup(folderPath: string, id: string, name: string): GroupRecord {
	const dbInfo = getDatabase(folderPath);
	ensureGroupsTable(dbInfo);

	dbInfo.db.prepare('INSERT INTO groups (id, name) VALUES (@id, @name)').run({ id, name });
	return { id, name };
};

/**
 * Updates an existing group name
 *
 * @param {string} folderPath - The folder path where the database is stored
 * @param {string} id - Group identifier
 * @param {string} name - New group name
 * @returns {GroupRecord | null} Updated group or null when no group matches id
 */
export function updateGroup(folderPath: string, id: string, name: string): GroupRecord | null {
	const dbInfo = getDatabase(folderPath);
	ensureGroupsTable(dbInfo);

	const result = dbInfo.db.prepare('UPDATE groups SET name = @name WHERE id = @id').run({ id, name });
	if (result.changes === 0) {
		return null;
	}

	return { id, name };
};

/**
 * Deletes a group by id
 *
 * @param {string} folderPath - The folder path where the database is stored
 * @param {string} id - Group identifier
 * @returns {boolean} True when a row was deleted
 */
export function deleteGroup(folderPath: string, id: string): boolean {
	const dbInfo = getDatabase(folderPath);
	ensureGroupsTable(dbInfo);

	const result = dbInfo.db.prepare('DELETE FROM groups WHERE id = ?').run(id);
	return result.changes > 0;
};

/**
 * Retrieves image-group relation records with optional filters
 *
 * @param {string} folderPath - The folder path where the database is stored
 * @param {Object} [filters] - Optional query filters
 * @param {string} [filters.imageId] - Filter by image id
 * @param {string} [filters.groupId] - Filter by group id
 * @returns {ImageGroupRecord[]} Array of matching relation records
 */
export function getImageGroupRelations(
	folderPath: string,
	filters?: { imageId?: string; groupId?: string }
): ImageGroupRecord[] {
	const dbInfo = getDatabase(folderPath);
	ensureRatingsTable(dbInfo);
	ensureGroupsTable(dbInfo);
	ensureImageGroupsTable(dbInfo);

	if (filters?.imageId && filters?.groupId) {
		const rows = dbInfo.db
			.prepare('SELECT imageId, groupId FROM image_groups WHERE imageId = ? AND groupId = ?')
			.all(filters.imageId, filters.groupId);
		return rows as ImageGroupRecord[];
	}

	if (filters?.imageId) {
		const rows = dbInfo.db
			.prepare('SELECT imageId, groupId FROM image_groups WHERE imageId = ? ORDER BY groupId COLLATE NOCASE ASC')
			.all(filters.imageId);
		return rows as ImageGroupRecord[];
	}

	if (filters?.groupId) {
		const rows = dbInfo.db
			.prepare('SELECT imageId, groupId FROM image_groups WHERE groupId = ? ORDER BY imageId COLLATE NOCASE ASC')
			.all(filters.groupId);
		return rows as ImageGroupRecord[];
	}

	const rows = dbInfo.db
		.prepare('SELECT imageId, groupId FROM image_groups ORDER BY groupId COLLATE NOCASE ASC, imageId COLLATE NOCASE ASC')
		.all();
	return rows as ImageGroupRecord[];
};

/**
 * Creates a relation between image and group
 *
 * @param {string} folderPath - The folder path where the database is stored
 * @param {string} imageId - Image id from ratings table
 * @param {string} groupId - Group id from groups table
 * @returns {ImageGroupRecord} Created relation
 */
export function createImageGroupRelation(folderPath: string, imageId: string, groupId: string): ImageGroupRecord {
	const dbInfo = getDatabase(folderPath);
	ensureRatingsTable(dbInfo);
	ensureGroupsTable(dbInfo);
	ensureImageGroupsTable(dbInfo);

	dbInfo.db.prepare('INSERT INTO image_groups (imageId, groupId) VALUES (@imageId, @groupId)').run({ imageId, groupId });
	return { imageId, groupId };
};

/**
 * Deletes an image-group relation
 *
 * @param {string} folderPath - The folder path where the database is stored
 * @param {string} imageId - Image id from ratings table
 * @param {string} groupId - Group id from groups table
 * @returns {boolean} True when the relation was deleted
 */
export function deleteImageGroupRelation(folderPath: string, imageId: string, groupId: string): boolean {
	const dbInfo = getDatabase(folderPath);
	ensureRatingsTable(dbInfo);
	ensureGroupsTable(dbInfo);
	ensureImageGroupsTable(dbInfo);

	const result = dbInfo.db.prepare('DELETE FROM image_groups WHERE imageId = ? AND groupId = ?').run(imageId, groupId);
	return result.changes > 0;
};

/**
 * Retrieves a single rating record from the database
 * 
 * Fetches the rating for a specific file by its ID.
 * Returns null if no rating exists for the given file.
 * 
 * @param {string} fileId - The file identifier (filename without extension)
 * @param {string} folderPath - The folder path where the photo collection is stored
 * @returns {number | null} The rating value (1-5) or null if not found
 * 
 * @example
 * const rating = getRating('photo-001', 'C:\\Users\\Photos');
 * console.log(rating); // 5 or null
 */
export function getRating(fileId: string, folderPath: string): number | null {
	const dbInfo = getDatabase(folderPath);
	ensureRatingsTable(dbInfo);

	const row = dbInfo.db.prepare('SELECT rating FROM ratings WHERE id = ?').get(fileId) as { rating: number | null } | undefined;
	return row?.rating ?? null;
};

/**
 * Resets the overrule flag for all rating records
 * 
 * Sets the overRuleFileRating value to false (0) for all records in the ratings table.
 * This effectively removes any manual overrides on embedded file ratings for the entire collection.
 * Creates the ratings table if it doesn't exist.
 * 
 * @param {string} folderPath - The folder path where the photo collection is stored
 * 
 * @example
 * resetOverRuleFlag('C:\\Users\\Photos');
 * // All overRuleFileRating flags are now set to false
 */
export function resetOverRuleFlag(folderPath: string): void {
	const dbInfo = getDatabase(folderPath);
	ensureRatingsTable(dbInfo);

	dbInfo.db.prepare('UPDATE ratings SET overRuleFileRating = 0').run();
};

