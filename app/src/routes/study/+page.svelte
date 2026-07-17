<script lang="ts">
	import { onMount } from 'svelte';
	import { getBooks, getTopicDescriptions, searchParagraphs } from '$lib';
	import type { ManifestBook, BookMeta } from '$lib';
	import { getDbState } from '$lib/dbState';
	import NoScriptNotice from '$lib/NoScriptNotice.svelte';
	import DbProgressBar from '$lib/DbProgressBar.svelte';
	import StudyPane from '$lib/StudyPane.svelte';
	import TopicFilterInput from '$lib/TopicFilterInput.svelte';
	import ScriptureModal from '$lib/ScriptureModal.svelte';
	import { decodeStudyState, encodeStudyState, type StudyPaneState } from '$lib/study';
	import { t, getCorpusLang, getUiLang } from '$lib/i18n';
	import { getWideLayout } from '$lib/wide.svelte.js';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import MonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';
	import LinkIcon from '@lucide/svelte/icons/link';
	import CheckIcon from '@lucide/svelte/icons/check';
	import type { PageData } from './$types';

	// The study view: one shared search (text + advanced facets) feeding two
	// side-by-side panes that open results as inline readers — see StudyPane for
	// the per-pane behavior. Desktop-only by design (two readers need the width);
	// small screens get a friendly pointer to a wider device, gated purely by CSS
	// so the prerendered HTML needs no viewport JS.
	let { data }: { data: PageData } = $props();
	const db = getDbState();

	const corpusLang = $derived(getCorpusLang());
	const uiLang = $derived(getUiLang());

	let inputValue = $state('');
	let query = $state('');

	$effect(() => {
		const val = inputValue;
		const timer = setTimeout(() => {
			query = val;
		}, 200);
		return () => clearTimeout(timer);
	});

	// Advanced-search facets, shared with both panes (same semantics as home:
	// books widen within the facet, topics narrow).
	let showAdvanced = $state(false);
	let selectedBooks = $state<string[]>([]);
	let selectedTopics = $state<string[]>([]);

	// What each pane is reading (null = search results). Seeded once from
	// ?state= below; afterwards the URL is left alone — sharing goes through the
	// copy-link button instead of live URL rewriting.
	let panes = $state<[StudyPaneState | null, StudyPaneState | null]>([null, null]);

	onMount(() => {
		const raw = new URLSearchParams(location.search).get('state');
		if (!raw) return;
		const st = decodeStudyState(raw);
		if (!st) return;
		inputValue = st.q;
		query = st.q;
		selectedBooks = st.books;
		selectedTopics = st.topics;
		panes = st.panes;
		if (st.books.length || st.topics.length) showAdvanced = true;
	});

	const books = $derived(db.ready ? getBooks(corpusLang, uiLang) : data.manifest.books);

	function toggleBook(id: string) {
		selectedBooks = selectedBooks.includes(id)
			? selectedBooks.filter((b) => b !== id)
			: [...selectedBooks, id];
	}

	// A topic toggled from inside a pane (a pill click) must be visible in the
	// filter UI, so the advanced panel opens along with it.
	function toggleTopic(key: string) {
		selectedTopics = selectedTopics.includes(key)
			? selectedTopics.filter((k) => k !== key)
			: [...selectedTopics, key];
		showAdvanced = true;
	}

	// Topic options from the manifest (as on home), labeled in the UI language.
	const allTopicOptions = $derived.by(() => {
		const out: { value: string; label: string; type: string }[] = [];
		for (const tp of data.manifest.topics) {
			out.push({
				value: `${tp.type}:${tp.value}`,
				label: tp.descriptions?.[uiLang] ?? tp.description,
				type: tp.type
			});
		}
		out.sort((a, b) => a.label.localeCompare(b.label));
		return out;
	});

	const filtersActive = $derived(selectedBooks.length + selectedTopics.length);

	function clearFilters() {
		selectedBooks = [];
		selectedTopics = [];
	}

	const searching = $derived(db.ready && (query.trim().length > 0 || selectedTopics.length > 0));

	const results = $derived.by(() => {
		if (!searching) return [];
		try {
			return searchParagraphs(query, corpusLang, {
				bookIds: selectedBooks.length ? selectedBooks : undefined,
				topics: selectedTopics.map((key) => {
					const colon = key.indexOf(':');
					return { type: key.slice(0, colon), value: key.slice(colon + 1) };
				})
			});
		} catch (e) {
			console.error('[study] searchParagraphs threw', e);
			return [];
		}
	});

	// Pill labels inside the pane readers (UI-language topic-page descriptions).
	const topicDescriptions = $derived(db.ready ? getTopicDescriptions(uiLang) : new Map<string, string>());
	function topicLabel(topicType: string, topicValue: string): string {
		return topicDescriptions.get(`${topicType}:${topicValue}`) ?? topicValue.replaceAll('_', ' ');
	}

	// One scripture modal for the whole page; both panes emit into it.
	let scriptureRef = $state<string | null>(null);

	// Copy a link reproducing the current setup (query, facets, open panes).
	let linkCopied = $state(false);
	let linkTimer: ReturnType<typeof setTimeout> | undefined;
	async function copySetupLink() {
		const state = encodeStudyState({
			q: query,
			books: $state.snapshot(selectedBooks),
			topics: $state.snapshot(selectedTopics),
			panes: $state.snapshot(panes)
		});
		try {
			await navigator.clipboard.writeText(`${location.origin}/study?state=${state}`);
			linkCopied = true;
			clearTimeout(linkTimer);
			linkTimer = setTimeout(() => (linkCopied = false), 1800);
		} catch {
			// Clipboard blocked (insecure context or denied permission): no-op.
		}
	}
</script>

<!-- Locked to the viewport under the fixed nav (md:pt-24 = 6rem) so the page
     itself never scrolls; the two panes below scroll internally instead. -->
<main
	id="main-content"
	tabindex="-1"
	class="mx-auto flex w-full flex-col {getWideLayout() ? 'max-w-none' : 'max-w-6xl'} px-4 py-8"
	style="height: calc(100dvh - 6rem)"
>
	<header class="mb-6">
		<h1 class="font-display text-3xl font-bold text-foreground">{t('study.heading')}</h1>
		<p class="mt-1 text-muted-foreground">{t('study.subtitle')}</p>
	</header>

	<NoScriptNotice />

	<!-- Small screens: the two-reader layout genuinely needs width, so instead
	     of a cramped fallback we point to a wider device. CSS-gated (lg), so no
	     flash and no viewport JS in the prerendered HTML. -->
	<div class="js-only lg:hidden">
		<div
			class="flex flex-col items-center gap-3 rounded-lg border border-border p-8 text-center"
		>
			<MonitorSmartphone class="size-10 text-primary" aria-hidden="true" />
			<p class="max-w-sm text-muted-foreground">{t('study.wideScreenOnly')}</p>
		</div>
	</div>

	<div class="js-only hidden min-h-0 flex-1 lg:flex lg:flex-col">
		{#if db.ready}
			<div class="mb-4">
				<input
					type="search"
					bind:value={inputValue}
					placeholder={t('search.placeholder')}
					aria-label={t('search.placeholder')}
					class="w-full rounded-lg border border-input bg-background px-4 py-3
					       font-serif text-lg text-foreground
					       placeholder:text-muted-foreground
					       focus:outline-none focus:ring-2 focus:ring-ring"
				/>
				<div class="mt-2 flex items-start justify-between gap-2">
					<button
						type="button"
						onclick={() => (showAdvanced = !showAdvanced)}
						aria-expanded={showAdvanced}
						class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<SlidersHorizontal class="h-4 w-4" />
						{t('search.advanced')}
						{#if filtersActive}
							<span
								class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1 text-xs font-medium text-primary"
								>{filtersActive}</span
							>
						{/if}
					</button>
					<button
						type="button"
						onclick={copySetupLink}
						class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring {linkCopied
							? 'text-primary'
							: ''}"
					>
						{#if linkCopied}
							<CheckIcon class="h-4 w-4" />
							{t('study.linkCopied')}
						{:else}
							<LinkIcon class="h-4 w-4" />
							{t('study.copyLink')}
						{/if}
					</button>
				</div>
				{#if showAdvanced}
					<div class="mt-2 space-y-3 rounded-lg border border-border p-3">
						<fieldset>
							<legend class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{t('search.filterBooks')}
							</legend>
							<div class="flex flex-wrap gap-x-4 gap-y-1.5">
								{#each books as book (book.id)}
									<label class="flex items-center gap-1.5 text-sm text-foreground">
										<input
											type="checkbox"
											checked={selectedBooks.includes(book.id)}
											onchange={() => toggleBook(book.id)}
											class="h-4 w-4 rounded border-border"
										/>
										<span class="font-serif">{book.title}</span>
									</label>
								{/each}
							</div>
						</fieldset>
						<div class="block text-sm">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{t('search.filterTopic')}
							</span>
							<TopicFilterInput
								options={allTopicOptions}
								bind:selected={selectedTopics}
								placeholder={t('search.addTopic')}
							/>
						</div>
						{#if filtersActive}
							<button
								type="button"
								onclick={clearFilters}
								class="text-sm text-muted-foreground underline transition-colors hover:text-primary"
							>
								{t('search.clearFilters')}
							</button>
						{/if}
					</div>
				{/if}
			</div>

			{#if searching}
				<p class="mb-2 text-sm text-muted-foreground">
					{results.length}
					{results.length === 1 ? t('search.resultCountOne') : t('search.resultCount')}
				</p>
			{/if}

			<div class="study-panes grid min-h-0 flex-1 grid-cols-2 items-stretch gap-4">
				{#each [0, 1] as i (i)}
					<StudyPane
						pane={panes[i]}
						{results}
						{searching}
						{query}
						{corpusLang}
						{uiLang}
						{topicLabel}
						onOpen={(p) => (panes[i] = p)}
						onOpenSibling={(p) => (panes[1 - i] = p)}
						onClose={() => (panes[i] = null)}
						onToggleTopic={toggleTopic}
						onScriptureRef={(to) => (scriptureRef = to)}
					/>
				{/each}
			</div>
		{:else if !db.error}
			<div class="w-full rounded-lg border border-input bg-background px-4 py-3">
				<DbProgressBar progress={db.progress} />
			</div>
		{:else}
			<p class="text-destructive">{t('app.dbError')} {db.error}</p>
		{/if}
	</div>

	<ScriptureModal bind:to={scriptureRef} />
</main>

<style>
	/* The panes grid flex-fills the remaining height under the search bar; pin its
	   single row to that height (minmax(0,1fr), not auto) so the stretched pane
	   sections get a definite height to scroll their content within. */
	.study-panes {
		grid-template-rows: minmax(0, 1fr);
	}
</style>
