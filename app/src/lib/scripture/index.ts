import type { Citation } from './citation';
import { bibbiaedu } from './bibbiaedu';
import { biblegateway } from './biblegateway';

export { parseCitation } from './citation';
export type { Citation } from './citation';

/** What a source can return for a set of citations.
 *  - `link-only`: the passage lives at an external source we can deep-link to
 *    but can't embed (e.g. CORS-blocked); render the links + attribution.
 *  - `unimplemented`: no source is wired up for the active UI language yet.
 *  - `unsupported`: parsed, but the source can't locate the book. */
export type ScripturePassage =
	| { status: 'link-only'; source: string; links: { label: string; url: string }[] }
	| { status: 'unimplemented' }
	| { status: 'unsupported' };

/** A single Bible edition/site. One driver per source; selected by UI language. */
export interface BibleSource {
	readonly name: string;
	resolve(refs: Citation[]): Promise<ScripturePassage>;
}

const notImplemented: BibleSource = {
	name: '',
	async resolve() {
		return { status: 'unimplemented' };
	}
};

/** The Bible source for the active UI language. Italian → Bibbia Edu CEI 2008;
 *  English → RSV-CE on Bible Gateway. Other languages have no source yet. */
export function getBibleSource(uiLang: string): BibleSource {
	if (uiLang === 'it') return bibbiaedu;
	if (uiLang === 'en') return biblegateway;
	return notImplemented;
}
