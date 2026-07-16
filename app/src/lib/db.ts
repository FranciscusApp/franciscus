// @ts-ignore — fts5-sql-bundle's sql-wasm.js has no type declarations
import initSqlJs from 'fts5-sql-bundle/dist/sql-wasm.js';
import type { Database, BindParams } from 'sql.js';
import type { BookMeta, Chapter, Paragraph, Aside, Annotation, TopicPage, ParagraphTranslation, AsideTranslation, SearchResult } from './types';

let db: Database | null = null;

const DB_URL = '/franciscus.db';
// No version suffix: staleness is decided by the db file's own ETag/Last-Modified
// (see downloadDb), so a rebuilt db refreshes without bumping anything here.
const DB_CACHE = 'franciscus-db';

// Table-shape version this build of the app expects. Mirrors `SCHEMA_VERSION`
// in `server/src/db.rs` (stamped into the db's `PRAGMA user_version`); keep the
// two in sync by hand, per the repo's no-codegen convention. Because the db is
// revalidated eagerly over HTTP while the app code only refreshes through the
// service-worker lifecycle, a rebuilt db can reach an out-of-date client — this
// guard catches that mismatch instead of running old code against a new schema.
const EXPECTED_SCHEMA_VERSION = 5;

/** Thrown when the loaded db's schema doesn't match this build of the app.
 *  The layout treats it as "app out of date" and drives a service-worker
 *  update + reload rather than surfacing a hard error. */
export class SchemaMismatchError extends Error {
	constructor(
		readonly found: number,
		readonly expected: number
	) {
		super(`Database schema v${found} does not match app schema v${expected}`);
		this.name = 'SchemaMismatchError';
	}
}

/** Delete the cached corpus db so the next load refetches a fresh copy. Used by
 *  the schema-mismatch recovery path (see `recoverFromSchemaMismatch`). */
export async function evictDbCache(): Promise<void> {
	if (typeof caches === 'undefined') return;
	try {
		await caches.delete(DB_CACHE);
	} catch (e) {
		console.warn('[db] Failed to evict db cache', e);
	}
}

export interface DbProgress {
	/** bytes received so far */
	loaded: number;
	/** total bytes (manifest db size, else Content-Length), or 0 when neither is known */
	total: number;
	/** true once the bytes are served from the local cache rather than the network */
	cached: boolean;
}

/**
 * @param onProgress reports download progress as bytes arrive.
 * @param totalBytes uncompressed db size (from the manifest), used as the
 *   progress total. Preferred over `Content-Length`, which is unreliable under
 *   compression; omit it to fall back to the header, then to indeterminate.
 */
export async function initDb(
	onProgress?: (p: DbProgress) => void,
	totalBytes?: number
): Promise<Database> {
	if (db) return db;

	const SQL = await (initSqlJs as any)({
		locateFile: () => '/sql-wasm.wasm'
	});

	const buffer = await downloadDb(onProgress, totalBytes);
	const loaded = new SQL.Database(new Uint8Array(buffer)) as Database;

	// Reject a db built for a different app version before it can be queried
	// with mismatched SQL. `PRAGMA user_version` is stamped by the CLI build
	// (server/src/db.rs); a fresh db defaults to 0.
	const found = readSchemaVersion(loaded);
	if (found !== EXPECTED_SCHEMA_VERSION) {
		loaded.close();
		throw new SchemaMismatchError(found, EXPECTED_SCHEMA_VERSION);
	}

	db = loaded;
	return db;
}

/** Read `PRAGMA user_version` from a loaded db (0 when unset). */
function readSchemaVersion(database: Database): number {
	const res = database.exec('PRAGMA user_version');
	const value = res[0]?.values?.[0]?.[0];
	return typeof value === 'number' ? value : 0;
}

/**
 * Fetch the database, reporting download progress. The response is stored in
 * the Cache Storage API so repeat visits read from disk instead of the network
 * (this also makes the corpus available offline). Falls back to a plain fetch
 * where Cache Storage isn't available (e.g. insecure contexts).
 */
async function downloadDb(
	onProgress?: (p: DbProgress) => void,
	totalBytes?: number
): Promise<ArrayBuffer> {
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
		// Stale-while-revalidate: a cached corpus is fully usable, so serve it
		// immediately and never gate the UI on the network — neither on the
		// revalidation round-trip nor on downloading an updated db. The
		// revalidation runs in the background; a fresher db lands in the cache
		// and is picked up on the next load. (Covers Vite dev too: after a
		// rebuild the new db arrives one reload later.)
		if (cache) void revalidateInBackground(cache, cached);
		return readWithProgress(cached, true, onProgress, totalBytes);
	}

	const response = await fetch(DB_URL);
	if (!response.ok) throw new Error(`Failed to fetch database: ${response.status}`);
	return streamAndCache(response, cache, onProgress, totalBytes);
}

/** Stream a fresh network response — reporting download progress as bytes
 *  arrive — then persist the buffered bytes to the cache. Caching a `clone()`
 *  up front instead (and awaiting it) would let `cache.put` consume the entire
 *  transfer silently before `readWithProgress` ever runs, so `onProgress` never
 *  fires during the download and the bar stays stuck at indeterminate. */
async function streamAndCache(
	response: Response,
	cache: Cache | null,
	onProgress?: (p: DbProgress) => void,
	totalBytes?: number
): Promise<ArrayBuffer> {
	// Capture headers before the body is consumed; the cached copy needs the
	// validators (etag / last-modified) so later loads can revalidate.
	const headers = response.headers;
	const buffer = await readWithProgress(response, false, onProgress, totalBytes);
	if (cache) {
		try {
			await cache.put(DB_URL, new Response(buffer, { headers }));
		} catch (e) {
			console.warn('[db] Failed to cache database', e);
		}
	}
	return buffer;
}

/**
 * Refresh the cached db behind the served (possibly stale) copy. Sends both
 * HTTP validators when present — some hosts vary the ETag with the content
 * encoding, so `If-None-Match` alone can miss and trigger a full 200 for an
 * unchanged body; `If-Modified-Since` still catches that case. Any 200 body is
 * stored (bytes and validators), so a drifted validator self-heals and later
 * revalidations 304 again. No validators at all ⇒ nothing to revalidate
 * against — trust the cache.
 */
async function revalidateInBackground(cache: Cache, cached: Response): Promise<void> {
	const etag = cached.headers.get('etag');
	const lastMod = cached.headers.get('last-modified');
	if (!etag && !lastMod) return;
	try {
		const headers: Record<string, string> = {};
		if (etag) headers['If-None-Match'] = etag;
		if (lastMod) headers['If-Modified-Since'] = lastMod;
		const res = await fetch(DB_URL, { headers });
		if (res.status === 304 || !res.ok) return;
		await cache.put(DB_URL, res);
	} catch (e) {
		// Offline or storage failure: the cached copy simply stays in place.
		console.warn('[db] Background revalidation failed', e);
	}
}

/** Read a response body, reporting progress as chunks arrive. `knownTotal` (the
 *  manifest's uncompressed db size) is preferred over `Content-Length`, which is
 *  the compressed size — or absent — when the transfer is gzip/chunked, whereas
 *  the byte stream is always decompressed. */
async function readWithProgress(
	response: Response,
	cached: boolean,
	onProgress?: (p: DbProgress) => void,
	knownTotal?: number
): Promise<ArrayBuffer> {
	const total = knownTotal || Number(response.headers.get('Content-Length')) || 0;
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

// Three axes, joined separately:
//  - title and author follow the corpus language (they belong to the source
//    work's rendition; the source `books` row is the fallback),
//  - description follows the UI language (an editorial blurb about the work,
//    from book_descriptions; English is the default fallback),
//  - provenance follows the corpus rendition being read (book_translations),
//    and the page turns it into an editorial note in the UI language.
const BOOK_COLS = `COALESCE(bc.title, b.title) AS title,
		        COALESCE(bc.author, b.author) AS author, b.date, b.ref_edition,
		        COALESCE(du.description_short, den.description_short) AS description_short,
		        COALESCE(du.description, den.description) AS description,
		        bc.provenance AS provenance,
		        bc.status AS status,
		        bc.translation_source AS translation_source,
		        b.source AS source,
			        b.category AS category,
			        b.sequence AS sequence`;

const BOOK_JOINS = `LEFT JOIN book_translations bc ON bc.book_id = b.id AND bc.lang = $corpusLang
		 LEFT JOIN book_descriptions du ON du.book_id = b.id AND du.lang = $uiLang
		 LEFT JOIN book_descriptions den ON den.book_id = b.id AND den.lang = 'en'`;

export function getBooks(corpusLang: string = 'la', uiLang: string = 'en'): BookMeta[] {
	// Grouped by category (category position), then the book's in-category
	// sequence; uncategorized / unsequenced books sort last. Matches the Rust
	// manifest ordering so the pre-DB and post-DB book lists agree.
	return queryAll<BookMeta>(
		`SELECT b.id, ${BOOK_COLS}
		 FROM books b
		 ${BOOK_JOINS}
		 LEFT JOIN categories cat ON cat.id = b.category
		 ORDER BY COALESCE(cat.position, 2147483647),
		          COALESCE(b.sequence, 2147483647), b.id`,
		{ $corpusLang: corpusLang, $uiLang: uiLang }
	);
}

export function getBook(
	bookId: string,
	corpusLang: string = 'la',
	uiLang: string = 'en'
): BookMeta | null {
	return queryOne<BookMeta>(
		`SELECT b.id, ${BOOK_COLS}
		 FROM books b
		 ${BOOK_JOINS}
		 WHERE b.id = $id`,
		{ $id: bookId, $corpusLang: corpusLang, $uiLang: uiLang }
	);
}

export function getChapters(bookId: string, lang: string = 'la'): Chapter[] {
	return queryAll<Chapter>(
		`SELECT c.id, c.book_id, c.position,
		        COALESCE(ct.title, c.title) AS title
		 FROM chapters c
		 LEFT JOIN chapter_translations ct
		        ON ct.book_id = c.book_id AND ct.chapter_id = c.id AND ct.lang = $lang
		 WHERE c.book_id = $bookId
		 ORDER BY c.position`,
		{ $bookId: bookId, $lang: lang }
	);
}

export function getParagraphs(bookId: string, chapterId: string): Paragraph[] {
	return queryAll<Paragraph>(
		`SELECT id, book_id, chapter_id, position, content, label, label_format, layout FROM paragraphs
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

export function getTopicPages(lang: string = 'la'): TopicPage[] {
	return queryAll<TopicPage>(
		`SELECT tp.topic_type, tp.topic_value,
		        COALESCE(tt.description, tp.description) AS description,
		        COALESCE(tt.content,     tp.content)     AS content
		 FROM topic_pages tp
		 LEFT JOIN topic_page_translations tt
		        ON tt.topic_type = tp.topic_type AND tt.topic_value = tp.topic_value AND tt.lang = $lang
		 ORDER BY tp.topic_type, description`,
		{ $lang: lang }
	);
}

export function getTopicPage(
	topicType: string,
	topicValue: string,
	lang: string = 'la'
): TopicPage | null {
	return queryOne<TopicPage>(
		`SELECT tp.topic_type, tp.topic_value,
		        COALESCE(tt.description, tp.description) AS description,
		        COALESCE(tt.content,     tp.content)     AS content
		 FROM topic_pages tp
		 LEFT JOIN topic_page_translations tt
		        ON tt.topic_type = tp.topic_type AND tt.topic_value = tp.topic_value AND tt.lang = $lang
		 WHERE tp.topic_type = $type AND tp.topic_value = $value`,
		{ $type: topicType, $value: topicValue, $lang: lang }
	);
}

export interface TopicOccurrence {
	book_id: string;
	book_title: string;
	chapter_id: string;
	chapter_title: string;
	paragraph_id: string;
	paragraph_label: string | null;
	position: number;
	content: string;
	/** Raw Latin source body, for the parallel reader's original column. */
	content_la: string;
	comment: string | null;
}

export function getTopicOccurrences(
	topicType: string,
	topicValue: string,
	lang: string = 'la'
): TopicOccurrence[] {
	return queryAll<TopicOccurrence>(
		`SELECT a.book_id,
		        COALESCE(bt.title, b.title)   AS book_title,
		        p.chapter_id,
		        COALESCE(ct.title, c.title)   AS chapter_title,
		        a.paragraph_id,
		        p.label                        AS paragraph_label,
		        p.position                     AS position,
		        COALESCE(pt.content, p.content) AS content,
		        p.content                       AS content_la,
		        a.comment
		 FROM annotations a
		 JOIN paragraphs p ON a.book_id = p.book_id AND a.paragraph_id = p.id
		 JOIN books b      ON a.book_id = b.id
		 JOIN chapters c   ON p.book_id = c.book_id AND p.chapter_id = c.id
		 LEFT JOIN book_translations bt
		        ON bt.book_id = b.id AND bt.lang = $lang
		 LEFT JOIN chapter_translations ct
		        ON ct.book_id = c.book_id AND ct.chapter_id = c.id AND ct.lang = $lang
		 LEFT JOIN paragraph_translations pt
		        ON pt.book_id = p.book_id AND pt.paragraph_id = p.id AND pt.lang = $lang
		 WHERE a.topic_type = $type AND a.topic_value = $value
		 ORDER BY a.book_id, c.position, p.position`,
		{ $type: topicType, $value: topicValue, $lang: lang }
	);
}

/**
 * Bulk-fetch the topic label (description) for every topic page, keyed by
 * `${topic_type}:${topic_value}`. Prefers the UI-language translation,
 * falling back to the base description. Used by surfaces that render topic
 * pills (chapter reader).
 */
export function getTopicDescriptions(uiLang: string): Map<string, string> {
	const rows = queryAll<{ topic_type: string; topic_value: string; description: string }>(
		`SELECT tp.topic_type, tp.topic_value,
		        COALESCE(tt.description, tp.description) AS description
		 FROM topic_pages tp
		 LEFT JOIN topic_page_translations tt
		        ON tt.topic_type = tp.topic_type AND tt.topic_value = tp.topic_value AND tt.lang = $uiLang`,
		{ $uiLang: uiLang }
	);
	const map = new Map<string, string>();
	for (const r of rows) map.set(`${r.topic_type}:${r.topic_value}`, r.description);
	return map;
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

/**
 * Localized heading labels (`label_format="heading"` paragraphs), keyed by
 * paragraph id. Only rows whose translation carries a non-empty label are
 * returned; callers fall back to the source `label` otherwise.
 */
export function getParagraphTranslationLabels(
	bookId: string,
	chapterId: string,
	lang: string
): Map<string, string> {
	const rows = queryAll<{ paragraph_id: string; label: string | null }>(
		`SELECT pt.paragraph_id, pt.label
		 FROM paragraph_translations pt
		 JOIN paragraphs p ON pt.book_id = p.book_id AND pt.paragraph_id = p.id
		 WHERE pt.book_id = $bookId AND p.chapter_id = $chapterId AND pt.lang = $lang
		   AND pt.label IS NOT NULL AND pt.label <> ''`,
		{ $bookId: bookId, $chapterId: chapterId, $lang: lang }
	);
	const map = new Map<string, string>();
	for (const r of rows) if (r.label) map.set(r.paragraph_id, r.label);
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

/** A relation viewed from one end: the passage in the currently-read chapter
 *  (`anchor_paragraph_id`) and the passage on the other end, resolved for
 *  linking. `other_*` join fields are null when the target passage isn't in
 *  the DB (relations carry no FK on the target). */
export interface RelationLink {
	anchor_paragraph_id: string;
	/** 'out': this chapter's paragraph is the relation's source (editable side —
	 *  the entry lives in this book's sidecar); 'in': it is the target. */
	direction: 'out' | 'in';
	relation_type: string;
	other_book_id: string;
	other_paragraph_id: string;
	other_book_title: string | null;
	other_chapter_id: string | null;
	other_paragraph_label: string | null;
	provenance: string;
	comment: string | null;
}

/** Both directions of every relation touching a chapter's paragraphs: rows
 *  sourced here (outgoing) and rows pointing here (incoming). Book titles
 *  follow the corpus language. */
export function getChapterRelations(
	bookId: string,
	chapterId: string,
	lang: string = 'la'
): RelationLink[] {
	return queryAll<RelationLink>(
		`SELECT r.source_paragraph_id           AS anchor_paragraph_id,
		        'out'                           AS direction,
		        r.relation_type,
		        r.target_book_id                AS other_book_id,
		        r.target_paragraph_id           AS other_paragraph_id,
		        COALESCE(bt.title, b.title)     AS other_book_title,
		        op.chapter_id                   AS other_chapter_id,
		        op.label                        AS other_paragraph_label,
		        r.provenance, r.comment
		 FROM relations r
		 JOIN paragraphs ap ON r.source_book_id = ap.book_id AND r.source_paragraph_id = ap.id
		 LEFT JOIN paragraphs op ON r.target_book_id = op.book_id AND r.target_paragraph_id = op.id
		 LEFT JOIN books b ON b.id = r.target_book_id
		 LEFT JOIN book_translations bt ON bt.book_id = b.id AND bt.lang = $lang
		 WHERE r.source_book_id = $bookId AND ap.chapter_id = $chapterId
		 UNION ALL
		 SELECT r.target_paragraph_id, 'in', r.relation_type,
		        r.source_book_id, r.source_paragraph_id,
		        COALESCE(bt.title, b.title),
		        op.chapter_id, op.label,
		        r.provenance, r.comment
		 FROM relations r
		 JOIN paragraphs ap ON r.target_book_id = ap.book_id AND r.target_paragraph_id = ap.id
		 JOIN paragraphs op ON r.source_book_id = op.book_id AND r.source_paragraph_id = op.id
		 LEFT JOIN books b ON b.id = r.source_book_id
		 LEFT JOIN book_translations bt ON bt.book_id = b.id AND bt.lang = $lang
		 WHERE r.target_book_id = $bookId AND ap.chapter_id = $chapterId`,
		{ $bookId: bookId, $chapterId: chapterId, $lang: lang }
	);
}

export function getChapterAnnotations(bookId: string, chapterId: string): Annotation[] {
	return queryAll<Annotation>(
		`SELECT a.id, a.book_id, a.paragraph_id, a.paragraph_to_id, a.topic_type, a.topic_value, a.by_whom, a.provenance, a.comment
		 FROM annotations a
		 JOIN paragraphs p ON a.book_id = p.book_id AND a.paragraph_id = p.id
		 WHERE a.book_id = $bookId AND p.chapter_id = $chapterId`,
		{ $bookId: bookId, $chapterId: chapterId }
	);
}

export interface SearchFilters {
	/** Restrict matches to these books (empty or absent = all books). */
	bookIds?: string[];
	/** Restrict matches to paragraphs annotated with every one of these topics. */
	topics?: { type: string; value: string }[];
}

export function searchParagraphs(
	query: string,
	lang: string,
	filters: SearchFilters = {}
): SearchResult[] {
	const sanitized = query
		.split(/\s+/)
		.filter(Boolean)
		.map(term => term.replace(/['"()*^{}[\]:+\-\\]/g, ''))
		.filter(Boolean)
		.map(term => term + '*')
		.join(' ');
	console.log('[db] FTS5 query', { raw: query, sanitized, lang, filters });

	const params: BindParams = { $lang: lang };
	const conds: string[] = [];
	if (filters.bookIds?.length) {
		const names = filters.bookIds.map((id, i) => {
			(params as Record<string, string>)[`$book${i}`] = id;
			return `$book${i}`;
		});
		conds.push(`s.book_id IN (${names.join(', ')})`);
	}
	filters.topics?.forEach((topic, i) => {
		(params as Record<string, string>)[`$topicType${i}`] = topic.type;
		(params as Record<string, string>)[`$topicValue${i}`] = topic.value;
		conds.push(
			`EXISTS (SELECT 1 FROM annotations fa
			         WHERE fa.book_id = s.book_id AND fa.paragraph_id = s.paragraph_id
			           AND fa.topic_type = $topicType${i} AND fa.topic_value = $topicValue${i})`
		);
	});
	const filterSql = conds.length ? ` AND ${conds.join(' AND ')}` : '';

	// Filter-only search (no text): there is nothing to MATCH or rank, so list
	// every passage carrying all the selected topics, in reading order — the
	// truncated paragraph text stands in for the FTS snippet. Scanning the FTS
	// table without MATCH is fine at this corpus size.
	if (!sanitized) {
		if (!filters.topics?.length) return [];
		return queryAll<SearchResult>(
			`SELECT s.book_id,
			        COALESCE(bt.title, b.title) AS book_title,
			        s.chapter_id,
			        COALESCE(ct.title, c.title) AS chapter_title,
			        s.paragraph_id, p.label AS paragraph_label,
			        p.position, s.lang,
			        CASE WHEN length(s.content) > 300
			             THEN substr(s.content, 1, 300) || '…'
			             ELSE s.content END AS snippet
			 FROM search_index s
			 JOIN books b      ON s.book_id = b.id
			 JOIN chapters c   ON s.book_id = c.book_id AND s.chapter_id = c.id
			 JOIN paragraphs p ON s.book_id = p.book_id AND s.paragraph_id = p.id
			 LEFT JOIN book_translations bt
			        ON bt.book_id = b.id AND bt.lang = $lang
			 LEFT JOIN chapter_translations ct
			        ON ct.book_id = c.book_id AND ct.chapter_id = c.id AND ct.lang = $lang
			 WHERE s.lang = $lang${filterSql}
			 ORDER BY s.book_id, c.position, p.position
			 LIMIT 500`,
			params
		);
	}
	(params as Record<string, string>).$query = sanitized;

	// Pick the top matches by relevance (rank), then re-sort that set by
	// book → chapter → paragraph so groupByChapter sees contiguous chapters.
	return queryAll<SearchResult>(
		`SELECT * FROM (
		   SELECT s.book_id,
		          COALESCE(bt.title, b.title) AS book_title,
		          s.chapter_id,
		          COALESCE(ct.title, c.title) AS chapter_title,
		          s.paragraph_id, p.label AS paragraph_label,
		          p.position, c.position AS chapter_position, s.lang,
		          snippet(search_index, 4, '<mark>', '</mark>', '…', 40) AS snippet,
		          rank
		   FROM search_index s
		   JOIN books b      ON s.book_id = b.id
		   JOIN chapters c   ON s.book_id = c.book_id AND s.chapter_id = c.id
		   JOIN paragraphs p ON s.book_id = p.book_id AND s.paragraph_id = p.id
		   LEFT JOIN book_translations bt
		          ON bt.book_id = b.id AND bt.lang = $lang
		   LEFT JOIN chapter_translations ct
		          ON ct.book_id = c.book_id AND ct.chapter_id = c.id AND ct.lang = $lang
		   WHERE search_index MATCH $query AND s.lang = $lang${filterSql}
		   ORDER BY rank
		   LIMIT 50
		 )
		 ORDER BY book_id, chapter_position, position`,
		params
	);
}
