<script lang="ts">
	import { tick } from 'svelte';
	import {
		getBook,
		getChapters,
		getParagraphs,
		getAsides,
		getChapterAnnotations,
		getChapterRelations,
		getParagraphTranslations,
		getParagraphTranslationLabels,
		getAsideTranslations,
		type SearchResult,
		type Annotation
	} from '$lib';
	import type { RelationLink } from '$lib/db';
	import type { ReaderBlock } from '$lib/reader';
	import type { StudyPaneState } from '$lib/study';
	import { t } from '$lib/i18n';
	import Reader from '$lib/Reader.svelte';
	import SearchResultList from '$lib/SearchResultList.svelte';
	import Modal from '$lib/Modal.svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import SearchIcon from '@lucide/svelte/icons/search';

	// One half of the study view. Two modes: `pane == null` shows the shared
	// search results (picking a hit opens it here); otherwise the pane is an
	// inline chapter reader with its own prev/next navigation and a close (X)
	// that returns to the results. Navigation link overrides that make study
	// "study": a topic pill toggles that topic in the shared filters instead of
	// leaving the page, and a relation pill offers to open its target in the
	// *sibling* pane for comparison.
	let {
		pane,
		results,
		searching,
		query = '',
		corpusLang,
		uiLang,
		topicLabel,
		onOpen,
		onOpenSibling,
		onClose,
		onToggleTopic,
		onScriptureRef
	}: {
		pane: StudyPaneState | null;
		/** The shared result set (both panes render the same list). */
		results: SearchResult[];
		/** Whether a search is active (query or topic filters present). */
		searching: boolean;
		query?: string;
		corpusLang: string;
		uiLang: string;
		topicLabel: (type: string, value: string) => string;
		/** Replace this pane's reading target (result pick, prev/next). */
		onOpen: (p: StudyPaneState) => void;
		/** Open a passage in the other pane (confirmed relation click). */
		onOpenSibling: (p: StudyPaneState) => void;
		onClose: () => void;
		/** Toggle a `type:value` key in the shared topic filters. */
		onToggleTopic: (key: string) => void;
		onScriptureRef: (to: string) => void;
	} = $props();

	// ——— Chapter data (reader mode). Same assembly as the chapter route, minus
	// its route-only concerns (breadcrumbs, progress, parallel columns — a pane
	// is half a screen, so parallel never engages here).
	const bookId = $derived(pane?.book ?? '');
	const chapterId = $derived(pane?.chapter ?? '');
	const book = $derived(pane ? getBook(bookId, corpusLang, uiLang) : null);
	const chapters = $derived(book ? getChapters(bookId, corpusLang) : []);
	const chapter = $derived(chapters.find((c) => c.id === chapterId));

	const paragraphs = $derived(book && chapter ? getParagraphs(bookId, chapterId) : []);
	const asides = $derived(book && chapter ? getAsides(bookId, chapterId) : []);
	const allAnnotations = $derived(book && chapter ? getChapterAnnotations(bookId, chapterId) : []);
	const allRelations = $derived(
		book && chapter ? getChapterRelations(bookId, chapterId, corpusLang) : []
	);

	const relationsByParagraph = $derived.by(() => {
		const map = new Map<string, RelationLink[]>();
		for (const r of allRelations) {
			const list = map.get(r.anchor_paragraph_id) ?? [];
			list.push(r);
			map.set(r.anchor_paragraph_id, list);
		}
		return map;
	});

	const annotationsByParagraph = $derived.by(() => {
		const map = new Map<string, Annotation[]>();
		for (const a of allAnnotations) {
			const list = map.get(a.paragraph_id) ?? [];
			list.push(a);
			map.set(a.paragraph_id, list);
		}
		return map;
	});

	const paraTranslations = $derived(
		corpusLang !== 'la' && book && chapter
			? getParagraphTranslations(bookId, chapterId, corpusLang)
			: new Map<string, string>()
	);
	const asideTranslations = $derived(
		corpusLang !== 'la' && book && chapter
			? getAsideTranslations(bookId, chapterId, corpusLang)
			: new Map<string, string>()
	);
	const paraLabels = $derived(
		corpusLang !== 'la' && book && chapter
			? getParagraphTranslationLabels(bookId, chapterId, corpusLang)
			: new Map<string, string>()
	);

	const blocks = $derived.by<ReaderBlock[]>(() => {
		const items: (ReaderBlock & { position: number })[] = [];
		for (const p of paragraphs) {
			items.push({
				kind: 'paragraph',
				id: p.id,
				label: paraLabels.get(p.id) ?? p.label,
				labelFormat: p.label_format,
				layout: p.layout,
				content: paraTranslations.get(p.id) ?? p.content,
				contentLa: p.content,
				annotations: annotationsByParagraph.get(p.id) ?? [],
				position: p.position
			});
		}
		for (const a of asides) {
			items.push({
				kind: 'aside',
				id: a.id,
				content: asideTranslations.get(a.id) ?? a.content,
				contentLa: a.content,
				position: a.position
			});
		}
		items.sort((a, b) => a.position - b.position);
		return items;
	});

	const prevChapter = $derived(
		chapter ? chapters.find((c) => c.position === chapter.position - 1) : undefined
	);
	const nextChapter = $derived(
		chapter ? chapters.find((c) => c.position === chapter.position + 1) : undefined
	);

	// The pane scrolls internally (the two readers navigate independently), so
	// the target passage is centred inside this container, not the page.
	let scrollEl = $state<HTMLElement | null>(null);

	// Scroll to the opened passage — or back to the top on chapter moves. Scoped
	// to this pane's subtree: both panes may show the same chapter, so a global
	// getElementById could land on the sibling's copy of the id.
	$effect(() => {
		const target = pane?.para;
		void blocks;
		const el = scrollEl;
		if (!el) return;
		tick().then(() => {
			if (target) {
				const node = el.querySelector(`[id="${CSS.escape(target)}"]`);
				if (node) {
					node.scrollIntoView({ block: 'center' });
					return;
				}
			}
			el.scrollTop = 0;
		});
	});

	// ——— Link interception (capture phase, so it wins over the anchors the
	// reader renders). Topic pills (/topics/type/value) toggle the filter;
	// relation pills (/book/id/chapter#para) propose the sibling pane.
	let related = $state<{ target: StudyPaneState; label: string } | null>(null);
	let relatedOpen = $state(false);

	function interceptClick(e: MouseEvent) {
		const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
		if (!a) return;
		const url = new URL(a.href, location.origin);
		if (url.origin !== location.origin) return;

		const topicMatch = url.pathname.match(/^\/topics\/([^/]+)\/([^/]+)$/);
		if (topicMatch) {
			e.preventDefault();
			e.stopPropagation();
			onToggleTopic(`${decodeURIComponent(topicMatch[1])}:${decodeURIComponent(topicMatch[2])}`);
			return;
		}

		const bookMatch = url.pathname.match(/^\/book\/([^/]+)\/([^/]+)$/);
		if (bookMatch) {
			e.preventDefault();
			e.stopPropagation();
			related = {
				target: {
					book: decodeURIComponent(bookMatch[1]),
					chapter: decodeURIComponent(bookMatch[2]),
					para: url.hash ? decodeURIComponent(url.hash.slice(1)) : undefined
				},
				label: a.textContent?.trim() ?? ''
			};
			relatedOpen = true;
		}
	}

	function confirmRelated() {
		if (related) onOpenSibling(related.target);
		relatedOpen = false;
	}
</script>

<section
	class="flex min-h-0 flex-col rounded-lg border border-border"
	aria-label={pane && chapter ? chapter.title : t('search.heading')}
>
	{#if pane && book && chapter}
		<!-- Reader header: chapter title + close back to the results. -->
		<header class="flex items-start justify-between gap-2 border-b border-border px-4 py-2.5">
			<div class="min-w-0">
				<p class="truncate text-xs text-muted-foreground">{book.title}</p>
				<h2 class="truncate font-display text-base font-bold text-foreground" title={chapter.title}>
					{chapter.title}
				</h2>
			</div>
			<button
				type="button"
				onclick={onClose}
				aria-label={t('study.closeReader')}
				title={t('study.closeReader')}
				class="-mr-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			>
				<XIcon class="size-4" />
			</button>
		</header>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={scrollEl}
			class="min-h-0 flex-1 overflow-y-auto px-4 py-4"
			onclickcapture={interceptClick}
			role="presentation"
		>
			<Reader
				{blocks}
				{bookId}
				{chapterId}
				bookTitle={book.title}
				chapterTitle={chapter.title}
				{corpusLang}
				parallel={false}
				editing={false}
				searchTerms={query.split(/\s+/).filter(Boolean)}
				{topicLabel}
				{relationsByParagraph}
				{onScriptureRef}
			/>
			<nav
				aria-label={t('a11y.pagination')}
				class="mt-8 flex justify-between gap-4 border-t border-border pt-4"
			>
				{#if prevChapter}
					<button
						type="button"
						onclick={() => onOpen({ book: bookId, chapter: prevChapter.id })}
						class="min-w-0 flex-1 text-left text-sm text-muted-foreground transition-colors hover:text-primary"
					>
						&larr; {prevChapter.title}
					</button>
				{:else}
					<span></span>
				{/if}
				{#if nextChapter}
					<button
						type="button"
						onclick={() => onOpen({ book: bookId, chapter: nextChapter.id })}
						class="min-w-0 flex-1 text-right text-sm text-muted-foreground transition-colors hover:text-primary"
					>
						{nextChapter.title} &rarr;
					</button>
				{/if}
			</nav>
		</div>
	{:else if pane}
		<!-- A shared link can reference a chapter missing from this corpus build. -->
		<div class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
			<p class="text-muted-foreground">{t('chapter.notFound')}</p>
			<button
				type="button"
				onclick={onClose}
				class="text-sm text-muted-foreground underline transition-colors hover:text-primary"
			>
				{t('study.closeReader')}
			</button>
		</div>
	{:else}
		<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
			{#if searching && results.length > 0}
				<SearchResultList
					{results}
					{query}
					onPick={(r) => onOpen({ book: r.book_id, chapter: r.chapter_id, para: r.paragraph_id })}
					onPickChapter={(b, c) => onOpen({ book: b, chapter: c })}
				/>
			{:else if searching}
				<p class="mt-6 font-serif text-muted-foreground">{t('search.noResults')}</p>
			{:else}
				<!-- Idle pane: nudge toward the search bar above. -->
				<div
					class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground"
				>
					<SearchIcon class="size-6 opacity-60" aria-hidden="true" />
					<p class="max-w-xs text-sm">{t('study.pickHint')}</p>
				</div>
			{/if}
		</div>
	{/if}
</section>

<Modal bind:open={relatedOpen} title={t('study.openRelatedTitle')}>
	{#if related}
		<p class="mb-4 flex items-start gap-2 text-sm text-foreground">
			<ArrowRightLeft class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span
				>{related.label
					? t('study.openRelatedBody').replace('{passage}', related.label)
					: t('study.openRelatedBodyPlain')}</span
			>
		</p>
		<div class="flex justify-end gap-2">
			<button
				type="button"
				onclick={() => (relatedOpen = false)}
				class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
			>
				{t('edit.cancel')}
			</button>
			<button
				type="button"
				onclick={confirmRelated}
				class="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-sm text-background hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-ring"
			>
				<ArrowRightLeft class="size-4" /> {t('study.openInOther')}
			</button>
		</div>
	{/if}
</Modal>
