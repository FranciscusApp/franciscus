// @ts-ignore — fts5-sql-bundle's sql-wasm.js has no type declarations
import initSqlJs from 'fts5-sql-bundle/dist/sql-wasm.js';
import type { Database, BindParams } from 'sql.js';
import type { BookMeta, Chapter, Paragraph, Aside, Annotation, AttributePage, ParagraphTranslation, AsideTranslation, SearchResult } from './types';

let db: Database | null = null;

export async function initDb(): Promise<Database> {
	if (db) return db;

	const SQL = await (initSqlJs as any)({
		locateFile: () => '/sql-wasm.wasm'
	});

	const response = await fetch('/franciscus.db');
	const buffer = await response.arrayBuffer();
	db = new SQL.Database(new Uint8Array(buffer)) as Database;
	return db;
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
