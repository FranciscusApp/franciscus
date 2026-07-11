import { browser } from '$app/environment';

/**
 * Reader bookmarks: passages the reader marked to return to. Client-side only
 * (localStorage), no account. A bookmark is keyed by its deep-link `href`
 * (`/book/<book>/<chapter>#<paragraph>`), which already exists as a scroll
 * anchor on the chapter page, so marking a passage needs no new identifiers.
 */
export interface Bookmark {
	/** Deep link to the passage, including the `#<paragraph>` anchor. */
	href: string;
	/** Resolved label for the list, e.g. "Vita prima — 1". */
	label: string;
	/** When it was added (newest first in the list). */
	ts: number;
	/** Optional personal note the reader attached to the bookmark. */
	note?: string;
}

const STORAGE_KEY = 'franciscus-bookmarks';

function load(): Bookmark[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Bookmark[]) : [];
	} catch {
		return [];
	}
}

let bookmarks = $state<Bookmark[]>(load());

function persist(value: Bookmark[]) {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		/* localStorage may be unavailable (private mode, quota) */
	}
}

export function getBookmarks(): Bookmark[] {
	return bookmarks;
}

export function isBookmarked(href: string): boolean {
	return bookmarks.some((b) => b.href === href);
}

/** Add the passage if absent, remove it if already bookmarked. */
export function toggleBookmark(href: string, label: string) {
	bookmarks = isBookmarked(href)
		? bookmarks.filter((b) => b.href !== href)
		: [{ href, label, ts: Date.now() }, ...bookmarks];
	persist(bookmarks);
}

/** Set (or clear, when empty) the personal note on a bookmark. */
export function setBookmarkNote(href: string, note: string) {
	const trimmed = note.trim();
	bookmarks = bookmarks.map((b) =>
		b.href === href ? { ...b, note: trimmed || undefined } : b
	);
	persist(bookmarks);
}
