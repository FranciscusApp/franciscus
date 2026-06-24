<script lang="ts">
	import { page } from '$app/stores';
	import { tick } from 'svelte';
	import {
		getBook,
		getChapters,
		getParagraphs,
		getAsides,
		getChapterAnnotations,
		getParagraphTranslations,
		getAsideTranslations,
		type Paragraph,
		type Aside,
		type Annotation
	} from '$lib';
	import { t, getCorpusLang } from '$lib/i18n';

	const bookId = $derived($page.params.book_id ?? '');
	const chapterId = $derived($page.params.chapter_id ?? '');

	const book = $derived(getBook(bookId));
	const chapters = $derived(book ? getChapters(bookId) : []);
	const chapter = $derived(chapters.find((c) => c.id === chapterId));

	const paragraphs = $derived(book && chapter ? getParagraphs(bookId, chapterId) : []);
	const asides = $derived(book && chapter ? getAsides(bookId, chapterId) : []);
	const allAnnotations = $derived(
		book && chapter ? getChapterAnnotations(bookId, chapterId) : []
	);

	const corpusLang = $derived(getCorpusLang());
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

	const annotationsByParagraph = $derived.by(() => {
		const map = new Map<string, Annotation[]>();
		for (const a of allAnnotations) {
			const list = map.get(a.paragraph_id) ?? [];
			list.push(a);
			map.set(a.paragraph_id, list);
		}
		return map;
	});

	type Block =
		| { kind: 'paragraph'; data: Paragraph; annotations: Annotation[] }
		| { kind: 'aside'; data: Aside };

	const blocks = $derived.by<Block[]>(() => {
		const items: (Block & { position: number })[] = [];
		for (const p of paragraphs) {
			items.push({
				kind: 'paragraph',
				data: p,
				annotations: annotationsByParagraph.get(p.id) ?? [],
				position: p.position
			});
		}
		for (const a of asides) {
			items.push({ kind: 'aside', data: a, position: a.position });
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

	function onVerseClick(e: MouseEvent) {
		const v = (e.target as HTMLElement).closest('v[id]');
		if (!v) return;
		history.replaceState(null, '', `#${v.id}`);
	}

	$effect(() => {
		if (blocks.length === 0) return;
		const hash = location.hash.slice(1);
		if (!hash) return;
		tick().then(() => {
			document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	});

	const searchTerms = $derived(
		($page.url.searchParams.get('q') ?? '')
			.split(/\s+/)
			.filter(Boolean)
	);

	function highlightTerms(container: HTMLElement, terms: string[]) {
		if (!terms.length) return;
		const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
		for (const node of textNodes) {
			const text = node.textContent ?? '';
			if (!pattern.test(text)) continue;
			pattern.lastIndex = 0;
			const frag = document.createDocumentFragment();
			let last = 0;
			let m;
			while ((m = pattern.exec(text)) !== null) {
				if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
				const mark = document.createElement('mark');
				mark.className = 'search-highlight';
				mark.textContent = m[0];
				frag.appendChild(mark);
				last = pattern.lastIndex;
			}
			if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
			node.parentNode?.replaceChild(frag, node);
		}
	}

	$effect(() => {
		if (searchTerms.length === 0 || blocks.length === 0) return;
		tick().then(() => {
			const el = document.querySelector('.chapter-content');
			if (el) highlightTerms(el as HTMLElement, searchTerms);
		});
	});

	function paragraphContent(p: Paragraph): string {
		return paraTranslations.get(p.id) ?? p.content;
	}

	function asideContent(a: Aside): string {
		return asideTranslations.get(a.id) ?? a.content;
	}
</script>

{#if book && chapter}
	<main class="max-w-3xl mx-auto px-4 py-8">
		<nav class="text-sm text-stone-400 dark:text-stone-500 mb-6">
			<a href="/" class="hover:text-stone-600 dark:hover:text-stone-300">{t('nav.sources')}</a>
			<span> / </span>
			<a href="/book/{bookId}" class="hover:text-stone-600 dark:hover:text-stone-300">{book.title}</a>
			<span> / </span>
			<span class="text-stone-600 dark:text-stone-300">{chapter.title}</span>
		</nav>

		<h2 class="text-2xl font-serif font-bold text-stone-800 dark:text-stone-100 mb-6">{chapter.title}</h2>

		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="chapter-content space-y-4" onclick={onVerseClick}>
			{#each blocks as block}
				{#if block.kind === 'paragraph'}
					{@const p = block.data}
					{@const ann = block.annotations}
					<div class="paragraph group" id={p.id}>
						<span class="inline-block min-w-8 text-xs text-stone-400 dark:text-stone-500 font-mono mr-2 align-top pt-1">
							{p.label ?? p.id}
						</span>
						<span class="para-text font-serif text-stone-800 dark:text-stone-200 leading-relaxed">
							{@html paragraphContent(p)}
						</span>
						{#if ann.length > 0}
							<div class="mt-1 ml-10 flex flex-wrap gap-1">
								{#each ann as a}
									<a
										href="/attributes/{a.attr_type}/{a.attr_value}"
										class="inline-block text-xs px-2 py-0.5 rounded-full no-underline transition-colors
											{a.attr_type === 'virtue' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800' : ''}
											{a.attr_type === 'topic' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800' : ''}
											{a.attr_type === 'event' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800' : ''}
											{a.attr_type === 'place' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800' : ''}
											{a.attr_type === 'person' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-800' : ''}"
										title={a.evidence ?? ''}
									>
										{a.attr_value} ({a.attr_type}{a.verified ? ' ✓' : ''})
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<aside class="text-sm italic text-stone-400 dark:text-stone-500 font-serif py-2">
						{asideContent(block.data)}
					</aside>
				{/if}
			{/each}
		</div>

		<nav class="flex justify-between mt-12 pt-6 border-t border-stone-200 dark:border-stone-700">
			{#if prevChapter}
				<a
					href="/book/{bookId}/{prevChapter.id}"
					class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors w-1/2 block text-left"
				>
					&larr; {prevChapter.title}
				</a>
			{:else}
				<span></span>
			{/if}
			{#if nextChapter}
				<a
					href="/book/{bookId}/{nextChapter.id}"
					class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors w-1/2 block text-right"
				>
					{nextChapter.title} &rarr;
				</a>
			{/if}
		</nav>
	</main>
{:else}
	<main class="max-w-3xl mx-auto px-4 py-8">
		<p class="text-stone-500 dark:text-stone-400">{t('chapter.notFound')}</p>
	</main>
{/if}
