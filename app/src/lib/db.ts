// @ts-ignore — fts5-sql-bundle's sql-wasm.js has no type declarations
import initSqlJs from 'fts5-sql-bundle/dist/sql-wasm.js';
import type { Database, BindParams } from 'sql.js';
import type { BookMeta, Chapter, Paragraph, Aside, Annotation, AttributePage, ParagraphTranslation, AsideTranslation, SearchResult } from './types';

let db: Database | null = null;

const DB_URL = '/franciscus.db';
// Bump this when the shipped database changes so stale copies are evicted.
const DB_CACHE = 'franciscus-db-v1';

export interface DbProgress {
	/** bytes received so far */
	loaded: number;
	/** total bytes, or 0 when the server doesn't send Content-Length */
	total: number;
	/** true once the bytes are served from the local cache rather than the network */
	cached: boolean;
}

export async function initDb(onProgress?: (p: DbProgress) => void): Promise<Database> {
	if (db) return db;

	const SQL = await (initSqlJs as any)({
		locateFile: () => '/sql-wasm.wasm'
	});

	const buffer = await downloadDb(onProgress);
	db = new SQL.Database(new Uint8Array(buffer)) as Database;
	return db;
}

/**
 * Fetch the database, reporting download progress. The response is stored in
 * the Cache Storage API so repeat visits read from disk instead of the network
 * (this also makes the corpus available offline). Falls back to a plain fetch
 * where Cache Storage isn't available (e.g. insecure contexts).
 */
async function downloadDb(onProgress?: (p: DbProgress) => void): Promise<ArrayBuffer> {
	let cache: Cache | null = null;
	if (typeof caches !== 'undefined') {
		try {
			cache = await caches.open(DB_CACHE);
			// Drop any older cache versions left behind by a previous release.
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((k) => k.startsWith('franciscus-db-') && k !== DB_CACHE)
					.map((k) => caches.delete(k))
			);
		} catch (e) {
			console.warn('[db] Cache Storage unavailable, falling back to network', e);
			cache = null;
		}
	}

	const cached = cache ? await cache.match(DB_URL) : undefined;
	if (cached) {
		return readWithProgress(cached, true, onProgress);
	}

	const response = await fetch(DB_URL);
	if (!response.ok) throw new Error(`Failed to fetch database: ${response.status}`);
	// Cache a clone before the body stream is consumed by the progress reader.
	if (cache) {
		try {
			await cache.put(DB_URL, response.clone());
		} catch (e) {
			console.warn('[db] Failed to cache database', e);
		}
	}
	return readWithProgress(response, false, onProgress);
}

/** Read a response body, reporting progress as chunks arrive. */
async function readWithProgress(
	response: Response,
	cached: boolean,
	onProgress?: (p: DbProgress) => void
): Promise<ArrayBuffer> {
	const total = Number(response.headers.get('Content-Length')) || 0;
	if (!onProgress || !response.body) {
		const buffer = await response.arrayBuffer();
		onProgress?.({ loaded: buffer.byteLength, total: total || buffer.byteLength, cached });
		return buffer;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let loaded = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.length;
		onProgress({ loaded, total, cached });
	}

	const out = new Uint8Array(loaded);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out.buffer;
}

export function getDb(): Database {
	if (!db) throw new Error('Database not initialized');
	return db;
}

function queryAll<T>(sql: string, params: BindParams = {}): T[] {
	let stmt;
	try {
		stmt = getDb().prepare(sql);
		stmt.bind(params);
	} catch (e) {
		console.error('[db] queryAll prepare/bind failed', { sql, params, error: e });
		throw e;
	}
	const results: T[] = [];
	try {
		while (stmt.step()) {
			results.push(stmt.getAsObject() as T);
		}
	} catch (e) {
		console.error('[db] queryAll step failed', { sql, params, error: e });
		throw e;
	} finally {
		stmt.free();
	}
	return results;
}

function queryOne<T>(sql: string, params: BindParams = {}): T | null {
	const results = queryAll<T>(sql, params);
	return results[0] ?? null;
}

export function getBooks(): BookMeta[] {
	return queryAll<BookMeta>(
		'SELECT id, title, author, date, ref_edition, license FROM books ORDER BY id'
	);
}

export function getBook(bookId: string): BookMeta | null {
	return queryOne<BookMeta>(
		'SELECT id, title, author, date, ref_edition, license FROM books WHERE id = $id',
		{ $id: bookId }
	);
}

export function getChapters(bookId: string): Chapter[] {
	return queryAll<Chapter>(
		'SELECT id, book_id, position, title FROM chapters WHERE book_id = $bookId ORDER BY position',
		{ $bookId: bookId }
	);
}

export function getParagraphs(bookId: string, chapterId: string): Paragraph[] {
	return queryAll<Paragraph>(
		`SELECT id, book_id, chapter_id, position, content, label FROM paragraphs
		 WHERE book_id = $bookId AND chapter_id = $chapterId ORDER BY position`,
		{ $bookId: bookId, $chapterId: chapterId }
	);
}

export function getAsides(bookId: string, chapterId: string): Aside[] {
	return queryAll<Aside>(
		`SELECT id, book_id, chapter_id, position, content FROM asides
		 WHERE book_id = $bookId AND chapter_id = $chapterId ORDER BY position`,
		{ $bookId: bookId, $chapterId: chapterId }
	);
}

export function getAttributePages(): AttributePage[] {
	return queryAll<AttributePage>(
		'SELECT attr_type, attr_value, title, content FROM attribute_pages ORDER BY attr_type, title'
	);
}

export function getAttributePage(attrType: string, attrValue: string): AttributePage | null {
	return queryOne<AttributePage>(
		'SELECT attr_type, attr_value, title, content FROM attribute_pages WHERE attr_type = $type AND attr_value = $value',
		{ $type: attrType, $value: attrValue }
	);
}

export interface AttributeOccurrence {
	book_id: string;
	book_title: string;
	chapter_id: string;
	chapter_title: string;
	paragraph_id: string;
	paragraph_label: string | null;
	content: string;
	evidence: string | null;
}

export function getAttributeOccurrences(attrType: string, attrValue: string): AttributeOccurrence[] {
	return queryAll<AttributeOccurrence>(
		`SELECT a.book_id, b.title AS book_title, p.chapter_id, c.title AS chapter_title,
		        a.paragraph_id, p.label AS paragraph_label, p.content, a.evidence
		 FROM annotations a
		 JOIN paragraphs p ON a.book_id = p.book_id AND a.paragraph_id = p.id
		 JOIN books b ON a.book_id = b.id
		 JOIN chapters c ON p.book_id = c.book_id AND p.chapter_id = c.id
		 WHERE a.attr_type = $type AND a.attr_value = $value
		 ORDER BY a.book_id, c.position, p.position`,
		{ $type: attrType, $value: attrValue }
	);
}

export interface AttributeSummary {
	attr_type: string;
	attr_value: string;
	count: number;
	has_page: number;
}

export function getDistinctAttributes(): AttributeSummary[] {
	return queryAll<AttributeSummary>(
		`SELECT a.attr_type, a.attr_value, COUNT(*) AS count,
		        EXISTS(SELECT 1 FROM attribute_pages ap WHERE ap.attr_type = a.attr_type AND ap.attr_value = a.attr_value) AS has_page
		 FROM annotations a
		 GROUP BY a.attr_type, a.attr_value
		 ORDER BY a.attr_type, a.attr_value`
	);
}

export interface AvailableLanguage {
	lang: string;
}

export function getAvailableCorpusLanguages(): string[] {
	const rows = queryAll<AvailableLanguage>(
		'SELECT DISTINCT lang FROM paragraph_translations ORDER BY lang'
	);
	return rows.map((r) => r.lang);
}

export function getParagraphTranslations(
	bookId: string,
	chapterId: string,
	lang: string
): Map<string, string> {
	const rows = queryAll<ParagraphTranslation>(
		`SELECT pt.book_id, pt.paragraph_id, pt.lang, pt.content
		 FROM paragraph_translations pt
		 JOIN paragraphs p ON pt.book_id = p.book_id AND pt.paragraph_id = p.id
		 WHERE pt.book_id = $bookId AND p.chapter_id = $chapterId AND pt.lang = $lang`,
		{ $bookId: bookId, $chapterId: chapterId, $lang: lang }
	);
	const map = new Map<string, string>();
	for (const r of rows) map.set(r.paragraph_id, r.content);
	return map;
}

export function getAsideTranslations(
	bookId: string,
	chapterId: string,
	lang: string
): Map<string, string> {
	const rows = queryAll<AsideTranslation>(
		`SELECT at.book_id, at.aside_id, at.lang, at.content
		 FROM aside_translations at
		 JOIN asides a ON at.book_id = a.book_id AND at.aside_id = a.id
		 WHERE at.book_id = $bookId AND a.chapter_id = $chapterId AND at.lang = $lang`,
		{ $bookId: bookId, $chapterId: chapterId, $lang: lang }
	);
	const map = new Map<string, string>();
	for (const r of rows) map.set(r.aside_id, r.content);
	return map;
}

export function getChapterAnnotations(bookId: string, chapterId: string): Annotation[] {
	return queryAll<Annotation>(
		`SELECT a.id, a.book_id, a.paragraph_id, a.attr_type, a.attr_value, a.by_whom, a.verified, a.evidence
		 FROM annotations a
		 JOIN paragraphs p ON a.book_id = p.book_id AND a.paragraph_id = p.id
		 WHERE a.book_id = $bookId AND p.chapter_id = $chapterId`,
		{ $bookId: bookId, $chapterId: chapterId }
	);
}

export function searchParagraphs(query: string, lang: string): SearchResult[] {
	const sanitized = query
		.split(/\s+/)
		.filter(Boolean)
		.map(term => term.replace(/['"()*^{}[\]:+\-\\]/g, ''))
		.filter(Boolean)
		.map(term => term + '*')
		.join(' ');
	if (!sanitized) return [];
	console.log('[db] FTS5 query', { raw: query, sanitized, lang });

	return queryAll<SearchResult>(
		`SELECT s.book_id, b.title AS book_title, s.chapter_id, c.title AS chapter_title,
		        s.paragraph_id, p.label AS paragraph_label, s.lang,
		        snippet(search_index, 4, '<mark>', '</mark>', '…', 40) AS snippet,
		        rank
		 FROM search_index s
		 JOIN books b ON s.book_id = b.id
		 JOIN chapters c ON s.book_id = c.book_id AND s.chapter_id = c.id
		 JOIN paragraphs p ON s.book_id = p.book_id AND s.paragraph_id = p.id
		 WHERE search_index MATCH $query AND s.lang = $lang
		 ORDER BY rank
		 LIMIT 50`,
		{ $query: sanitized, $lang: lang }
	);
}
