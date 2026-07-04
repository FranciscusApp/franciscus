/** A single scripture citation parsed from a `<ref to="...">` value. Books keep
 *  the corpus's English, Vulgate-numbered abbreviations (e.g. "Matt", "1 Cor",
 *  "4 Kgs"); a source driver maps those onto its own edition. */
export interface Citation {
	book: string;
	chapter: number;
	verse: number | null; // null when the ref names a whole chapter
	verseEnd: number | null; // end of an inclusive verse range, else null
	raw: string; // the original segment, for display
}

// Book is an optional leading numeral ("1 Cor") plus letters; chapter and verse
// are separated by ":" or "," (a few corpus refs use the Italian comma), and an
// optional "-range" closes it. Anything else (e.g. "place:assisi") won't match.
const SEGMENT = /^((?:[1-4]\s+)?[A-Za-z]+)\s+(\d+)(?:[:,]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/;

function parseSegment(segment: string): Citation | null {
	const m = SEGMENT.exec(segment.trim());
	if (!m) return null;
	return {
		book: m[1].replace(/\s+/g, ' '),
		chapter: Number(m[2]),
		verse: m[3] ? Number(m[3]) : null,
		verseEnd: m[4] ? Number(m[4]) : null,
		raw: segment.trim()
	};
}

/** Parse a `to` value into its citations. A single value may hold several,
 *  separated by ";" (e.g. "1 Chr 28:21; Ps 18:5"). Returns null when none of
 *  the segments look like a scripture reference. */
export function parseCitation(to: string): Citation[] | null {
	const out: Citation[] = [];
	for (const segment of to.split(';')) {
		const c = parseSegment(segment);
		if (c) out.push(c);
	}
	return out.length ? out : null;
}
