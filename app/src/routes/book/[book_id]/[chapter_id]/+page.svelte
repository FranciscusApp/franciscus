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
		getTopicDescriptions,
		type Paragraph,
		type Aside,
		type Annotation
	} from '$lib';
	import { t, getCorpusLang, getUiLang } from '$lib/i18n';
	import Breadcrumbs from '$lib/Breadcrumbs.svelte';
	import { recordPage } from '$lib/trail.svelte.js';
	import { recordProgress } from '$lib/progress.svelte.js';
	import { isBookmarked, toggleBookmark } from '$lib/bookmarks.svelte.js';
	import BookmarkIcon from '@lucide/svelte/icons/bookmark';
	import AnnotationPills from '$lib/AnnotationPills.svelte';
	import { isEditorMode } from '$lib/edits.svelte.js';
	import * as github from '$lib/github.svelte.js';

	const bookId = $derived($page.params.book_id ?? '');
	const chapterId = $derived($page.params.chapter_id ?? '');

	const corpusLang = $derived(getCorpusLang());
	const uiLang = $derived(getUiLang());
	const book = $derived(getBook(bookId, corpusLang, uiLang));
	const chapters = $derived(book ? getChapters(bookId, corpusLang) : []);
	const chapter = $derived(chapters.find((c) => c.id === chapterId));

	$effect(() => {
		if (!book || !chapter) return;
		recordPage([
			{ id: `/book/${bookId}`, label: book.title, href: `/book/${bookId}` },
			{
				id: `/book/${bookId}/${chapterId}`,
				label: chapter.title,
				href: `/book/${bookId}/${chapterId}`,
				parentId: `/book/${bookId}`
			}
		]);
	});

	// Advance reading progress only when this chapter is the next step forward
	// from the saved point (see progress.svelte.ts); consulting a late chapter
	// via search or a topic page is non-contiguous and leaves it untouched.
	$effect(() => {
		if (!book || !chapter || chapters.length === 0) return;
		recordProgress(bookId, chapters[0].position, {
			position: chapter.position,
			href: `/book/${bookId}/${chapterId}`,
			label: chapter.title
		});
	});

	// Per-topic label (UI-lang topic-page description, falling back to the base
	// description). Topics with no page fall back to the value-as-words.
	const topicDescriptions = $derived(getTopicDescriptions(uiLang));

	function topicLabel(topicType: string, topicValue: string): string {
		return (
			topicDescriptions.get(`${topicType}:${topicValue}`) ?? topicValue.replaceAll('_', ' ')
		);
	}

	// Editor mode only bites when a GitHub session is present (Phase 2 chrome).
	const editing = $derived(isEditorMode() && github.isConnected());

	// Add-picker candidate set: every topic in the corpus (same source as the
	// /topics hub — the manifest), labeled in the UI language.
	const topicCandidates = $derived(
		($page.data.manifest?.topics ?? []).map((tp: { type: string; value: string; description: string; descriptions: Record<string, string> }) => ({
			type: tp.type,
			value: tp.value,
			label: tp.descriptions?.[uiLang] ?? tp.description
		}))
	);

	const paragraphs = $derived(book && chapter ? getParagraphs(bookId, chapterId) : []);
	const asides = $derived(book && chapter ? getAsides(bookId, chapterId) : []);
	const allAnnotations = $derived(
		book && chapter ? getChapterAnnotations(bookId, chapterId) : []
	);

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

		// Scripture-ref tooltip: one shared element, positioned on show and clamped
		// to the viewport so it never overflows (and so the page can't scroll
		// horizontally on mobile). Shown on hover and keyboard/touch focus.
		const tooltip = document.createElement('div');
		tooltip.className = 'ref-tooltip';
		tooltip.setAttribute('role', 'tooltip');
		document.body.appendChild(tooltip);
		let activeRef: HTMLElement | null = null;

		function showTooltip(ref: HTMLElement) {
			const to = ref.getAttribute('to');
			if (!to) return;
			activeRef = ref;
			tooltip.textContent = to;
			tooltip.setAttribute('data-show', '');
			const margin = 8;
			const r = ref.getBoundingClientRect();
			const tip = tooltip.getBoundingClientRect();
			const left = Math.min(Math.max(margin, r.left), window.innerWidth - tip.width - margin);
			let top = r.top - tip.height - 6;
			if (top < margin) top = r.bottom + 6; // flip below when no room above
			tooltip.style.left = `${Math.max(margin, left)}px`;
			tooltip.style.top = `${top}px`;
		}
		function hideTooltip(ref: HTMLElement | null = null) {
			if (ref && ref !== activeRef) return;
			activeRef = null;
			tooltip.removeAttribute('data-show');
		}
		function onRefIn(e: Event) {
			const ref = (e.target as HTMLElement).closest('ref') as HTMLElement | null;
			if (ref) showTooltip(ref);
		}
		function onRefOut(e: Event) {
			const ref = (e.target as HTMLElement).closest('ref') as HTMLElement | null;
			if (ref) hideTooltip(ref);
		}

		container.addEventListener('pointerover', onRefIn);
		container.addEventListener('pointerout', onRefOut);
		container.addEventListener('focusin', onRefIn);
		container.addEventListener('focusout', onRefOut);
		// A fixed tooltip detaches from its ref on scroll/resize — just dismiss it.
		const dismiss = () => hideTooltip();
		window.addEventListener('scroll', dismiss, { passive: true });
		window.addEventListener('resize', dismiss);

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
			container.removeEventListener('pointerover', onRefIn);
			container.removeEventListener('pointerout', onRefOut);
			container.removeEventListener('focusin', onRefIn);
			container.removeEventListener('focusout', onRefOut);
			window.removeEventListener('scroll', dismiss);
			window.removeEventListener('resize', dismiss);
			tooltip.remove();
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

	function paraHref(p: Paragraph): string {
		return `/book/${bookId}/${chapterId}#${p.id}`;
	}
	function paraLabel(p: Paragraph): string {
		return `${chapter?.title ?? ''} — ${p.label ?? p.id}`;
	}
</script>

{#if book && chapter}
	<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
		<Breadcrumbs />

		<h1 class="text-2xl font-display font-bold text-foreground mb-6">{chapter.title}</h1>

		<div class="chapter-content space-y-4" lang={corpusLang}>
			{#each blocks as block}
				{#if block.kind === 'paragraph'}
					{@const p = block.data}
					{@const ann = block.annotations}
					<div class="paragraph group" id={p.id}>
						<button
							type="button"
							onclick={() => toggleBookmark(paraHref(p), paraLabel(p))}
							aria-pressed={isBookmarked(paraHref(p))}
							aria-label={isBookmarked(paraHref(p)) ? t('a11y.removeBookmark') : t('a11y.addBookmark')}
							class="float-right ml-2 p-1 pointer-coarse:p-2 rounded text-muted-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring opacity-40 group-hover:opacity-100 focus:opacity-100 aria-pressed:opacity-100 aria-pressed:text-primary transition"
						>
							<BookmarkIcon class="w-4 h-4" fill={isBookmarked(paraHref(p)) ? 'currentColor' : 'none'} />
						</button>
						<span class="inline-block min-w-8 text-xs text-muted-foreground font-mono mr-2 align-top pt-1">
							{p.label ?? p.id}
						</span>
						<span class="para-text font-serif text-foreground leading-relaxed">
							{@html paragraphContent(p)}
						</span>
						<AnnotationPills
							{bookId}
							paragraphId={p.id}
							annotations={ann}
							{topicLabel}
							candidates={topicCandidates}
							{editing}
						/>
					</div>
				{:else}
					<aside class="text-sm italic text-muted-foreground font-serif py-2">
						{asideContent(block.data)}
					</aside>
				{/if}
			{/each}
		</div>

		<nav aria-label={t('a11y.pagination')} class="flex justify-between gap-4 mt-12 pt-6 border-t border-border">
			{#if prevChapter}
				<a
					href="/book/{bookId}/{prevChapter.id}"
					class="text-muted-foreground hover:text-primary transition-colors flex-1 min-w-0 text-left"
				>
					&larr; {prevChapter.title}
				</a>
			{:else}
				<span></span>
			{/if}
			{#if nextChapter}
				<a
					href="/book/{bookId}/{nextChapter.id}"
					class="text-muted-foreground hover:text-primary transition-colors flex-1 min-w-0 text-right"
				>
					{nextChapter.title} &rarr;
				</a>
			{/if}
		</nav>
	</main>
{:else}
	<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
		<p class="text-muted-foreground">{t('chapter.notFound')}</p>
	</main>
{/if}
