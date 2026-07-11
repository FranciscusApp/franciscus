<script lang="ts">
	import { getBooks, searchParagraphs } from '$lib';
	import { groupByChapter } from '$lib/utils';
	import { getDbState } from '$lib/dbState';
	import NoScriptNotice from '$lib/NoScriptNotice.svelte';
	import DbProgressBar from '$lib/DbProgressBar.svelte';
	import { t, getCorpusLang, getUiLang } from '$lib/i18n';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import type { PageData } from './$types';

	// Manifest comes from the root layout's load(); it prerenders the browse view
	// (book list) with no DB. Search and book navigation activate once the DB has
	// finished downloading in the background.
	let { data }: { data: PageData } = $props();
	const db = getDbState();

	let inputValue = $state('');
	let query = $state('');

	$effect(() => {
		const val = inputValue;
		const timer = setTimeout(() => {
			query = val;
		}, 200);
		return () => clearTimeout(timer);
	});

	const corpusLang = $derived(getCorpusLang());
	const uiLang = $derived(getUiLang());

	// Before the DB lands, show the manifest's canonical (Latin) book list. Once
	// ready, upgrade to the DB so titles follow the corpus language and the
	// blurbs follow the UI language.
	const books = $derived(db.ready ? getBooks(corpusLang, uiLang) : data.manifest.books);

	// Advanced-search filters: restrict FTS matches by source book and/or by
	// annotated topic. Both narrow the query — an empty selection means "all".
	let showAdvanced = $state(false);
	let selectedBooks = $state<string[]>([]);
	/** `type:value` of the chosen topic, or '' for any. */
	let topicFilter = $state('');

	function toggleBook(id: string) {
		selectedBooks = selectedBooks.includes(id)
			? selectedBooks.filter((b) => b !== id)
			: [...selectedBooks, id];
	}

	// Topic options come from the manifest (same source as the /topics hub), so
	// the panel works as soon as the DB does, labeled in the UI language.
	const topicGroups = $derived.by(() => {
		const groups = new Map<string, { value: string; label: string }[]>();
		for (const tp of data.manifest.topics) {
			const list = groups.get(tp.type) ?? [];
			list.push({
				value: `${tp.type}:${tp.value}`,
				label: tp.descriptions?.[uiLang] ?? tp.description
			});
			groups.set(tp.type, list);
		}
		for (const list of groups.values()) list.sort((a, b) => a.label.localeCompare(b.label));
		return groups;
	});

	const filtersActive = $derived(selectedBooks.length + (topicFilter ? 1 : 0));

	function clearFilters() {
		selectedBooks = [];
		topicFilter = '';
	}

	const results = $derived.by(() => {
		if (!db.ready || !query.trim()) return [];
		const colon = topicFilter.indexOf(':');
		const topic =
			colon > 0
				? { type: topicFilter.slice(0, colon), value: topicFilter.slice(colon + 1) }
				: undefined;
		try {
			return searchParagraphs(query, corpusLang, {
				bookIds: selectedBooks.length ? selectedBooks : undefined,
				topic
			});
		} catch (e) {
			console.error('[search] searchParagraphs threw', e);
			return [];
		}
	});

	const groups = $derived(groupByChapter(results));

	const searching = $derived(db.ready && query.trim().length > 0);

	function resultUrl(r: { book_id: string; chapter_id: string; paragraph_id: string }): string {
		return `/book/${r.book_id}/${r.chapter_id}?q=${encodeURIComponent(query)}#${r.paragraph_id}`;
	}
</script>

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<header class="mb-6">
		<h1 class="text-3xl font-display font-bold text-foreground">{t('app.title')}</h1>
		<p class="text-muted-foreground mt-1">{t('app.subtitle')}</p>
	</header>

	<!-- Search-bar slot. Three states share this space: no-JS (the <noscript>
	     notice, also the non-blank message for crawlers), DB still loading
	     (download progress), and ready (the functional search input). -->
	<div class="mb-6">
		<NoScriptNotice />

		{#if db.ready}
			<input
				type="search"
				bind:value={inputValue}
				placeholder={t('search.placeholder')}
				aria-label={t('search.placeholder')}
				class="w-full px-4 py-3 rounded-lg border border-input
				       bg-background text-foreground
				       placeholder:text-muted-foreground
				       focus:outline-none focus:ring-2 focus:ring-ring
				       font-serif text-lg"
			/>
			<div class="mt-2">
				<button
					type="button"
					onclick={() => (showAdvanced = !showAdvanced)}
					aria-expanded={showAdvanced}
					class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<SlidersHorizontal class="w-4 h-4" />
					{t('search.advanced')}
					{#if filtersActive}
						<span
							class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1 text-xs font-medium text-primary"
							>{filtersActive}</span
						>
					{/if}
				</button>
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
						<label class="block text-sm">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{t('search.filterTopic')}
							</span>
							<select
								bind:value={topicFilter}
								class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
							>
								<option value="">{t('search.anyTopic')}</option>
								{#each topicGroups as [type, opts] (type)}
									<optgroup label={t(`topics.typePlurals.${type}`)}>
										{#each opts as o (o.value)}
											<option value={o.value}>{o.label}</option>
										{/each}
									</optgroup>
								{/each}
							</select>
						</label>
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
		{:else if !db.error}
			<!-- Rendered in the prerendered HTML so JS users see it from first paint
			     (app loading → corpus downloading); `js-only` hides it when scripts
			     are off, where the NoScriptNotice above explains instead. -->
			<div class="js-only w-full px-4 py-3 rounded-lg border border-input bg-background">
				<DbProgressBar progress={db.progress} />
			</div>
		{/if}
	</div>

	{#if searching}
		<p class="text-sm text-muted-foreground mb-2">
			{results.length} {results.length === 1 ? t('search.resultCountOne') : t('search.resultCount')}
		</p>

		{#if groups.length > 0}
			<ul class="space-y-4">
				{#each groups as g}
					<li class="block p-4 rounded-lg border border-border hover:border-ring transition-colors">
						<div class="text-sm text-muted-foreground mb-1">
							<span class="font-medium text-foreground">{g.book_title}</span>
							<span> &mdash; </span>
							<a
								href="/book/{g.book_id}/{g.chapter_id}?q={encodeURIComponent(query)}"
								class="hover:text-primary"
							>{g.chapter_title}</a>
						</div>
						<p class="font-serif text-foreground leading-relaxed">
							{#each g.items as r, i}
								{#if i > 0}<span class="text-muted-foreground">{r.position === g.items[i - 1].position + 1 ? ' ' : ' […] '}</span>{/if}<a
									href={resultUrl(r)}
									class="hover:text-primary"
								>{#if r.paragraph_label}<span class="text-muted-foreground">&sect;{r.paragraph_label} </span>{/if}{@html r.snippet}</a>
							{/each}
						</p>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-muted-foreground mt-6 font-serif">{t('search.noResults')}</p>
		{/if}
	{:else}
		<nav aria-label={t('nav.topics')} class="mb-6 flex gap-4">
			<a href="/topics" class="text-muted-foreground hover:text-primary transition-colors font-serif">
				{t('nav.topics')} &rarr;
			</a>
		</nav>

		<section>
			<h2 class="text-xl font-display text-foreground mb-4">{t('home.sourcesHeading')}</h2>
			<ul class="space-y-3">
				{#each books as book}
					<li>
						<!-- /book/<id> is prerendered static HTML (metadata + chapter TOC,
						     no DB), so these links work without JS or the DB loaded. -->
						<a
							href="/book/{book.id}"
							class="group block p-4 rounded-lg border border-border transition-colors hover:border-ring"
						>
							<strong class="font-serif text-lg text-foreground group-hover:text-primary">{book.title}</strong>
							<span class="text-muted-foreground"> — {book.author}</span>
							{#if book.date}
								<span class="text-muted-foreground"> ({book.date})</span>
							{/if}
							{#if book.description_short}
								<span class="block text-sm text-muted-foreground mt-1 font-serif">{book.description_short}</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
