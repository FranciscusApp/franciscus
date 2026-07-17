/**
 * Shareable state for the study view (/study): the search setup (text query,
 * book and topic filters) plus what each of the two panes is showing. Encoded
 * as base64url JSON in the `?state=` query parameter — written only when the
 * user copies a link, and read once on page load.
 */

/** What one study pane is reading; null means the pane shows search results. */
export interface StudyPaneState {
	book: string;
	chapter: string;
	/** Paragraph the pane scrolls to on open. */
	para?: string;
}

export interface StudyState {
	q: string;
	/** Selected source-book ids (advanced-search facet). */
	books: string[];
	/** Selected `type:value` topic keys (advanced-search facet). */
	topics: string[];
	panes: [StudyPaneState | null, StudyPaneState | null];
}

export function emptyStudyState(): StudyState {
	return { q: '', books: [], topics: [], panes: [null, null] };
}

/** base64url (no padding) of the UTF-8 JSON encoding. */
export function encodeStudyState(state: StudyState): string {
	const bytes = new TextEncoder().encode(JSON.stringify(state));
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Decode a `?state=` value; malformed or foreign input yields null. */
export function decodeStudyState(raw: string): StudyState | null {
	try {
		const bin = atob(raw.replaceAll('-', '+').replaceAll('_', '/'));
		const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
		const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (typeof parsed !== 'object' || parsed === null) return null;
		const p = parsed as Record<string, unknown>;
		const state = emptyStudyState();
		if (typeof p.q === 'string') state.q = p.q;
		if (Array.isArray(p.books)) state.books = p.books.filter((b) => typeof b === 'string');
		if (Array.isArray(p.topics)) state.topics = p.topics.filter((t) => typeof t === 'string');
		if (Array.isArray(p.panes)) {
			for (let i = 0; i < 2; i++) state.panes[i] = sanitizePane(p.panes[i]);
		}
		return state;
	} catch {
		return null;
	}
}

function sanitizePane(value: unknown): StudyPaneState | null {
	if (typeof value !== 'object' || value === null) return null;
	const v = value as Record<string, unknown>;
	if (typeof v.book !== 'string' || typeof v.chapter !== 'string') return null;
	const pane: StudyPaneState = { book: v.book, chapter: v.chapter };
	if (typeof v.para === 'string') pane.para = v.para;
	return pane;
}

/** URL of the study view preloaded with (part of) a state — e.g. a topic
 *  page's "open in study view" link carrying its own topic as a filter. */
export function studyHref(partial: Partial<StudyState>): string {
	const state = { ...emptyStudyState(), ...partial };
	return `/study?state=${encodeStudyState(state)}`;
}
