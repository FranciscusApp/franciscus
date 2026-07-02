import type { Edit } from './edits.svelte';

/**
 * Phase 3 reverse mapping: turn staged annotation edits (DB-addressed) back into
 * a source `<id>.yaml` text diff, targeting the Phase 2C grouped format
 * (see ../../franciscus-data/spec/annotations.md).
 *
 * Pure text surgery, deliberately NOT a YAML round-trip: parsing and re-dumping
 * the whole file with a library would reorder keys / re-quote everything and
 * blow up the diff. Here we touch only the edited paragraph's block, so every
 * untouched line stays byte-identical and the PR diff is minimal.
 *
 * The 2C format is regular enough to make this safe: 2-space indent, block
 * sequences at the paragraph key's indent, map-item continuations at +2.
 *
 * ponytail: assumes the machine-generated 2C shape (2-space indent, `annotations`
 * as the last top-level section). Hand-mangled sidecars with odd indent/comments
 * inside a paragraph block are out of scope — the parser stops the block at the
 * first line that isn't an item or its continuation.
 */

const RELATION_TYPES = new Set(['same_episode', 'related_to']);

/** A single annotation item in a paragraph's list (topic or relation). */
interface Item {
	relation: boolean;
	pair: string; // `type:value` or `reltype:target`
	by?: string;
	to?: string;
	comment?: string;
}

const isRelation = (type: string) => RELATION_TYPES.has(type);
const pairOf = (type: string, value: string) => `${type}:${value}`;

function unquote(s: string): string {
	const t = s.trim();
	if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
		return t.slice(1, -1);
	}
	return t;
}

/** Quote a paragraph key the way serde/js-yaml would: bare if a plain token. */
function emitKey(key: string): string {
	return /^[A-Za-z][A-Za-z0-9_-]*$/.test(key) ? key : `'${key.replace(/'/g, "''")}'`;
}

/** Comment text is free-form; JSON encodes to a always-valid YAML double-quoted
 * scalar. `by`/`to`/pairs are constrained tokens and stay bare. */
function emitComment(s: string): string {
	return JSON.stringify(s);
}

/** Read a `comment:` value. We emit JSON-encoded, but a human-authored sidecar
 * may carry a bare/single-quoted plain scalar — tolerate both. */
function parseComment(raw: string): string {
	const t = raw.trim();
	if (t.startsWith('"')) {
		try {
			return JSON.parse(t);
		} catch {
			/* fall through to plain */
		}
	}
	return unquote(t);
}

function emitItem(it: Item): string[] {
	const kind = it.relation ? 'relation' : 'topic';
	if (it.by === undefined && it.to === undefined && it.comment === undefined) {
		return [`  - ${it.pair}`];
	}
	const lines = [`  - ${kind}: ${it.pair}`];
	if (it.by !== undefined) lines.push(`    by: ${it.by}`);
	if (it.to !== undefined) lines.push(`    to: ${it.to}`);
	if (it.comment !== undefined) lines.push(`    comment: ${emitComment(it.comment)}`);
	return lines;
}

/** Parse the item lines of one paragraph block into structured items. `lines` is
 * the maximal run of `  - …` items + `    …` continuations after the key line. */
function parseItems(lines: string[]): Item[] {
	const items: Item[] = [];
	let cur: Item | null = null;
	for (const line of lines) {
		const item = /^ {2}- (.*)$/.exec(line);
		if (item) {
			const rest = item[1];
			const map = /^(topic|relation):\s*(.+)$/.exec(rest);
			if (map) {
				cur = { relation: map[1] === 'relation', pair: unquote(map[2]) };
			} else {
				const pair = unquote(rest);
				cur = { relation: isRelation(pair.split(':', 1)[0]), pair };
			}
			items.push(cur);
			continue;
		}
		const cont = /^ {4}(by|to|comment):\s*(.*)$/.exec(line);
		if (cont && cur) {
			const [, field, raw] = cont;
			if (field === 'comment') cur.comment = parseComment(raw);
			else if (field === 'by') cur.by = unquote(raw);
			else cur.to = unquote(raw);
		}
	}
	return items;
}

/** Span of a paragraph's item lines: [start, end) over `lines`, given the key
 * line index. Items and their continuations only; stops at anything else. */
function itemSpan(lines: string[], keyIdx: number): [number, number] {
	let i = keyIdx + 1;
	while (i < lines.length && (/^ {2}- /.test(lines[i]) || /^ {4}\S/.test(lines[i]))) i++;
	return [keyIdx + 1, i];
}

/** Find the `annotations:` section start, or -1. */
function annotationsIdx(lines: string[]): number {
	return lines.findIndex((l) => /^annotations:\s*$/.test(l));
}

/** Find a paragraph key line index within the annotations section, or -1. */
function paragraphIdx(lines: string[], annIdx: number, key: string): number {
	for (let i = annIdx + 1; i < lines.length; i++) {
		const l = lines[i];
		if (/^\S/.test(l)) break; // dedented out of the annotations section
		const m = /^ {2}(.+?):\s*$/.exec(l);
		if (m && unquote(m[1]) === key) return i;
	}
	return -1;
}

/** Apply one paragraph's edits to its parsed items, in place. */
function applyToItems(items: Item[], edits: Edit[], author: string) {
	const findItem = (pair: string) => items.find((it) => it.pair === pair);
	for (const e of edits) {
		const pair = pairOf(e.topic_type, e.topic_value);
		if (e.op === 'add') {
			if (!findItem(pair)) items.push({ relation: isRelation(e.topic_type), pair });
		} else if (e.op === 'remove') {
			const i = items.findIndex((it) => it.pair === pair);
			if (i >= 0) items.splice(i, 1);
		} else if (e.op === 'verify') {
			const it = findItem(pair);
			if (it) it.by = author;
		} else if (e.op === 'comment') {
			const it = findItem(pair);
			if (it) it.comment = e.comment && e.comment.trim() ? e.comment.trim() : undefined;
		}
	}
}

/**
 * Rewrite one book's sidecar YAML text with its staged edits, producing new text
 * (the caller diffs it). `edits` may include other books' entries — they're
 * filtered by `bookId`. `author` is the connected contributor's handle, written
 * as `by:` on verified items.
 */
export function applyAnnotationEdits(
	yamlText: string,
	bookId: string,
	edits: Edit[],
	author: string
): string {
	const mine = edits.filter((e) => e.book_id === bookId);
	if (mine.length === 0) return yamlText;

	const eol = yamlText.includes('\r\n') ? '\r\n' : '\n';
	const trailingEol = yamlText.endsWith(eol);
	let lines = yamlText.split(/\r?\n/);
	if (trailingEol) lines.pop(); // drop the empty tail from the final newline

	// group edits by paragraph
	const byPara = new Map<string, Edit[]>();
	for (const e of mine) {
		const arr = byPara.get(e.paragraph_id) ?? [];
		arr.push(e);
		byPara.set(e.paragraph_id, arr);
	}

	let annIdx = annotationsIdx(lines);
	if (annIdx === -1) {
		if (lines.length && lines[lines.length - 1] !== '') lines.push('');
		lines.push('annotations:');
		annIdx = lines.length - 1;
	}

	for (const [para, paraEdits] of byPara) {
		let keyIdx = paragraphIdx(lines, annIdx, para);
		if (keyIdx === -1) {
			// new paragraph key: append at the end of the annotations section.
			// ponytail: annotations is the last top-level section in the 2C format,
			// so EOF append is correct; revisit if a later section is added after it.
			lines.push(`  ${emitKey(para)}:`);
			keyIdx = lines.length - 1;
		}
		const [start, end] = itemSpan(lines, keyIdx);
		const items = parseItems(lines.slice(start, end));
		applyToItems(items, paraEdits, author);

		if (items.length === 0) {
			// paragraph emptied out — drop the key and its (now-empty) block
			lines.splice(keyIdx, end - keyIdx);
			annIdx = annotationsIdx(lines);
			continue;
		}
		const rebuilt = items.flatMap(emitItem);
		lines.splice(start, end - start, ...rebuilt);
		annIdx = annotationsIdx(lines);
	}

	return lines.join(eol) + (trailingEol ? eol : '');
}

// --- validation (Phase 3 closed-vocabulary check) --------------------------

/** Parse `topics/topics.yaml` (a flat `type:` → `- value` map) into the closed
 * set of valid `type:value` topic pairs. Tiny hand parser — no YAML dep, and the
 * file shape is fixed. Feed the result to {@link validateAdds}. */
export function parseTopicsVocab(topicsYaml: string): Set<string> {
	const pairs = new Set<string>();
	let type: string | null = null;
	for (const raw of topicsYaml.split(/\r?\n/)) {
		if (/^\s*#/.test(raw) || raw.trim() === '') continue;
		const typeM = /^([A-Za-z][A-Za-z0-9_]*):\s*$/.exec(raw);
		if (typeM) {
			type = typeM[1];
			continue;
		}
		const valM = /^\s*-\s*(\S+)\s*$/.exec(raw);
		if (valM && type) pairs.add(`${type}:${valM[1]}`);
	}
	return pairs;
}

/**
 * Reject staged `add` edits whose topic value is outside the closed vocabulary,
 * mirroring the Rust ingest rule (relations aren't vocab-checked — only their
 * reltype must be known). Returns human-readable error strings (empty = ok).
 */
export function validateAdds(edits: Edit[], vocab: Set<string>): string[] {
	const errors: string[] = [];
	for (const e of edits) {
		if (e.op !== 'add') continue;
		const pair = pairOf(e.topic_type, e.topic_value);
		if (isRelation(e.topic_type)) {
			// reltype is closed but target is a free paragraph key — nothing to check
			continue;
		}
		if (!vocab.has(pair)) errors.push(`Unknown topic "${pair}" (not in topics.yaml)`);
	}
	return errors;
}
