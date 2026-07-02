import { browser } from '$app/environment';

/**
 * Contributor edit buffer (Phase 2): annotation edits staged locally, before any
 * GitHub write. Client-side only (localStorage), like bookmarks — no network here.
 * A later phase turns this buffer into a source-file diff and a PR.
 *
 * Each edit is keyed by its target annotation `{book, paragraph, type, value}`
 * plus its `op`, so a `verify` and a `comment` on the same annotation are two
 * entries (Phase 3 writes them to different YAML fields). `add` and `remove` on
 * the same key cancel out — staging one drops a pending opposite.
 *
 * `editorMode` is a global reader flag (persisted like `theme`), default off even
 * when connected; it only means anything once a GitHub token is present.
 */
export type EditOp = 'add' | 'remove' | 'verify' | 'comment';

export interface Edit {
	book_id: string;
	paragraph_id: string;
	topic_type: string;
	topic_value: string;
	op: EditOp;
	/** `verify`: the promoted flag (ai → human). */
	verified?: boolean;
	/** `comment`: the editorial note text. */
	comment?: string;
}

/**
 * A staged prose edit (Phase 5): a full-body replacement of one `<p>` paragraph
 * or one `<aside>` block, in a specific rendition. `lang` selects the target
 * file (`la` → source `<id>.md`, else `<id>.<lang>.md`); `target_id` is the DB
 * element id (`<p>` id, or the positional `<chapter>-aside-K`), unique within a
 * file, so `{book_id, lang, target_id}` is the buffer key. `chapter_id` is kept
 * because an aside is reverse-located by its position *within its chapter*.
 * `text` is the new body in **source form** ([N] verse markers, literal `<ref>`).
 */
export interface ProseEdit {
	book_id: string;
	lang: string;
	chapter_id: string;
	kind: 'paragraph' | 'aside';
	target_id: string;
	text: string;
}

const MODE_KEY = 'franciscus-editor-mode';
const EDITS_KEY = 'franciscus-edits';
const PROSE_KEY = 'franciscus-prose-edits';

function loadString(key: string): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function loadEdits(): Edit[] {
	const raw = loadString(EDITS_KEY);
	if (!raw) return [];
	try {
		return JSON.parse(raw) as Edit[];
	} catch {
		return [];
	}
}

function loadProseEdits(): ProseEdit[] {
	const raw = loadString(PROSE_KEY);
	if (!raw) return [];
	try {
		return JSON.parse(raw) as ProseEdit[];
	} catch {
		return [];
	}
}

let editorMode = $state<boolean>(loadString(MODE_KEY) === 'true');
let edits = $state<Edit[]>(loadEdits());
let proseEdits = $state<ProseEdit[]>(loadProseEdits());

function persist(key: string, value: string | null) {
	if (!browser) return;
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		/* localStorage may be unavailable (private mode, quota) */
	}
}

function commit(next: Edit[]) {
	edits = next;
	persist(EDITS_KEY, JSON.stringify(next));
}

function commitProse(next: ProseEdit[]) {
	proseEdits = next;
	persist(PROSE_KEY, JSON.stringify(next));
}

export function isEditorMode(): boolean {
	return editorMode;
}

export function setEditorMode(value: boolean) {
	editorMode = value;
	persist(MODE_KEY, value ? 'true' : null);
}

export function getEdits(): Edit[] {
	return edits;
}

function sameTarget(e: Edit, book: string, para: string, type: string, value: string): boolean {
	return (
		e.book_id === book &&
		e.paragraph_id === para &&
		e.topic_type === type &&
		e.topic_value === value
	);
}

function find(book: string, para: string, type: string, value: string, op: EditOp): Edit | undefined {
	return edits.find((e) => e.op === op && sameTarget(e, book, para, type, value));
}

/** Drop every entry for a target with the given op. */
function without(book: string, para: string, type: string, value: string, op: EditOp): Edit[] {
	return edits.filter((e) => !(e.op === op && sameTarget(e, book, para, type, value)));
}

// --- reader queries (read the reactive $state, so callable inside $derived) ---

export function pendingRemoval(book: string, para: string, type: string, value: string): boolean {
	return !!find(book, para, type, value, 'remove');
}

export function pendingVerify(book: string, para: string, type: string, value: string): boolean {
	return !!find(book, para, type, value, 'verify');
}

export function pendingComment(
	book: string,
	para: string,
	type: string,
	value: string
): string | null {
	return find(book, para, type, value, 'comment')?.comment ?? null;
}

/** Topics staged for addition on a paragraph (the dashed pending-add pills). */
export function pendingAdds(book: string, para: string): Edit[] {
	return edits.filter((e) => e.op === 'add' && e.book_id === book && e.paragraph_id === para);
}

// --- mutators ---

/** Stage adding a topic. A pending `remove` on the same key cancels out instead. */
export function stageAdd(book: string, para: string, type: string, value: string) {
	if (find(book, para, type, value, 'remove')) {
		commit(without(book, para, type, value, 'remove'));
		return;
	}
	if (find(book, para, type, value, 'add')) return;
	commit([...edits, { book_id: book, paragraph_id: para, topic_type: type, topic_value: value, op: 'add' }]);
}

/** Stage removing an annotation. A pending `add` on the same key cancels out. */
export function stageRemove(book: string, para: string, type: string, value: string) {
	if (find(book, para, type, value, 'add')) {
		commit(without(book, para, type, value, 'add'));
		return;
	}
	if (find(book, para, type, value, 'remove')) return;
	commit([...edits, { book_id: book, paragraph_id: para, topic_type: type, topic_value: value, op: 'remove' }]);
}

/** Toggle promoting an annotation's provenance (ai → human). */
export function setVerify(book: string, para: string, type: string, value: string, on: boolean) {
	const base = without(book, para, type, value, 'verify');
	commit(
		on
			? [...base, { book_id: book, paragraph_id: para, topic_type: type, topic_value: value, op: 'verify', verified: true }]
			: base
	);
}

/** Set (or clear, when empty) an annotation's editorial comment. */
export function setComment(book: string, para: string, type: string, value: string, text: string) {
	const trimmed = text.trim();
	const base = without(book, para, type, value, 'comment');
	commit(
		trimmed
			? [...base, { book_id: book, paragraph_id: para, topic_type: type, topic_value: value, op: 'comment', comment: trimmed }]
			: base
	);
}

// --- prose edits (Phase 5) ---

export function getProseEdits(): ProseEdit[] {
	return proseEdits;
}

/** The staged prose edit for a rendition's element, or null. `target_id` is
 * unique within a file, so `lang` + `target_id` pins it down. */
export function pendingProse(book: string, lang: string, targetId: string): ProseEdit | null {
	return (
		proseEdits.find(
			(e) => e.book_id === book && e.lang === lang && e.target_id === targetId
		) ?? null
	);
}

/** Stage (or replace) a prose body edit. Passing text equal to the original is
 * the caller's cue to unstage — see {@link unstageProse}; this only writes. */
export function setProse(edit: ProseEdit) {
	const base = proseEdits.filter(
		(e) => !(e.book_id === edit.book_id && e.lang === edit.lang && e.target_id === edit.target_id)
	);
	commitProse([...base, edit]);
}

/** Drop a staged prose edit (My Contributions "unstage", editor "discard"). */
export function unstageProse(book: string, lang: string, targetId: string) {
	commitProse(
		proseEdits.filter(
			(e) => !(e.book_id === book && e.lang === lang && e.target_id === targetId)
		)
	);
}

/** Drop the whole buffer — used after a successful PR submission (Phase 4). */
export function clearAll() {
	commit([]);
	commitProse([]);
}

/** Remove one exact staged edit (My Contributions "unstage", reader cancels). */
export function unstage(edit: Edit) {
	commit(without(edit.book_id, edit.paragraph_id, edit.topic_type, edit.topic_value, edit.op));
}

/** Drop every staged edit for a target — used when unstaging a pending `add`, so
 * a comment attached to that not-yet-real annotation doesn't outlive it. */
export function clearTarget(book: string, para: string, type: string, value: string) {
	commit(edits.filter((e) => !sameTarget(e, book, para, type, value)));
}
