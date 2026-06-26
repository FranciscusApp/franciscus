// @ts-ignore — fts5-sql-bundle's sql-wasm.js has no type declarations
import initSqlJs from 'fts5-sql-bundle/dist/sql-wasm.js';
import type { Database, BindParams } from 'sql.js';
import type { BookMeta, Chapter, Paragraph, Aside, Annotation, TopicPage, ParagraphTranslation, AsideTranslation, SearchResult } from './types';

let db: Database | null = null;

const DB_URL = '/franciscus.db';
// No version suffix: staleness is decided by the db file's own ETag/Last-Modified
// (see downloadDb), so a rebuilt db refreshes without bumping anything here.
const DB_CACHE = 'franciscus-db';

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
		const etag = cached.headers.get('etag');
		const lastMod = cached.headers.get('last-modified');
		// ponytail: revalidate via HTTP validators; no validators => trust cache.
		// Covers Vite dev (Last-Modified changes on rebuild) and static hosts.
		if (!etag && !lastMod) return readWithProgress(cached, true, onProgress);
		try {
			const headers: Record<string, string> = {};
			if (etag) headers['If-None-Match'] = etag;
			else if (lastMod) headers['If-Modified-Since'] = lastMod;
			const res = await fetch(DB_URL, { headers });
			if (res.status === 304 || !res.ok) {
				return readWithProgress(cached, true, onProgress);
			}
			if (cache) {
				try {
					await cache.put(DB_URL, res.clone());
				} catch (e) {
					console.warn('[db] Failed to cache database', e);
				}
			}
			return readWithProgress(res, false, onProgress);
		} catch (e) {
			// Offline or network error: serve the cached copy.
			return readWithProgress(cached, true, onProgress);
		}
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

export function getBooks(lang: string = 'la'): BookMeta[] {
	return queryAll<BookMeta>(
		`SELECT b.id,
		        COALESCE(bt.title, b.title) AS title,
		        b.author, b.date, b.ref_edition, b.license
		 FROM books b
		 LEFT JOIN book_translations bt ON bt.book_id = b.id AND bt.lang = $lang
		 ORDER BY b.id`,
		{ $lang: lang }
	);
}

export function getBook(bookId: string, lang: string = 'la'): BookMeta | null {
	return queryOne<BookMeta>(
		`SELECT b.id,
		        COALESCE(bt.title, b.title) AS title,
		        b.author, b.date, b.ref_edition, b.license
		 FROM books b
		 LEFT JOIN book_translations bt ON bt.book_id = b.id AND bt.lang = $lang
		 WHERE b.id = $id`,
		{ $id: bookId, $lang: lang }
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

export function getTopicPages(lang: string = 'la'): TopicPage[] {
	return queryAll<TopicPage>(
		`SELECT tp.topic_type, tp.topic_value,
		        COALESCE(tt.description, tp.description) AS description,
		        COALESCE(tt.content,     tp.content)     AS content,
		        tt.lang_slug AS lang_slug
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
		        COALESCE(tt.content,     tp.content)     AS content,
		        tt.lang_slug AS lang_slug
		 FROM topic_pages tp
		 LEFT JOIN topic_page_translations tt
		        ON tt.topic_type = tp.topic_type AND tt.topic_value = tp.topic_value AND tt.lang = $lang
		 WHERE tp.topic_type = $type AND tp.topic_value = $value`,
		{ $type: topicType, $value: topicValue, $lang: lang }
	);
}

/**
 * Resolve a possibly-localized URL slug back to the canonical (topic_type,
 * topic_value). `slug` is the value taken from the URL (`/topics/<type>/<slug>`).
 * Returns the canonical pair when `slug` is either the canonical value or a
 * `lang_slug` registered under any language. Returns null when nothing matches.
 *
 * The route uses this to redirect lang_slug URLs to their canonical form
 * (FORMAT.md §11.2 — canonical URL is always the source value).
 */
export function resolveTopicSlug(
	topicType: string,
	slug: string
): { topic_type: string; topic_value: string } | null {
	const direct = queryOne<{ topic_type: string; topic_value: string }>(
		`SELECT topic_type, topic_value FROM topic_pages
		 WHERE topic_type = $type AND topic_value = $slug`,
		{ $type: topicType, $slug: slug }
	);
	if (direct) return direct;

	return queryOne<{ topic_type: string; topic_value: string }>(
		`SELECT topic_type, topic_value FROM topic_page_translations
		 WHERE topic_type = $type AND lang_slug = $slug
		 LIMIT 1`,
		{ $type: topicType, $slug: slug }
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

export interface TopicSummary {
	topic_type: string;
	topic_value: string;
	count: number;
	has_page: number;
	/** lang_slug registered for `uiLang`, when one exists. */
	lang_slug: string | null;
}

export function getDistinctTopics(uiLang: string = 'en'): TopicSummary[] {
	return queryAll<TopicSummary>(
		`SELECT a.topic_type, a.topic_value, COUNT(*) AS count,
		        EXISTS(SELECT 1 FROM topic_pages ap WHERE ap.topic_type = a.topic_type AND ap.topic_value = a.topic_value) AS has_page,
		        tt.lang_slug AS lang_slug
		 FROM annotations a
		 LEFT JOIN topic_page_translations tt
		        ON tt.topic_type = a.topic_type AND tt.topic_value = a.topic_value AND tt.lang = $uiLang
		 GROUP BY a.topic_type, a.topic_value
		 ORDER BY a.topic_type, a.topic_value`,
		{ $uiLang: uiLang }
	);
}

/**
 * Bulk-fetch the UI-lang lang_slug for every annotated topic, keyed by
 * `${topic_type}:${topic_value}`. Used by surfaces that render topic pills
 * (chapter reader, topic listing) so each pill displays the language-local
 * slug when one exists, falling back to the canonical value otherwise.
 */
export function getTopicLangSlugs(uiLang: string): Map<string, string> {
	const rows = queryAll<{ topic_type: string; topic_value: string; lang_slug: string }>(
		`SELECT topic_type, topic_value, lang_slug
		 FROM topic_page_translations
		 WHERE lang = $uiLang AND lang_slug IS NOT NULL`,
		{ $uiLang: uiLang }
	);
	const map = new Map<string, string>();
	for (const r of rows) map.set(`${r.topic_type}:${r.topic_value}`, r.lang_slug);
	return map;
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
		`SELECT a.id, a.book_id, a.paragraph_id, a.paragraph_to_id, a.topic_type, a.topic_value, a.by_whom, a.by_type, a.verified, a.comment
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
		   WHERE search_index MATCH $query AND s.lang = $lang
		   ORDER BY rank
		   LIMIT 50
		 )
		 ORDER BY book_id, chapter_position, position`,
		{ $query: sanitized, $lang: lang }
	);
}
