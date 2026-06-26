<script lang="ts">
	import { page } from '$app/stores';
	import { getBook, getChapters, type BookMeta, type Chapter } from '$lib';
	import Breadcrumbs from '$lib/Breadcrumbs.svelte';
	import { recordPage } from '$lib/trail.svelte.js';
	import { getProgress } from '$lib/progress.svelte.js';
	import { t, getCorpusLang } from '$lib/i18n';

	const bookId = $derived($page.params.book_id ?? '');
	const corpusLang = $derived(getCorpusLang());
	const book = $derived(getBook(bookId, corpusLang));
	const chapters = $derived(book ? getChapters(bookId, corpusLang) : []);
	const resume = $derived(getProgress(bookId));

	$effect(() => {
		if (!book) return;
		recordPage([{ id: `/book/${bookId}`, label: book.title, href: `/book/${bookId}` }]);
	});

	const meta = $derived(
		book
			? [
					book.author,
					book.date ? `(${book.date})` : '',
					book.ref_edition ? `— ${book.ref_edition}` : ''
				]
					.filter(Boolean)
					.join(' ')
			: ''
	);
</script>

{#if book}
	<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
		<Breadcrumbs />

		<header class="mb-8">
			<h1 class="text-2xl font-display font-bold text-foreground">{book.title}</h1>
			<p class="text-muted-foreground mt-1">{meta}</p>
		</header>

		{#if resume}
			<a
				href={resume.href}
				class="block mb-6 p-3 rounded-lg border border-ring bg-accent/40 text-foreground hover:text-primary transition-colors"
			>
				{t('book.continueReading')}: {resume.label}
			</a>
		{/if}

		<section>
			<h2 class="text-lg font-display text-foreground mb-3">{t('book.chaptersHeading')}</h2>
			<ul class="space-y-2">
				{#each chapters as ch}
					<li>
						<a
							href="/book/{bookId}/{ch.id}"
							class="block p-3 rounded-lg border border-border hover:border-ring transition-colors text-foreground hover:text-primary"
						>
							{ch.title}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	</main>
{:else}
	<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
		<p class="text-muted-foreground">{t('book.notFound')}</p>
	</main>
{/if}
