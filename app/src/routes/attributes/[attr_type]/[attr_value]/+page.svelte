<script lang="ts">
	import { page } from '$app/stores';
	import {
		getAttributePage,
		getAttributeOccurrences,
		type AttributePage,
		type AttributeOccurrence
	} from '$lib';

	const attrType = $derived($page.params.attr_type ?? '');
	const attrValue = $derived($page.params.attr_value ?? '');

	const attrPage = $derived(getAttributePage(attrType, attrValue));
	const occurrences = $derived(getAttributeOccurrences(attrType, attrValue));

	const typeLabels: Record<string, string> = {
		virtue: 'Virtue',
		topic: 'Topic',
		event: 'Event',
		place: 'Place',
		person: 'Person'
	};

	const typeColors: Record<string, string> = {
		virtue: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
		topic: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
		event: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
		place: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
		person: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300'
	};

	const displayTitle = $derived(attrPage?.title ?? attrValue.replaceAll('_', ' '));
</script>

<main class="max-w-3xl mx-auto px-4 py-8">
	<nav class="text-sm text-stone-400 dark:text-stone-500 mb-6">
		<a href="/" class="hover:text-stone-600 dark:hover:text-stone-300">Sources</a>
		<span> / </span>
		<a href="/attributes" class="hover:text-stone-600 dark:hover:text-stone-300">Attributes</a>
		<span> / </span>
		<span class="text-stone-600 dark:text-stone-300">{displayTitle}</span>
	</nav>

	<div class="mb-6">
		<span class="inline-block text-xs px-2 py-0.5 rounded-full mb-2 {typeColors[attrType] ?? 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'}">
			{typeLabels[attrType] ?? attrType}
		</span>
		<h2 class="text-2xl font-serif font-bold text-stone-800 dark:text-stone-100">{displayTitle}</h2>
	</div>

	{#if attrPage}
		<div class="prose prose-stone dark:prose-invert max-w-none mb-10 font-serif leading-relaxed text-stone-700 dark:text-stone-300">
			{@html attrPage.content}
		</div>
	{/if}

	{#if occurrences.length > 0}
		<section>
			<h3 class="text-lg font-serif text-stone-700 dark:text-stone-300 mb-4">
				Passages ({occurrences.length})
			</h3>
			<div class="space-y-4">
				{#each occurrences as occ}
					<div class="border border-stone-200 dark:border-stone-700 rounded-lg p-4">
						<div class="text-sm text-stone-400 dark:text-stone-500 mb-2">
							<a
								href="/book/{occ.book_id}"
								class="hover:text-stone-600 dark:hover:text-stone-300"
							>{occ.book_title}</a>
							<span> / </span>
							<a
								href="/book/{occ.book_id}/{occ.chapter_id}"
								class="hover:text-stone-600 dark:hover:text-stone-300"
							>{occ.chapter_title}</a>
							<span> / </span>
							<a
								href="/book/{occ.book_id}/{occ.chapter_id}#{occ.paragraph_id}"
								class="hover:text-stone-600 dark:hover:text-stone-300"
							>{occ.paragraph_label ?? occ.paragraph_id}</a>
						</div>
						<div class="font-serif text-stone-800 dark:text-stone-200 leading-relaxed">
							{@html occ.content}
						</div>
						{#if occ.evidence}
							<p class="mt-2 text-sm text-stone-500 dark:text-stone-400 italic">
								{occ.evidence}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{:else}
		<p class="text-stone-500 dark:text-stone-400 italic">
			No paragraphs annotated with this attribute.
		</p>
	{/if}
</main>
