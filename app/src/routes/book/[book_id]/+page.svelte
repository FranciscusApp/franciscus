<script lang="ts">
	import { page } from '$app/stores';
	import { getBook, getChapters, type BookMeta, type Chapter } from '$lib';

	const bookId = $derived($page.params.book_id ?? '');
	const book = $derived(getBook(bookId));
	const chapters = $derived(book ? getChapters(bookId) : []);

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
	<main class="max-w-3xl mx-auto px-4 py-8">
		<nav class="text-sm text-stone-400 dark:text-stone-500 mb-6">
			<a href="/" class="hover:text-stone-600 dark:hover:text-stone-300">Sources</a>
			<span> / </span>
			<span class="text-stone-600 dark:text-stone-300">{book.title}</span>
		</nav>

		<header class="mb-8">
			<h2 class="text-2xl font-serif font-bold text-stone-800 dark:text-stone-100">{book.title}</h2>
			<p class="text-stone-500 dark:text-stone-400 mt-1">{meta}</p>
		</header>

		<section>
			<h3 class="text-lg font-serif text-stone-700 dark:text-stone-300 mb-3">Chapters</h3>
			<ul class="space-y-2">
				{#each chapters as ch}
					<li>
						<a
							href="/book/{bookId}/{ch.id}"
							class="block p-3 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500 transition-colors text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
						>
							{ch.title}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	</main>
{:else}
	<main class="max-w-3xl mx-auto px-4 py-8">
		<p class="text-stone-500 dark:text-stone-400">Book not found.</p>
	</main>
{/if}
