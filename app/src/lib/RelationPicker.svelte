<script lang="ts">
	import { tick } from 'svelte';
	import {
		getChapters,
		getParagraphs,
		getParagraphTranslations,
		searchParagraphs
	} from '$lib';
	import type { SearchResult } from '$lib/types';
	import { t, getCorpusLang } from '$lib/i18n';
	import * as edits from '$lib/edits.svelte.js';
	import Modal from '$lib/Modal.svelte';
	import Reader from '$lib/Reader.svelte';
	import SearchResultList from '$lib/SearchResultList.svelte';
	import TopicFilterInput from '$lib/TopicFilterInput.svelte';
	import type { ReaderBlock } from '$lib/reader';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import SearchIcon from '@lucide/svelte/icons/search';

	// Target picker for a passage relation: a sequential walk (book → chapter →
	// passage) where the final step renders the chapter through the shared
	// Reader in selection mode, so the editor sees the actual text being
	// linked. A full-corpus search shortcut jumps straight to a passage.
	// Confirming stages the relation in the shared edit buffer.
	let {
		open = $bindable(false),
		anchorBookId,
		anchorParagraphId,
		books,
		candidates = []
	}: {
		open: boolean;
		anchorBookId: string;
		anchorParagraphId: string;
		/** Corpus book list for step one: `{ id, title }`. */
		books: { id: string; title: string }[];
		/** Full topic set, for the passage-search topic filter. */
		candidates?: { type: string; value: string; label: string }[];
	} = $props();

	const corpusLang = $derived(getCorpusLang());

	let relType = $state('same_episode');
	let targetBook = $state('');
	let targetChapter = $state('');
	let selectedPara = $state('');

	let searchInput = $state('');
	let searchQuery = $state('');
	let searchEl = $state<HTMLInputElement | null>(null);
	let contentEl = $state<HTMLElement | null>(null);
	/** `type:value` keys of the topic filters AND-joined into the passage search. */
	let selectedTopics = $state<string[]>([]);

	// Flattened topic options for the tags input (value is the `type:value` key),
	// sorted by label like the advanced search.
	const topicOptions = $derived(
		candidates
			.map((c) => ({ value: `${c.type}:${c.value}`, label: c.label, type: c.type }))
			.sort((a, b) => a.label.localeCompare(b.label))
	);

	$effect(() => {
		const val = searchInput;
		const timer = setTimeout(() => (searchQuery = val), 200);
		return () => clearTimeout(timer);
	});

	// Each picker session starts fresh.
	$effect(() => {
		if (!open) {
			relType = 'same_episode';
			targetBook = '';
			targetChapter = '';
			selectedPara = '';
			searchInput = '';
			searchQuery = '';
			selectedTopics = [];
		}
	});

	const chapters = $derived(targetBook ? getChapters(targetBook, corpusLang) : []);
	const bookTitle = $derived(books.find((b) => b.id === targetBook)?.title ?? targetBook);
	const chapterTitle = $derived(
		chapters.find((c) => c.id === targetChapter)?.title ?? targetChapter
	);

	// The passage step feeds the shared Reader the same translation-coalesced
	// blocks as the chapter page (minus annotations — pills stay hidden).
	const blocks = $derived.by<ReaderBlock[]>(() => {
		if (!targetBook || !targetChapter) return [];
		const trans =
			corpusLang !== 'la'
				? getParagraphTranslations(targetBook, targetChapter, corpusLang)
				: new Map<string, string>();
		return getParagraphs(targetBook, targetChapter).map((p) => ({
			kind: 'paragraph' as const,
			id: p.id,
			label: p.label,
			content: trans.get(p.id) ?? p.content,
			contentLa: p.content,
			annotations: []
		}));
	});

	// A topic filter alone drives the search (no text needed), mirroring the
	// advanced search's filter-only path.
	const searchActive = $derived(!!searchQuery.trim() || selectedTopics.length > 0);
	const searchResults = $derived.by<SearchResult[]>(() => {
		if (!searchActive) return [];
		try {
			return searchParagraphs(searchQuery, corpusLang, {
				topics: selectedTopics.map((key) => {
					const colon = key.indexOf(':');
					return { type: key.slice(0, colon), value: key.slice(colon + 1) };
				})
			});
		} catch (e) {
			console.error('[relations] passage search threw', e);
			return [];
		}
	});

	const step = $derived(
		searchActive ? 'search' : !targetBook ? 'book' : !targetChapter ? 'chapter' : 'passage'
	);

	function pickBook(id: string) {
		targetBook = id;
		targetChapter = '';
		selectedPara = '';
	}
	function pickChapter(id: string) {
		targetChapter = id;
		selectedPara = '';
	}

	async function scrollToSelected(id: string) {
		await tick();
		contentEl
			?.querySelector(`[data-select-id="${CSS.escape(id)}"]`)
			?.scrollIntoView({ block: 'center' });
	}

	// A search hit lands directly on the passage step, preselected and scrolled
	// into view — the editor still confirms while seeing the surrounding text.
	function pickResult(r: SearchResult) {
		targetBook = r.book_id;
		targetChapter = r.chapter_id;
		selectedPara = r.paragraph_id;
		searchInput = '';
		searchQuery = '';
		selectedTopics = [];
		void scrollToSelected(r.paragraph_id);
	}

	const selfTarget = $derived(
		targetBook === anchorBookId && selectedPara === anchorParagraphId
	);
	const canStage = $derived(step === 'passage' && !!selectedPara && !selfTarget);

	function stage() {
		if (!canStage) return;
		edits.stageAdd(anchorBookId, anchorParagraphId, relType, `${targetBook}-${selectedPara}`);
		open = false;
	}

	const stepLabel = $derived(
		step === 'search'
			? t('relations.searchResults')
			: step === 'book'
				? t('relations.pickBook')
				: step === 'chapter'
					? t('relations.pickChapter')
					: t('relations.pickPassage')
	);

	const listItem =
		'flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm text-foreground hover:bg-accent focus:outline-none focus:bg-accent';
</script>

<Modal bind:open size="lg" title={t('relations.add')} initialFocus={() => searchEl}>
	<div class="flex h-full flex-col gap-2">
		<div class="relative">
			<SearchIcon
				class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
			/>
			<input
				type="search"
				bind:this={searchEl}
				bind:value={searchInput}
				placeholder={t('relations.searchPlaceholder')}
				aria-label={t('relations.searchPlaceholder')}
				class="w-full rounded border border-input bg-background py-1.5 pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			/>
		</div>

		{#if topicOptions.length}
			<!-- Topic filter borrowed from the advanced search: narrows the passage
			     search, and on its own (no text) drives it. -->
			<TopicFilterInput
				options={topicOptions}
				bind:selected={selectedTopics}
				placeholder={t('search.addTopic')}
			/>
		{/if}

		<div class="flex flex-wrap items-center gap-1 text-sm">
			<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{stepLabel}
			</span>
			{#if step !== 'search' && targetBook}
				<span class="ml-1 flex flex-wrap items-center gap-1">
					<button
						type="button"
						onclick={() => pickBook('')}
						class="rounded text-muted-foreground underline hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
					>
						{bookTitle}
					</button>
					{#if targetChapter}
						<ChevronRight class="h-3 w-3 text-muted-foreground" />
						<button
							type="button"
							onclick={() => pickChapter('')}
							class="rounded text-muted-foreground underline hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
						>
							{chapterTitle}
						</button>
					{/if}
				</span>
			{/if}
		</div>

		<div bind:this={contentEl} class="min-h-0 flex-1 overflow-y-auto rounded border border-border p-2">
			{#if step === 'search'}
				<!-- Same grouped-by-book results view as the home search; picking a
				     passage jumps to the passage step preselected. -->
				{#if searchResults.length > 0}
					<SearchResultList results={searchResults} onPick={pickResult} />
				{:else}
					<p class="px-2 py-1 text-sm text-muted-foreground">{t('search.noResults')}</p>
				{/if}
			{:else if step === 'book'}
				<ul>
					{#each books as b (b.id)}
						<li>
							<button type="button" onclick={() => pickBook(b.id)} class={listItem}>
								<span class="font-serif">{b.title}</span>
								<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
							</button>
						</li>
					{/each}
				</ul>
			{:else if step === 'chapter'}
				<ul>
					{#each chapters as c (c.id)}
						<li>
							<button type="button" onclick={() => pickChapter(c.id)} class={listItem}>
								<span class="font-serif">{c.title}</span>
								<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" />
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<Reader
					{blocks}
					bookId={targetBook}
					chapterId={targetChapter}
					{bookTitle}
					{chapterTitle}
					{corpusLang}
					parallel={false}
					editing={false}
					selectedId={selectedPara || null}
					onSelectBlock={(id) => (selectedPara = id)}
					onScriptureRef={() => {}}
				/>
			{/if}
		</div>

		<div class="flex items-center justify-between gap-2 pt-1">
			<label class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
				<span class="hidden text-xs sm:inline">{t('relations.typeLabel')}</span>
				<select
					bind:value={relType}
					aria-label={t('relations.typeLabel')}
					class="rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
				>
					<option value="same_episode">{t('relations.types.same_episode')}</option>
					<option value="related_to">{t('relations.types.related_to')}</option>
				</select>
			</label>
			{#if selfTarget}
				<span class="text-xs text-destructive">{t('relations.selfTarget')}</span>
			{/if}
			<button
				type="button"
				onclick={stage}
				disabled={!canStage}
				class="inline-flex shrink-0 items-center gap-1 rounded-md bg-foreground px-2.5 py-1.5 text-sm text-background hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
			>
				<Check class="h-4 w-4" /> {t('edit.confirm')}
			</button>
		</div>
	</div>
</Modal>
