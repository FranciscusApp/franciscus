export interface BookMeta {
	id: string;
	title: string;
	author: string;
	date: string | null;
	ref_edition: string | null;
	/** One-line description (in the UI language); shown on the home book list.
	 *  Sourced from the per-book sidecar's cover properties. */
	description_short: string | null;
	/** Long description (in the UI language), authored as Markdown and stored as
	 *  rendered HTML — inject with {@html}, do not text-render. */
	description: string | null;
	/** Provenance of the rendition being read (corpus language), used to
	 *  auto-generate the book page's editorial note in the UI language. Null on
	 *  the Latin source rendition, which has no translation provenance. */
	provenance: string | null;
	status: string | null;
	translation_source: string | null;
	/** Where the source-language (Latin) text was obtained; the source
	 *  rendition's counterpart to translation_source. Book-level. */
	source: string | null;
	/** Machine key of the browsing collection this book belongs to (null when
	 *  uncategorized); see `categories.yaml`. */
	category: string | null;
	/** Ordinal within the category (ascending); null sorts last. */
	sequence: number | null;
}

export interface Chapter {
	id: string;
	book_id: string;
	position: number;
	title: string;
}

export interface Paragraph {
	id: string;
	book_id: string;
	chapter_id: string;
	position: number;
	content: string;
	label: string | null;
	/** `'heading'` renders the label as a section heading; `null`/`'normal'` is
	 * the inline paragraph marker. See spec/books.md. */
	label_format: string | null;
}

export interface Aside {
	id: string;
	book_id: string;
	chapter_id: string;
	position: number;
	content: string;
}

export interface Annotation {
	id: number;
	book_id: string;
	paragraph_id: string;
	paragraph_to_id: string | null;
	topic_type: string;
	topic_value: string;
	by_whom: string;
	provenance: string;
	comment: string | null;
}

export interface TopicPage {
	topic_type: string;
	topic_value: string;
	description: string;
	content: string;
}

export interface Relation {
	id: number;
	source_book_id: string;
	source_paragraph_id: string;
	target_book_id: string;
	target_paragraph_id: string;
	relation_type: string;
	by_whom: string;
	provenance: string;
	comment: string | null;
}

export interface ParagraphTranslation {
	book_id: string;
	paragraph_id: string;
	lang: string;
	content: string;
	/** Localized heading text, when the source `<p>` uses `label_format`. */
	label: string | null;
}

export interface AsideTranslation {
	book_id: string;
	aside_id: string;
	lang: string;
	content: string;
}

/** Build-time projection of the DB the hub pages render from, fetched via a
 *  SvelteKit `load()` so it works in both Node (prerender) and the browser.
 *  Emitted by the Rust CLI to `static/db-manifest.json`; mirror of
 *  `server/src/models.rs` `Manifest` — keep the two in sync manually. */
export interface Manifest {
	schema: number;
	corpus: ManifestCorpus;
	books: ManifestBook[];
	topics: ManifestTopic[];
	/** Browsing collections, in display order; the hub pages group `books`
	 *  (already ordered to match) under these headings. */
	categories: ManifestCategory[];
}

export interface ManifestCategory {
	id: string;
	sequence: number;
	/** Group heading per UI language (`en` is the fallback). */
	title: Record<string, string>;
	/** Optional subtext per UI language. */
	description: Record<string, string>;
}

export interface ManifestCorpus {
	data_commit: string;
	data_commit_date: string;
	built_at: string;
	book_count: number;
	/** Uncompressed size of `franciscus.db` in bytes; the download total for a
	 *  determinate progress bar. Matches the decompressed byte stream even when
	 *  the transfer is gzip/chunked and sends no usable Content-Length. */
	db_bytes: number;
	/** Corpus translation languages (Latin source is implicit, not listed). */
	languages: string[];
}

export interface ManifestBook {
	id: string;
	title: string;
	author: string;
	date: string | null;
	reference_edition: string | null;
	/** Default-UI-language (English) cover description for prerender; the actual
	 *  UI-language variant swaps in from the DB once it loads. */
	description_short: string | null;
	description: string | null;
	/** Browsing collection this book belongs to (null when uncategorized);
	 *  matches an entry in `Manifest.categories`. */
	category: string | null;
	/** Ordinal within the category (ascending); null sorts last. */
	sequence: number | null;
	/** Source-language chapter list (reading order), for the prerendered TOC. */
	chapters: ManifestChapter[];
	translations: string[];
}

export interface ManifestChapter {
	id: string;
	title: string;
}

export interface ManifestTopic {
	type: string;
	value: string;
	count: number;
	/** Source-language label (base topic-page description). */
	description: string;
	/** Localized label per UI language, when a translation exists. */
	descriptions: Record<string, string>;
}

export interface SearchResult {
	book_id: string;
	book_title: string;
	chapter_id: string;
	chapter_title: string;
	paragraph_id: string;
	paragraph_label: string | null;
	position: number;
	lang: string;
	snippet: string;
	rank: number;
}
