import { error } from '@sveltejs/kit';
import type { BookMeta } from '$lib/types';
import type { PageLoad } from './$types';

// Prerendered to crawlable HTML: the book's metadata + chapter table of contents
// from the manifest, no sql.js DB. The crawler reaches each `/book/<id>` via the
// links on the prerendered home page. Localized text swaps in client-side once
// the DB loads (the manifest carries the source/Latin language).
export const prerender = true;

export const load: PageLoad = async ({ params, parent }) => {
	const { manifest } = await parent();
	const book = manifest.books.find((b) => b.id === params.book_id);
	if (!book) throw error(404, 'Book not found');

	// Normalize to BookMeta's shape so the page can fall through to the localized
	// getBook() result (DB) without field-name divergence (reference_edition).
	const meta: BookMeta = {
		id: book.id,
		title: book.title,
		author: book.author,
		date: book.date,
		ref_edition: book.reference_edition,
		description_short: book.description_short,
		description: book.description,
		// Provenance/notes come from the DB rendition once it loads; the
		// prerendered (Latin source) view shows no editorial note.
		provenance: null,
		status: null,
		translation_source: null,
		source: null,
		category: book.category,
		sequence: book.sequence
	};
	return { book: meta, chapters: book.chapters };
};
