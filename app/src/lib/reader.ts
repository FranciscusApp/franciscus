import type { Annotation, TopicOccurrence } from '$lib';

/**
 * The unit the shared reader renders. `content` is the display body in the
 * active corpus language; `contentLa` is the raw Latin source, used only by the
 * parallel original column. A `gap` block is a rendering-only `[…]` separator
 * (topic pages list non-contiguous passages); the chapter reader never emits it.
 */
export type ReaderBlock =
	| {
			kind: 'paragraph';
			id: string;
			label: string | null;
			/** `'heading'` promotes `label` to a section heading above the text. */
			labelFormat?: string | null;
			/** `'verse'`/`'psalm'` preserve the body's line structure (see
			 *  spec/books.md); absent/`'prose'` reflows as running text. */
			layout?: string | null;
			content: string;
			contentLa: string;
			annotations: Annotation[];
			/** Curated editorial note shown under the passage (topic occurrences). */
			comment?: string | null;
	  }
	| { kind: 'aside'; id: string; content: string; contentLa: string }
	| { kind: 'gap' };

/**
 * Map topic occurrences (paragraph-only rows, already coalesced to the corpus
 * language) into reader blocks, inserting a `gap` marker wherever consecutive
 * passages are non-adjacent. Rows must be ordered by paragraph position, as
 * `getTopicOccurrences` returns them.
 */
export function occurrencesToBlocks(occurrences: TopicOccurrence[]): ReaderBlock[] {
	const blocks: ReaderBlock[] = [];
	occurrences.forEach((occ, i) => {
		const prev = occurrences[i - 1];
		if (prev && occ.position !== prev.position + 1) blocks.push({ kind: 'gap' });
		blocks.push({
			kind: 'paragraph',
			id: occ.paragraph_id,
			label: occ.paragraph_label,
			content: occ.content,
			contentLa: occ.content_la,
			annotations: [],
			comment: occ.comment
		});
	});
	return blocks;
}
