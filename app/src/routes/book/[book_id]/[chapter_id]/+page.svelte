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
	import { t, getCorpusLang, getUiLang, getParallelReader } from '$lib/i18n';
	import Breadcrumbs from '$lib/Breadcrumbs.svelte';
	import Reader from '$lib/Reader.svelte';
	import type { ReaderBlock } from '$lib/reader';
	import { recordPage } from '$lib/trail.svelte.js';
	import { recordProgress } from '$lib/progress.svelte.js';
	import ScriptureModal from '$lib/ScriptureModal.svelte';
	import { isEditorMode } from '$lib/edits.svelte.js';
	import * as github from '$lib/github.svelte.js';

	const bookId = $derived($page.params.book_id ?? '');
	const chapterId = $derived($page.params.chapter_id ?? '');

	const corpusLang = $derived(getCorpusLang());
	const uiLang = $derived(getUiLang());

	// Parallel reader needs the width for two columns; below Tailwind's lg the
	// pref falls back to a single column (matches the picker's own lg gating).
	let isLarge = $state(false);
	$effect(() => {
		const mq = matchMedia('(min-width: 1024px)');
		isLarge = mq.matches;
		const onChange = () => (isLarge = mq.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	// Source + translation side by side. Requires a translation in the corpus
	// slot (the left column is always the original), so a stray 'la' can't split.
	const parallel = $derived(getParallelReader() && corpusLang !== 'la' && isLarge);
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

	// Editor mode only bites when a GitHub session is present.
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

	function paragraphContent(p: Paragraph): string {
		return paraTranslations.get(p.id) ?? p.content;
	}
	function asideContent(a: Aside): string {
		return asideTranslations.get(a.id) ?? a.content;
	}

	// Interleave paragraphs and asides in reading order. Each block carries its
	// published display body (translation-coalesced) plus the raw Latin for the
	// parallel column; the shared reader owns staged-edit reflection.
	const blocks = $derived.by<ReaderBlock[]>(() => {
		const items: (ReaderBlock & { position: number })[] = [];
		for (const p of paragraphs) {
			items.push({
				kind: 'paragraph',
				id: p.id,
				label: p.label,
				content: paragraphContent(p),
				contentLa: p.content,
				annotations: annotationsByParagraph.get(p.id) ?? [],
				position: p.position
			});
		}
		for (const a of asides) {
			items.push({
				kind: 'aside',
				id: a.id,
				content: asideContent(a),
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

	function prefersReducedMotion(): boolean {
		return (
			typeof matchMedia !== 'undefined' &&
			matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	}

	// Scripture reference being previewed in the modal (the ref's `to`), or null.
	// The reader emits the selected ref; the page owns the single modal instance.
	let scriptureRef = $state<string | null>(null);

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

	const searchTerms = $derived(
		($page.url.searchParams.get('q') ?? '')
			.split(/\s+/)
			.filter(Boolean)
	);
</script>

{#if book && chapter}
	<main
		id="main-content"
		tabindex="-1"
		class="{parallel ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 py-8"
	>
		<Breadcrumbs />

		<h1 class="text-2xl font-display font-bold text-foreground mb-6">{chapter.title}</h1>

		<Reader
			{blocks}
			{bookId}
			{chapterId}
			bookTitle={book.title}
			chapterTitle={chapter.title}
			{corpusLang}
			{parallel}
			{editing}
			{searchTerms}
			{topicLabel}
			candidates={topicCandidates}
			onScriptureRef={(to) => (scriptureRef = to)}
		/>

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

		<ScriptureModal bind:to={scriptureRef} />
	</main>
{:else}
	<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
		<p class="text-muted-foreground">{t('chapter.notFound')}</p>
	</main>
{/if}
