import en from './en.json';
import it from './it.json';

const messages: Record<string, Record<string, unknown>> = { en, it };

export const UI_LANGUAGES = [
	{ code: 'en', label: 'English' },
	{ code: 'it', label: 'Italiano' }
] as const;

let uiLang = $state(loadPref('franciscus-ui-lang', 'en'));
let corpusLang = $state(loadPref('franciscus-corpus-lang', 'la'));
let parallelReader = $state(loadPref('franciscus-parallel-reader', 'false') === 'true');

function loadPref(key: string, fallback: string): string {
	if (typeof localStorage === 'undefined') return fallback;
	return localStorage.getItem(key) ?? fallback;
}

function savePref(key: string, value: string) {
	if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
}

export function getUiLang(): string {
	return uiLang;
}

export function setUiLang(lang: string) {
	uiLang = lang;
	savePref('franciscus-ui-lang', lang);
}

export function getCorpusLang(): string {
	return corpusLang;
}

export function setCorpusLang(lang: string) {
	corpusLang = lang;
	savePref('franciscus-corpus-lang', lang);
}

/** Reader preference: show the original source beside a translation. Only takes
 *  effect on the chapter reader, on wide viewports (see the reader page). */
export function getParallelReader(): boolean {
	return parallelReader;
}

export function setParallelReader(on: boolean) {
	parallelReader = on;
	savePref('franciscus-parallel-reader', String(on));
}

/** The book page's editorial note, generated from the read rendition's
 *  provenance and rendered in the current UI language. Returns null when there
 *  is no provenance (the Latin source rendition). Reads `uiLang` via `t`, so it
 *  is reactive inside a `$derived`. */
export function bookNote(meta: {
	provenance: string | null;
	status: string | null;
	translation_source: string | null;
	source: string | null;
}): string | null {
	const { provenance, status, translation_source, source } = meta;
	if (provenance) {
		// A translation rendition: the note is about the translation.
		if (provenance === 'ai') {
			return status === 'final' ? t('book.note.ai') : t('book.note.aiDraft');
		}
		if (translation_source) {
			return t('book.note.officialFrom').replace('{source}', translation_source);
		}
		return status === 'final' ? t('book.note.human') : t('book.note.draft');
	}
	// The source rendition (Latin original): note where the text was obtained.
	if (source) {
		return t('book.note.sourceFrom').replace('{source}', source);
	}
	return null;
}

export function t(path: string): string {
	const dict = messages[uiLang] ?? messages['en'];
	const keys = path.split('.');
	let node: unknown = dict;
	for (const k of keys) {
		if (node == null || typeof node !== 'object') return path;
		node = (node as Record<string, unknown>)[k];
	}
	return typeof node === 'string' ? node : path;
}
