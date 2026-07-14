import type { ManifestCategory } from './types';

/** A run of consecutive books sharing a category, with the category's localized
 *  heading resolved. `id`/`title`/`description` are null for books that carry no
 *  category (they fall into a trailing headingless group). */
export interface CategoryGroup<T> {
	id: string | null;
	title: string | null;
	description: string | null;
	books: T[];
}

/**
 * Cut an already-category-ordered book list (from `getBooks` or `manifest.books`,
 * both sorted by category then in-category sequence) into per-category groups,
 * resolving each heading/subtext in the UI language (falling back to `en`, then
 * the raw key). Because the input is pre-ordered, a simple run-length pass keeps
 * groups in category order without re-sorting.
 */
export function groupByCategory<T extends { category: string | null }>(
	books: T[],
	categories: ManifestCategory[],
	uiLang: string
): CategoryGroup<T>[] {
	const meta = new Map<string, ManifestCategory>(categories.map((c) => [c.id, c]));
	const groups: CategoryGroup<T>[] = [];
	let cur: CategoryGroup<T> | null = null;
	for (const book of books) {
		const cat = book.category ?? null;
		if (!cur || cur.id !== cat) {
			const m: ManifestCategory | undefined = cat ? meta.get(cat) : undefined;
			cur = {
				id: cat,
				title: m ? (m.title[uiLang] ?? m.title.en ?? cat) : null,
				description: m ? (m.description[uiLang] ?? m.description.en ?? null) : null,
				books: []
			};
			groups.push(cur);
		}
		cur.books.push(book);
	}
	return groups;
}
