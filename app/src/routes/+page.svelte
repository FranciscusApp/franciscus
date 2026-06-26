<script lang="ts">
	import { getBooks, searchParagraphs, type BookMeta } from '$lib';
	import { groupByChapter } from '$lib/utils';
	import { t, getCorpusLang } from '$lib/i18n';

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
	const books: BookMeta[] = $derived(getBooks(corpusLang));

	const results = $derived.by(() => {
		if (!query.trim()) return [];
		try {
			return searchParagraphs(query, corpusLang);
		} catch (e) {
			console.error('[search] searchParagraphs threw', e);
			return [];
		}
	});

	const groups = $derived(groupByChapter(results));

	const searching = $derived(query.trim().length > 0);

	function resultUrl(r: { book_id: string; chapter_id: string; paragraph_id: string }): string {
		return `/book/${r.book_id}/${r.chapter_id}?q=${encodeURIComponent(query)}#${r.paragraph_id}`;
	}
</script>

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<header class="mb-6">
		<h1 class="text-3xl font-display font-bold text-foreground">{t('app.title')}</h1>
		<p class="text-muted-foreground mt-1">{t('app.subtitle')}</p>
	</header>

	<input
		type="search"
		bind:value={inputValue}
		placeholder={t('search.placeholder')}
		aria-label={t('search.placeholder')}
		class="w-full px-4 py-3 rounded-lg border border-input
		       bg-background text-foreground
		       placeholder:text-muted-foreground
		       focus:outline-none focus:ring-2 focus:ring-ring
		       font-serif text-lg mb-6"
	/>

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
						<a href="/book/{book.id}" class="group block p-4 rounded-lg border border-border hover:border-ring transition-colors">
							<strong class="font-serif text-lg text-foreground group-hover:text-primary">{book.title}</strong>
							<span class="text-muted-foreground"> — {book.author}</span>
							{#if book.date}
								<span class="text-muted-foreground"> ({book.date})</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
