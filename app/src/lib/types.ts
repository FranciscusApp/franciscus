export interface BookMeta {
	id: string;
	title: string;
	author: string;
	date: string | null;
	ref_edition: string | null;
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
}

export interface ManifestCorpus {
	data_commit: string;
	data_commit_date: string;
	built_at: string;
	book_count: number;
	/** Corpus translation languages (Latin source is implicit, not listed). */
	languages: string[];
}

export interface ManifestBook {
	id: string;
	title: string;
	author: string;
	date: string | null;
	translations: string[];
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
