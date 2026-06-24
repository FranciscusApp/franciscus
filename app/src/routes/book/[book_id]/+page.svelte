<script lang="ts">
	import { page } from '$app/stores';
	import { getBook, getChapters, type BookMeta, type Chapter } from '$lib';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { t, getCorpusLang } from '$lib/i18n';

	const bookId = $derived($page.params.book_id ?? '');
	const corpusLang = $derived(getCorpusLang());
	const book = $derived(getBook(bookId, corpusLang));
	const chapters = $derived(book ? getChapters(bookId, corpusLang) : []);

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
		<Breadcrumb.Root class="mb-6">
			<Breadcrumb.List class="text-sm text-muted-foreground">
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/" class="hover:text-foreground">{t('nav.sources')}</Breadcrumb.Link>
				</Breadcrumb.Item>
				<Breadcrumb.Separator>/</Breadcrumb.Separator>
				<Breadcrumb.Item>
					<Breadcrumb.Page class="text-foreground">{book.title}</Breadcrumb.Page>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>

		<header class="mb-8">
			<h1 class="text-2xl font-display font-bold text-foreground">{book.title}</h1>
			<p class="text-muted-foreground mt-1">{meta}</p>
		</header>

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
