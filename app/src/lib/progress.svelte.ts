import { browser } from '$app/environment';

/**
 * Per-book reading progress: the furthest chapter the reader has reached by
 * moving forward one chapter at a time. Progress advances ONLY when the chapter
 * being viewed is exactly one step past the saved point, so jumping to a late
 * chapter from a topic page or a search hit never moves it (the jump is
 * non-contiguous). It never moves backward either — re-reading an earlier
 * chapter leaves the saved point untouched.
 *
 * Client-side only (localStorage), no account. Survives new tabs and reloads.
 */
export interface Progress {
	/** Chapter `position` reached. */
	position: number;
	/** Where to resume — the chapter pathname. */
	href: string;
	/** Resolved chapter title for the resume link. */
	label: string;
}

const STORAGE_KEY = 'franciscus-progress';

function load(): Record<string, Progress> {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Record<string, Progress>) : {};
	} catch {
		return {};
	}
}

let progress = $state<Record<string, Progress>>(load());

function persist(value: Record<string, Progress>) {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		/* localStorage may be unavailable (private mode, quota) */
	}
}

export function getProgress(bookId: string): Progress | undefined {
	return progress[bookId];
}

/**
 * Pure advance rule. Returns the position to save, or `undefined` for no change.
 * `saved` is the stored position (undefined on a fresh book); `first` is the
 * position of the book's first chapter, which is where a fresh reader is parked.
 */
export function nextProgress(
	saved: number | undefined,
	first: number,
	visiting: number
): number | undefined {
	const current = saved ?? first;
	return visiting === current + 1 ? visiting : undefined; // one step forward only
}

/** Record arrival at a chapter, advancing progress when it is the next step. */
export function recordProgress(bookId: string, first: number, chapter: Progress) {
	const next = nextProgress(progress[bookId]?.position, first, chapter.position);
	if (next === undefined) return;
	progress = { ...progress, [bookId]: { ...chapter, position: next } };
	persist(progress);
}
