export interface BookMeta {
	id: string;
	title: string;
	author: string;
	date: string | null;
	ref_edition: string | null;
	license: string;
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
	by_type: string;
	verified: boolean;
	comment: string | null;
}

export interface TopicPage {
	topic_type: string;
	topic_value: string;
	description: string;
	content: string;
	/** Localized URL slug for the active corpus lang, when one exists. */
	lang_slug?: string | null;
}

export interface Relation {
	id: number;
	source_book_id: string;
	source_paragraph_id: string;
	target_book_id: string;
	target_paragraph_id: string;
	relation_type: string;
	by_whom: string;
	by_type: string;
	verified: boolean;
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

export interface SearchResult {
	book_id: string;
	book_title: string;
	chapter_id: string;
	chapter_title: string;
	paragraph_id: string;
	paragraph_label: string | null;
	lang: string;
	snippet: string;
	rank: number;
}
