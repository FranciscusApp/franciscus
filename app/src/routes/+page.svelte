<script lang="ts">
	import { getBooks, searchParagraphs } from '$lib';
	import { getDbState } from '$lib/dbState';
	import { topicColors } from '$lib/topicColors';
	import NoScriptNotice from '$lib/NoScriptNotice.svelte';
	import DbProgressBar from '$lib/DbProgressBar.svelte';
	import SearchResultList from '$lib/SearchResultList.svelte';
	import { t, getCorpusLang, getUiLang } from '$lib/i18n';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import X from '@lucide/svelte/icons/x';
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
	// annotated topics. Books widen within the facet (IN); topics narrow
	// (a passage must carry every selected topic). Topic filters work with an
	// empty text query — selecting one is itself a search.
	let showAdvanced = $state(false);
	let selectedBooks = $state<string[]>([]);
	/** `type:value` keys of the selected topics, AND-joined. */
	let selectedTopics = $state<string[]>([]);
	// Tags-combobox state: the topic filter is an autocomplete input that only
	// accepts real topics (no freeform), rendering chosen topics as inline pills.
	let topicQuery = $state('');
	let topicFocused = $state(false);
	let activeIndex = $state(0);
	let topicInputEl = $state<HTMLInputElement | null>(null);

	function toggleBook(id: string) {
		selectedBooks = selectedBooks.includes(id)
			? selectedBooks.filter((b) => b !== id)
			: [...selectedBooks, id];
	}

	function addTopicFilter(key: string) {
		if (key && !selectedTopics.includes(key)) selectedTopics = [...selectedTopics, key];
		topicQuery = '';
		activeIndex = 0;
		topicInputEl?.focus();
	}
	function removeTopicFilter(key: string) {
		selectedTopics = selectedTopics.filter((k) => k !== key);
	}

	function onTopicKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = Math.min(activeIndex + 1, topicSuggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
		} else if (e.key === 'Enter') {
			const pick = topicSuggestions[activeIndex] ?? topicSuggestions[0];
			if (pick) {
				e.preventDefault();
				addTopicFilter(pick.value);
			}
		} else if (e.key === 'Backspace' && topicQuery === '' && selectedTopics.length) {
			selectedTopics = selectedTopics.slice(0, -1);
		} else if (e.key === 'Escape') {
			topicFocused = false;
		}
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

	// Flattened topic options (value/label/type), the pool the combobox filters.
	const allTopicOptions = $derived.by(() => {
		const out: { value: string; label: string; type: string }[] = [];
		for (const [type, opts] of topicGroups) for (const o of opts) out.push({ ...o, type });
		return out;
	});
	// Autocomplete matches for the current query, minus already-selected topics.
	const topicSuggestions = $derived.by(() => {
		const q = topicQuery.trim().toLowerCase();
		return allTopicOptions
			.filter((o) => !selectedTopics.includes(o.value))
			.filter((o) => !q || o.label.toLowerCase().includes(q))
			.slice(0, 8);
	});
	const showTopicDropdown = $derived(topicFocused && topicSuggestions.length > 0);
	// Reset the keyboard highlight whenever the query (and thus the list) changes.
	$effect(() => {
		void topicQuery;
		activeIndex = 0;
	});

	const filtersActive = $derived(selectedBooks.length + selectedTopics.length);

	function clearFilters() {
		selectedBooks = [];
		selectedTopics = [];
	}

	// Selected-topic pills: resolve each key back to its UI-language label.
	const topicPills = $derived(
		selectedTopics.map((key) => {
			const colon = key.indexOf(':');
			const type = key.slice(0, colon);
			const label =
				[...topicGroups.get(type) ?? []].find((o) => o.value === key)?.label ??
				key.slice(colon + 1).replaceAll('_', ' ');
			return { key, type, label };
		})
	);

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
			console.error('[search] searchParagraphs threw', e);
			return [];
		}
	});

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
						<div class="block text-sm">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{t('search.filterTopic')}
							</span>
							<!-- Autocomplete tags input: selected topics render as inline pills,
							     typing narrows a suggestion list, and only real topics are
							     accepted (no freeform). Backspace on an empty field pops the last
							     pill. The pills live here, inside the advanced box. -->
							<div class="relative">
								<div
									class="flex flex-wrap items-center gap-1 rounded border border-input bg-background px-1.5 py-1 focus-within:ring-2 focus-within:ring-ring"
								>
									{#each topicPills as p (p.key)}
										<span
											class="inline-flex items-center gap-1 max-w-full break-words rounded-full px-2 py-0.5 text-xs {topicColors(p.type)}"
										>
											{p.label}
											<button
												type="button"
												onclick={() => removeTopicFilter(p.key)}
												aria-label={t('search.removeTopic')}
												class="rounded-full hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-ring"
											>
												<X class="h-3 w-3" />
											</button>
										</span>
									{/each}
									<input
										type="text"
										bind:this={topicInputEl}
										bind:value={topicQuery}
										onfocus={() => (topicFocused = true)}
										onblur={() => setTimeout(() => (topicFocused = false), 120)}
										onkeydown={onTopicKeydown}
										placeholder={selectedTopics.length ? '' : t('search.addTopic')}
										role="combobox"
										aria-expanded={showTopicDropdown}
										aria-controls="topic-suggestions"
										aria-autocomplete="list"
										aria-label={t('search.filterTopic')}
										class="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
									/>
								</div>
								{#if showTopicDropdown}
									<ul
										id="topic-suggestions"
										role="listbox"
										class="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded border border-border bg-popover shadow-lg"
									>
										{#each topicSuggestions as o, i (o.value)}
											<li role="option" aria-selected={i === activeIndex}>
												<button
													type="button"
													onmousedown={(e) => e.preventDefault()}
													onclick={() => addTopicFilter(o.value)}
													class="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-sm hover:bg-accent focus:outline-none {i ===
													activeIndex
														? 'bg-accent'
														: ''}"
												>
													<span class="inline-block h-2 w-2 shrink-0 rounded-full {topicColors(o.type)}"></span>
													<span class="truncate text-foreground">{o.label}</span>
													<span class="ml-auto shrink-0 text-xs text-muted-foreground"
														>{t(`topics.types.${o.type}`)}</span
													>
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
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

		{#if results.length > 0}
			<SearchResultList {results} {query} />
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
