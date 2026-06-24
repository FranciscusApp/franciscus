<script lang="ts">
	import { getBooks, searchParagraphs, type BookMeta } from '$lib';
	import { t, getCorpusLang } from '$lib/i18n';

	const books: BookMeta[] = getBooks();

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

	const results = $derived.by(() => {
		if (!query.trim()) return [];
		try {
			return searchParagraphs(query, corpusLang);
		} catch (e) {
			console.error('[search] searchParagraphs threw', e);
			return [];
		}
	});

	const searching = $derived(query.trim().length > 0);

	function resultUrl(r: { book_id: string; chapter_id: string; paragraph_id: string }): string {
		return `/book/${r.book_id}/${r.chapter_id}?q=${encodeURIComponent(query)}#${r.paragraph_id}`;
	}
</script>

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<header class="mb-6">
		<h1 class="text-3xl font-serif font-bold text-stone-800 dark:text-stone-100">{t('app.title')}</h1>
		<p class="text-stone-500 dark:text-stone-400 mt-1">{t('app.subtitle')}</p>
	</header>

	<input
		type="search"
		bind:value={inputValue}
		placeholder={t('search.placeholder')}
		aria-label={t('search.placeholder')}
		class="w-full px-4 py-3 rounded-lg border border-stone-300 dark:border-stone-600
		       bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100
		       placeholder:text-stone-400 dark:placeholder:text-stone-500
		       focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-600
		       font-serif text-lg mb-6"
	/>

	{#if searching}
		<p class="text-sm text-stone-500 dark:text-stone-400 mb-2">
			{results.length} {results.length === 1 ? t('search.resultCountOne') : t('search.resultCount')}
		</p>

		{#if results.length > 0}
			<ul class="space-y-4">
				{#each results as r}
					<li>
						<a
							href={resultUrl(r)}
							class="block p-4 rounded-lg border border-stone-200 dark:border-stone-700
							       hover:border-stone-400 dark:hover:border-stone-500 transition-colors group"
						>
							<div class="text-sm text-stone-500 dark:text-stone-400 mb-1">
								<span class="font-medium text-stone-700 dark:text-stone-300">{r.book_title}</span>
								<span> &mdash; </span>
								<span>{r.chapter_title}</span>
								{#if r.paragraph_label}
									<span class="text-stone-500 dark:text-stone-400"> &sect;{r.paragraph_label}</span>
								{/if}
							</div>
							<p class="font-serif text-stone-700 dark:text-stone-300 leading-relaxed">
								{@html r.snippet}
							</p>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-stone-500 dark:text-stone-400 mt-6 font-serif">{t('search.noResults')}</p>
		{/if}
	{:else}
		<nav aria-label={t('nav.attributes')} class="mb-6 flex gap-4">
			<a href="/attributes" class="text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors font-serif">
				{t('nav.attributes')} &rarr;
			</a>
		</nav>

		<section>
			<h2 class="text-xl font-serif text-stone-700 dark:text-stone-300 mb-4">{t('home.sourcesHeading')}</h2>
			<ul class="space-y-3">
				{#each books as book}
					<li>
						<a href="/book/{book.id}" class="group block p-4 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500 transition-colors">
							<strong class="font-serif text-lg text-stone-800 dark:text-stone-100 group-hover:text-stone-950 dark:group-hover:text-white">{book.title}</strong>
							<span class="text-stone-500 dark:text-stone-400"> — {book.author}</span>
							{#if book.date}
								<span class="text-stone-500 dark:text-stone-400"> ({book.date})</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
