import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export interface ChapterGroup<T> {
	book_id: string;
	book_title: string;
	chapter_id: string;
	chapter_title: string;
	items: T[];
}

/**
 * Collapse a list of paragraph-level rows (search results, topic occurrences)
 * into one group per book+chapter. Rows must already be ordered by book then
 * chapter then position (both queries are), so a sequential pass suffices.
 */
export function groupByChapter<
	T extends { book_id: string; book_title: string; chapter_id: string; chapter_title: string }
>(rows: T[]): ChapterGroup<T>[] {
	const groups: ChapterGroup<T>[] = [];
	let cur: ChapterGroup<T> | null = null;
	for (const r of rows) {
		if (!cur || cur.book_id !== r.book_id || cur.chapter_id !== r.chapter_id) {
			cur = {
				book_id: r.book_id,
				book_title: r.book_title,
				chapter_id: r.chapter_id,
				chapter_title: r.chapter_title,
				items: []
			};
			groups.push(cur);
		}
		cur.items.push(r);
	}
	return groups;
}

export interface BookGroup<T> {
	book_id: string;
	book_title: string;
	/** Total rows across the book's chapters — the collapsible header's count. */
	count: number;
	chapters: ChapterGroup<T>[];
}

/**
 * Nest paragraph-level rows into book → chapter groups for the topic page's
 * collapsible tree. Same contiguity assumption as {@link groupByChapter}: rows
 * are ordered by book then chapter then position, so a single pass suffices.
 */
export function groupByBook<
	T extends { book_id: string; book_title: string; chapter_id: string; chapter_title: string }
>(rows: T[]): BookGroup<T>[] {
	const books: BookGroup<T>[] = [];
	let curBook: BookGroup<T> | null = null;
	let curChapter: ChapterGroup<T> | null = null;
	for (const r of rows) {
		if (!curBook || curBook.book_id !== r.book_id) {
			curBook = { book_id: r.book_id, book_title: r.book_title, count: 0, chapters: [] };
			books.push(curBook);
			curChapter = null;
		}
		if (!curChapter || curChapter.chapter_id !== r.chapter_id) {
			curChapter = {
				book_id: r.book_id,
				book_title: r.book_title,
				chapter_id: r.chapter_id,
				chapter_title: r.chapter_title,
				items: []
			};
			curBook.chapters.push(curChapter);
		}
		curChapter.items.push(r);
		curBook.count++;
	}
	return books;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
