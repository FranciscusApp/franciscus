<script lang="ts">
	import { page } from '$app/stores';
	import { tick } from 'svelte';
	import {
		getBook,
		getChapters,
		getParagraphs,
		getAsides,
		getChapterAnnotations,
		type Paragraph,
		type Aside,
		type Annotation
	} from '$lib';

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
</script>

{#if book && chapter}
	<main class="max-w-3xl mx-auto px-4 py-8">
		<nav class="text-sm text-stone-400 dark:text-stone-500 mb-6">
			<a href="/" class="hover:text-stone-600 dark:hover:text-stone-300">Fontes</a>
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
							{@html p.content}
						</span>
						{#if ann.length > 0}
							<div class="mt-1 ml-10 flex flex-wrap gap-1">
								{#each ann as a}
									<span
										class="inline-block text-xs px-2 py-0.5 rounded-full
											{a.attr_type === 'virtue' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : ''}
											{a.attr_type === 'topic' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : ''}
											{a.attr_type === 'event' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : ''}
											{a.attr_type === 'place' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : ''}
											{a.attr_type === 'person' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300' : ''}"
										title={a.evidence ?? ''}
									>
										{a.attr_value} ({a.attr_type}{a.verified ? ' ✓' : ''})
									</span>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<aside class="text-sm italic text-stone-400 dark:text-stone-500 font-serif py-2">
						{block.data.content}
					</aside>
				{/if}
			{/each}
		</div>

		<nav class="flex justify-between mt-12 pt-6 border-t border-stone-200 dark:border-stone-700">
			{#if prevChapter}
				<a
					href="/book/{bookId}/{prevChapter.id}"
					class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
				>
					&larr; {prevChapter.title}
				</a>
			{:else}
				<span></span>
			{/if}
			{#if nextChapter}
				<a
					href="/book/{bookId}/{nextChapter.id}"
					class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
				>
					{nextChapter.title} &rarr;
				</a>
			{/if}
		</nav>
	</main>
{:else}
	<main class="max-w-3xl mx-auto px-4 py-8">
		<p class="text-stone-500 dark:text-stone-400">Capitolo non trovato.</p>
	</main>
{/if}
