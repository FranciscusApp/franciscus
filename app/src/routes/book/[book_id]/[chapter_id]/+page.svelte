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
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { attrColors } from '$lib/attrColors';

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

	function prefersReducedMotion(): boolean {
		return (
			typeof matchMedia !== 'undefined' &&
			matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	}

	function selectVerse(v: Element) {
		history.replaceState(null, '', `#${v.id}`);
	}

	$effect(() => {
		if (blocks.length === 0) return;
		const hash = location.hash.slice(1);
		if (!hash) return;
		tick().then(() => {
			document.getElementById(hash)?.scrollIntoView({
				behavior: prefersReducedMotion() ? 'auto' : 'smooth',
				block: 'center'
			});
		});
	});

	// Make verses (deep-link targets) and scripture refs (tooltips) reachable by
	// keyboard and touch. The content is injected via {@html}, so we enhance the
	// rendered nodes after each render rather than authoring the markup directly.
	$effect(() => {
		// re-run when the rendered content changes
		void blocks;
		void corpusLang;
		const container = document.querySelector('.chapter-content') as HTMLElement | null;
		if (!container) return;

		tick().then(() => {
			for (const v of container.querySelectorAll('v[id]')) {
				v.setAttribute('tabindex', '0');
				v.setAttribute('role', 'button');
			}
			for (const ref of container.querySelectorAll('ref')) {
				ref.setAttribute('tabindex', '0');
				const to = ref.getAttribute('to');
				if (to && !ref.getAttribute('aria-label')) ref.setAttribute('aria-label', to);
			}
		});

		function onClick(e: MouseEvent) {
			const v = (e.target as HTMLElement).closest('v[id]');
			if (v) selectVerse(v);
		}
		function onKeydown(e: KeyboardEvent) {
			const target = e.target as HTMLElement;
			if (e.key === 'Escape' && target.tagName === 'REF') {
				target.blur();
				return;
			}
			if (e.key !== 'Enter' && e.key !== ' ') return;
			const v = target.closest('v[id]');
			if (v) {
				e.preventDefault();
				selectVerse(v);
			}
		}

		container.addEventListener('click', onClick);
		container.addEventListener('keydown', onKeydown);
		return () => {
			container.removeEventListener('click', onClick);
			container.removeEventListener('keydown', onKeydown);
		};
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
	<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
		<Breadcrumb.Root class="mb-6">
			<Breadcrumb.List class="text-sm text-stone-500 dark:text-stone-400">
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/" class="hover:text-stone-600 dark:hover:text-stone-300">{t('nav.sources')}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator>/</Breadcrumb.Separator>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/book/{bookId}" class="hover:text-stone-600 dark:hover:text-stone-300">{book.title}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator>/</Breadcrumb.Separator>
				<Breadcrumb.Item>
					<Breadcrumb.Page class="text-stone-600 dark:text-stone-300">{chapter.title}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>

		<h1 class="text-2xl font-serif font-bold text-stone-800 dark:text-stone-100 mb-6">{chapter.title}</h1>

		<div class="chapter-content space-y-4" lang={corpusLang}>
			{#each blocks as block}
				{#if block.kind === 'paragraph'}
					{@const p = block.data}
					{@const ann = block.annotations}
					<div class="paragraph group" id={p.id}>
						<span class="inline-block min-w-8 text-xs text-stone-500 dark:text-stone-400 font-mono mr-2 align-top pt-1">
							{p.label ?? p.id}
						</span>
						<span class="para-text font-serif text-stone-800 dark:text-stone-200 leading-relaxed">
							{@html paragraphContent(p)}
						</span>
						{#if ann.length > 0}
							<div class="mt-1 ml-0 sm:ml-10 flex flex-wrap gap-1">
								{#each ann as a}
									<a
										href="/attributes/{a.attr_type}/{a.attr_value}"
										class="inline-block max-w-full break-words text-xs px-2 py-0.5 rounded-full no-underline transition-colors {attrColors(a.attr_type, true)}"
										title={a.evidence ?? ''}
									>
										{a.attr_value} ({a.attr_type}{a.verified ? ' ✓' : ''})
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<aside class="text-sm italic text-stone-500 dark:text-stone-400 font-serif py-2">
						{asideContent(block.data)}
					</aside>
				{/if}
			{/each}
		</div>

		<nav aria-label={t('a11y.pagination')} class="flex justify-between gap-4 mt-12 pt-6 border-t border-stone-200 dark:border-stone-700">
			{#if prevChapter}
				<a
					href="/book/{bookId}/{prevChapter.id}"
					class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors flex-1 min-w-0 text-left"
				>
					&larr; {prevChapter.title}
				</a>
			{:else}
				<span></span>
			{/if}
			{#if nextChapter}
				<a
					href="/book/{bookId}/{nextChapter.id}"
					class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors flex-1 min-w-0 text-right"
				>
					{nextChapter.title} &rarr;
				</a>
			{/if}
		</nav>
	</main>
{:else}
	<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
		<p class="text-stone-500 dark:text-stone-400">{t('chapter.notFound')}</p>
	</main>
{/if}
