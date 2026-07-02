import type { ProseEdit } from './edits.svelte';

/**
 * Phase 5 reverse mapping: turn a staged prose edit (addressed by the DB's
 * build-artifact ids) back into a source `.md` text diff.
 *
 * The Rust ingest (server/src/parser.rs) rewrites two things the source `.md`
 * does NOT contain literally:
 *   - `[N]` verse markers  →  `<v id="<paragraph-id>-N">N</v>`
 *   - bare `<aside>` blocks →  positional id `<chapter>-aside-K` (per chapter)
 * so the reader shows `<v>`-tagged content and asides addressed by a positional
 * id. To write an edit back we reverse the verse rewrite ({@link dbContentToSource})
 * and locate the *source* `<p id>` / Kth `<aside>` to splice the new body into.
 *
 * Like {@link ./annotationDiff}, this is targeted text surgery, NOT a Markdown
 * round-trip: only the edited block's inner region changes, so every untouched
 * line stays byte-identical and the PR diff is minimal.
 */

/** DB display content → source form: `<v id="p-N">N</v>` back to `[N]`. `<ref>`
 * and all other markup pass through unchanged. Inverse of the parser's
 * `replace_verse_markers`; used to seed the editor textarea. */
export function dbContentToSource(html: string): string {
	return html.replace(/<v\b[^>]*>(\d+)<\/v>/g, '[$1]');
}

/** Source form → DB display content, an exact mirror of the parser's
 * `replace_verse_markers`, so a staged edit that didn't touch verse numbers
 * renders byte-identically in place. `<ref>` etc. pass through. */
export function sourceToDisplay(text: string, paragraphId: string): string {
	return text.replace(/\[(\d+)\]/g, (_m, n) => `<v id="${paragraphId}-${n}">${n}</v>`);
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The positional K in an aside id `<chapter>-aside-K`, or null if not an aside id. */
function asideOrdinal(targetId: string): number | null {
	const m = /-aside-(\d+)$/.exec(targetId);
	return m ? parseInt(m[1], 10) : null;
}

/** Replace the inner body of `<p id="paragraphId">…</p>`, preserving the opening
 * tag (id/label/provenance/by) verbatim. Returns null if the paragraph isn't
 * found (caller treats a miss as a no-op). Matches the id attribute exactly, so
 * `id="1"` never matches `id="10"`. */
function replaceParagraphBody(md: string, paragraphId: string, body: string): string | null {
	const reOpen = /<p\b([^>]*)>/g;
	let m: RegExpExecArray | null;
	while ((m = reOpen.exec(md))) {
		const idM = /\bid="([^"]*)"/.exec(m[1]);
		if (!idM || idM[1] !== paragraphId) continue;
		const innerStart = m.index + m[0].length;
		const close = md.indexOf('</p>', innerStart);
		if (close === -1) return null;
		return md.slice(0, innerStart) + `\n${body}\n` + md.slice(close);
	}
	return null;
}

/** The [start, end) offsets of a chapter's body region — from just after its
 * `## … <a id="chapterId"></a>` heading line to just before the next `##`
 * heading (or EOF). Aside numbering is per-chapter, so we scope the count here. */
function chapterRegion(md: string, chapterId: string): [number, number] | null {
	const re = new RegExp(`^##\\s+.*<a\\s+id="${escapeRegex(chapterId)}"\\s*>\\s*</a>.*$`, 'm');
	const m = re.exec(md);
	if (!m) return null;
	const start = m.index + m[0].length;
	const nextM = /\n##\s+/.exec(md.slice(start));
	const end = nextM ? start + nextM.index + 1 : md.length;
	return [start, end];
}

/** Replace the inner body of the `ordinal`-th `<aside>` within a chapter's
 * source region (1-indexed, matching the parser's per-chapter `aside_pos`).
 * Returns null if the chapter or that aside isn't found. */
function replaceAsideBody(
	md: string,
	chapterId: string,
	ordinal: number,
	body: string
): string | null {
	const region = chapterRegion(md, chapterId);
	if (!region) return null;
	const [rs, re] = region;
	const sub = md.slice(rs, re);
	const reAside = /<aside>([\s\S]*?)<\/aside>/g;
	let m: RegExpExecArray | null;
	let count = 0;
	while ((m = reAside.exec(sub))) {
		count++;
		if (count === ordinal) {
			const innerStart = rs + m.index + '<aside>'.length;
			const innerEnd = rs + m.index + m[0].length - '</aside>'.length;
			return md.slice(0, innerStart) + `\n${body}\n` + md.slice(innerEnd);
		}
	}
	return null;
}

/**
 * Rewrite one rendition's `.md` text with its staged prose edits, producing new
 * text (the caller diffs it). `edits` may hold entries for other books /
 * renditions — they're filtered by `bookId` + `lang`. A target that can't be
 * located is skipped (a no-op is safe: it just contributes no diff).
 */
export function applyProseEdits(
	mdText: string,
	bookId: string,
	lang: string,
	edits: ProseEdit[]
): string {
	const mine = edits.filter((e) => e.book_id === bookId && e.lang === lang);
	let out = mdText;
	for (const e of mine) {
		let next: string | null;
		if (e.kind === 'aside') {
			const ord = asideOrdinal(e.target_id);
			next = ord ? replaceAsideBody(out, e.chapter_id, ord, e.text) : null;
		} else {
			next = replaceParagraphBody(out, e.target_id, e.text);
		}
		if (next !== null) out = next;
	}
	return out;
}

// --- validation (Phase 5: a client-side subset of the books.md invariants) ---

/**
 * Reject staged prose bodies that would break the corpus format before they
 * reach a PR: empty text, stray headings, leaked block tags, or malformed
 * `<ref>` (unbalanced, or missing its `to` target). Returns human-readable
 * error strings (empty = ok). Mirrors the invariants the Rust parser assumes.
 */
export function validateProse(edits: ProseEdit[]): string[] {
	const errors: string[] = [];
	for (const e of edits) {
		const label = e.kind === 'aside' ? `aside ${e.target_id}` : `paragraph ${e.target_id}`;
		const body = e.text;
		if (!body.trim()) {
			errors.push(`Text for ${label} cannot be empty.`);
			continue;
		}
		for (const line of body.split(/\r?\n/)) {
			if (/^\s{0,3}#{1,6}\s/.test(line)) {
				errors.push(`Headings are not allowed in ${label}.`);
				break;
			}
		}
		if (/<\/?(?:p|aside)\b/i.test(body)) {
			errors.push(`Block tags (<p>/<aside>) are not allowed inside ${label}.`);
		}
		const open = body.match(/<ref\b[^>]*>/gi) ?? [];
		const close = body.match(/<\/ref>/gi) ?? [];
		if (open.length !== close.length) {
			errors.push(`Unbalanced <ref> tags in ${label}.`);
		}
		if (open.some((tag) => !/\bto="[^"]*"/.test(tag))) {
			errors.push(`A <ref> is missing its "to" target in ${label}.`);
		}
	}
	return [...new Set(errors)];
}
