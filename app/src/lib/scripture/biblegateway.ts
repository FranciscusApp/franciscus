import type { Citation } from './citation';
import type { BibleSource, ScripturePassage } from './index';

// Corpus book abbreviation → Bible Gateway (English) book name. The corpus keeps
// Vulgate numbering, so 1–4 Kgs are Samuel/Kings and 2 Esd is Nehemiah. "Luc"/"Is"
// are corpus typo aliases. RSVCE carries the deuterocanon, so every corpus book maps.
const BOOK_NAMES: Record<string, string> = {
	// New Testament
	Matt: 'Matthew',
	Mark: 'Mark',
	Luke: 'Luke',
	Luc: 'Luke',
	John: 'John',
	Acts: 'Acts',
	Rom: 'Romans',
	'1 Cor': '1 Corinthians',
	'2 Cor': '2 Corinthians',
	Gal: 'Galatians',
	Eph: 'Ephesians',
	Phil: 'Philippians',
	Col: 'Colossians',
	'1 Thess': '1 Thessalonians',
	'2 Thess': '2 Thessalonians',
	'1 Tim': '1 Timothy',
	'2 Tim': '2 Timothy',
	Titus: 'Titus',
	Heb: 'Hebrews',
	Jas: 'James',
	'1 Pet': '1 Peter',
	'2 Pet': '2 Peter',
	'1 John': '1 John',
	Jude: 'Jude',
	Rev: 'Revelation',
	// Old Testament
	Gen: 'Genesis',
	Exod: 'Exodus',
	Lev: 'Leviticus',
	Num: 'Numbers',
	Deut: 'Deuteronomy',
	Josh: 'Joshua',
	Judg: 'Judges',
	Ruth: 'Ruth',
	'1 Kgs': '1 Samuel',
	'2 Kgs': '2 Samuel',
	'3 Kgs': '1 Kings',
	'4 Kgs': '2 Kings',
	'1 Chr': '1 Chronicles',
	'2 Chr': '2 Chronicles',
	'2 Esd': 'Nehemiah',
	Tob: 'Tobit',
	Jdt: 'Judith',
	Esth: 'Esther',
	Job: 'Job',
	Ps: 'Psalms',
	Prov: 'Proverbs',
	Eccl: 'Ecclesiastes',
	Song: 'Song of Solomon',
	Wis: 'Wisdom of Solomon',
	Sir: 'Sirach',
	Isa: 'Isaiah',
	Is: 'Isaiah',
	Jer: 'Jeremiah',
	Lam: 'Lamentations',
	Bar: 'Baruch',
	Ezek: 'Ezekiel',
	Dan: 'Daniel',
	Hos: 'Hosea',
	Joel: 'Joel',
	Mic: 'Micah',
	Zech: 'Zechariah',
	'1 Macc': '1 Maccabees',
	'2 Macc': '2 Maccabees'
};

const BASE = 'https://www.biblegateway.com/passage/';
const VERSION = 'RSVCE';

/** Deep link to the passage on Bible Gateway, or null when the book is unmapped.
 *  The site's `search` param takes a plain "Book chapter[:verse[-verseEnd]]" ref. */
function deepLink(c: Citation): string | null {
	const name = BOOK_NAMES[c.book];
	if (!name) return null;
	let ref = `${name} ${c.chapter}`;
	if (c.verse !== null) {
		ref += `:${c.verse}`;
		if (c.verseEnd !== null) ref += `-${c.verseEnd}`;
	}
	return `${BASE}?search=${encodeURIComponent(ref)}&version=${VERSION}`;
}

/** RSV Catholic Edition on Bible Gateway (English UI). Bible Gateway blocks
 *  cross-origin reads, so — like the Italian source — we resolve to a deep link
 *  into the exact passage rather than embedding the text. */
export const biblegateway: BibleSource = {
	name: 'RSV-CE (Bible Gateway)',
	async resolve(refs: Citation[]): Promise<ScripturePassage> {
		const links = refs
			.map((c) => ({ label: c.raw, url: deepLink(c) }))
			.filter((l): l is { label: string; url: string } => l.url !== null);
		if (!links.length) return { status: 'unsupported' };
		return { status: 'link-only', source: 'RSV-CE (Bible Gateway)', links };
	}
};
