import type { Citation } from './citation';
import type { BibleSource, ScripturePassage } from './index';
import { toMasoreticPsalm } from './psalms';

// Corpus book abbreviation → Bibbia Edu CEI 2008 location (testament path + book
// code, as used in bibbiaedu.it URLs). The corpus follows Vulgate numbering, so
// 1–4 Kgs are Samuel/Kings and 2 Esd is Nehemiah; codes below were verified
// against the live site's book titles. "Luc"/"Is" are corpus typo aliases.
const BOOK_CODES: Record<string, { testament: 'at' | 'nt'; code: string }> = {
	// New Testament
	Matt: { testament: 'nt', code: 'Mt' },
	Mark: { testament: 'nt', code: 'Mc' },
	Luke: { testament: 'nt', code: 'Lc' },
	Luc: { testament: 'nt', code: 'Lc' },
	John: { testament: 'nt', code: 'Gv' },
	Acts: { testament: 'nt', code: 'At' },
	Rom: { testament: 'nt', code: 'Rm' },
	'1 Cor': { testament: 'nt', code: '1Cor' },
	'2 Cor': { testament: 'nt', code: '2Cor' },
	Gal: { testament: 'nt', code: 'Gal' },
	Eph: { testament: 'nt', code: 'Ef' },
	Phil: { testament: 'nt', code: 'Fil' },
	Col: { testament: 'nt', code: 'Col' },
	'1 Thess': { testament: 'nt', code: '1Ts' },
	'2 Thess': { testament: 'nt', code: '2Ts' },
	'1 Tim': { testament: 'nt', code: '1Tm' },
	'2 Tim': { testament: 'nt', code: '2Tm' },
	Titus: { testament: 'nt', code: 'Tt' },
	Heb: { testament: 'nt', code: 'Eb' },
	Jas: { testament: 'nt', code: 'Gc' },
	'1 Pet': { testament: 'nt', code: '1Pt' },
	'2 Pet': { testament: 'nt', code: '2Pt' },
	'1 John': { testament: 'nt', code: '1Gv' },
	Jude: { testament: 'nt', code: 'Gd' },
	Rev: { testament: 'nt', code: 'Ap' },
	// Old Testament
	Gen: { testament: 'at', code: 'Gen' },
	Exod: { testament: 'at', code: 'Es' },
	Lev: { testament: 'at', code: 'Lv' },
	Num: { testament: 'at', code: 'Nm' },
	Deut: { testament: 'at', code: 'Dt' },
	Josh: { testament: 'at', code: 'Gs' },
	Judg: { testament: 'at', code: 'Gdc' },
	Ruth: { testament: 'at', code: 'Rt' },
	'1 Kgs': { testament: 'at', code: '1Sam' },
	'2 Kgs': { testament: 'at', code: '2Sam' },
	'3 Kgs': { testament: 'at', code: '1Re' },
	'4 Kgs': { testament: 'at', code: '2Re' },
	'1 Chr': { testament: 'at', code: '1Cr' },
	'2 Chr': { testament: 'at', code: '2Cr' },
	'2 Esd': { testament: 'at', code: 'Ne' },
	Tob: { testament: 'at', code: 'Tb' },
	Jdt: { testament: 'at', code: 'Gdt' },
	Esth: { testament: 'at', code: 'Est' },
	Job: { testament: 'at', code: 'Gb' },
	Ps: { testament: 'at', code: 'Sal' },
	Prov: { testament: 'at', code: 'Pr' },
	Eccl: { testament: 'at', code: 'Qo' },
	Song: { testament: 'at', code: 'Ct' },
	Wis: { testament: 'at', code: 'Sap' },
	Sir: { testament: 'at', code: 'Sir' },
	Isa: { testament: 'at', code: 'Is' },
	Is: { testament: 'at', code: 'Is' },
	Jer: { testament: 'at', code: 'Ger' },
	Lam: { testament: 'at', code: 'Lam' },
	Bar: { testament: 'at', code: 'Bar' },
	Ezek: { testament: 'at', code: 'Ez' },
	Dan: { testament: 'at', code: 'Dn' },
	Hos: { testament: 'at', code: 'Os' },
	Joel: { testament: 'at', code: 'Gl' },
	Mic: { testament: 'at', code: 'Mi' },
	Zech: { testament: 'at', code: 'Zc' },
	'1 Macc': { testament: 'at', code: '1Mac' },
	'2 Macc': { testament: 'at', code: '2Mac' }
};

const BASE = 'https://www.bibbiaedu.it/CEI2008';

/** Deep link to the passage on bibbiaedu.it, or null when the book is unmapped.
 *  Verse selection uses the site's own "chapter,verse[-verseEnd]" query form. */
function deepLink(c: Citation): string | null {
	const loc = BOOK_CODES[c.book];
	if (!loc) return null;
	const chapter = c.book === 'Ps' ? toMasoreticPsalm(c.chapter) : c.chapter;
	let url = `${BASE}/${loc.testament}/${loc.code}/${chapter}/`;
	if (c.verse !== null) {
		const sel = c.verseEnd !== null ? `${chapter},${c.verse}-${c.verseEnd}` : `${chapter},${c.verse}`;
		url += `?sel=${sel}`;
	}
	return url;
}

/** Bibbia Edu CEI 2008 (Italian UI). The site renders verse text client-side
 *  behind a same-origin AJAX call and sends no CORS headers, so a static PWA
 *  can't read the passage in-browser; until a proxy exists we resolve to a
 *  deep link into the exact passage instead. */
export const bibbiaedu: BibleSource = {
	name: 'Bibbia CEI 2008',
	async resolve(refs: Citation[]): Promise<ScripturePassage> {
		const links = refs
			.map((c) => ({ label: c.raw, url: deepLink(c) }))
			.filter((l): l is { label: string; url: string } => l.url !== null);
		if (!links.length) return { status: 'unsupported' };
		return { status: 'link-only', source: 'Bibbia CEI 2008', links };
	}
};
