
/*
Hier moet magie komen die de ratings in de database zet en bijwerkt. Dit wordt via een api aangestuurd.

NULL = niet uitgezocht
1⭐ = mark for deletion
2⭐ = mislukt, wel bewaren
3⭐ = twijfel ok
4⭐ = nice shot
5⭐ = favorite
*/

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import config from '@/config';

export type DbInfo = {
	db: Database.Database;
	dbPath: string;
	created: boolean;
};

const cachedDbs = new Map<string, DbInfo>();

function resolveDbPath(folderPath: string): string {
	const fullPath = path.join(folderPath, config.NPO_FOLDER);
	if (!fs.existsSync(fullPath)) {
		fs.mkdirSync(fullPath, { recursive: true });
	}

	return path.join(fullPath, config.DB);
};

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

export function getAllRatings(folderPath: string): Array<{ id: string; rating: number | null; overRuleFileRating: boolean | null; createdAt: string }> {
	const dbInfo = getDatabase(folderPath);
	ensureRatingsTable(dbInfo);

	const rows = dbInfo.db.prepare('SELECT id, rating, overRuleFileRating, createdAt FROM ratings').all();
	return rows as Array<{ id: string; rating: number | null; overRuleFileRating: boolean | null; createdAt: string }>;
};

