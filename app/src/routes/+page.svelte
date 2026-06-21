<script lang="ts">
	import { getBooks, type BookMeta } from '$lib';

	const books: BookMeta[] = getBooks();
</script>

<main class="max-w-3xl mx-auto px-4 py-8">
	<header class="mb-8">
		<h1 class="text-3xl font-serif font-bold text-stone-800 dark:text-stone-100">Franciscus</h1>
		<p class="text-stone-500 dark:text-stone-400 mt-1">Fontes Franciscani</p>
	</header>

	<section>
		<h2 class="text-xl font-serif text-stone-700 dark:text-stone-300 mb-4">Fontes</h2>
		<ul class="space-y-3">
			{#each books as book}
				<li>
					<a href="/book/{book.id}" class="group block p-4 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500 transition-colors">
						<strong class="font-serif text-lg text-stone-800 dark:text-stone-100 group-hover:text-stone-950 dark:group-hover:text-white">{book.title}</strong>
						<span class="text-stone-500 dark:text-stone-400"> — {book.author}</span>
						{#if book.date}
							<span class="text-stone-400 dark:text-stone-500"> ({book.date})</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	</section>
</main>
