<script lang="ts">
	import { groupByBook } from '$lib/utils';
	import type { SearchResult } from '$lib/types';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MinusIcon from '@lucide/svelte/icons/minus';

	// Shared search-results view: hits nested book → chapter under collapsible book
	// headers, with chapter deep-links and combined per-chapter snippets (adjacent
	// passages join with a space, gaps with […]). The home search renders each
	// passage as a deep link; the relation picker passes `onPick`, so a passage
	// instead selects a link target — same presentation, different action.
	let {
		results,
		query = '',
		onPick
	}: {
		results: SearchResult[];
		/** Live text query, threaded into deep links so the reader lands highlighted. */
		query?: string;
		/** When set, passages become pick buttons (picker) instead of links (home). */
		onPick?: (r: SearchResult) => void;
	} = $props();

	const pickMode = $derived(!!onPick);
	const bookGroups = $derived(groupByBook(results));

	// Start expanded: a searcher wants the hits visible; the headers are for scanning.
	let collapsedBooks = $state(new Set<string>());
	function toggleBook(bookId: string) {
		const next = new Set(collapsedBooks);
		if (!next.delete(bookId)) next.add(bookId);
		collapsedBooks = next;
	}

	const qSuffix = $derived(query.trim() ? `?q=${encodeURIComponent(query)}` : '');
	function resultUrl(r: SearchResult): string {
		return `/book/${r.book_id}/${r.chapter_id}${qSuffix}#${r.paragraph_id}`;
	}
</script>

<div class="space-y-6">
	{#each bookGroups as bg (bg.book_id)}
		{@const isOpen = !collapsedBooks.has(bg.book_id)}
		<div>
			<button
				type="button"
				onclick={() => toggleBook(bg.book_id)}
				aria-expanded={isOpen}
				aria-controls="results-{bg.book_id}"
				class="flex w-full items-center gap-2 text-left text-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring rounded transition-colors"
			>
				{#if isOpen}
					<MinusIcon class="w-4 h-4 shrink-0 text-primary" />
				{:else}
					<PlusIcon class="w-4 h-4 shrink-0 text-primary" />
				{/if}
				<span class="font-display font-bold">{bg.book_title}</span>
				<span class="text-sm text-muted-foreground">({bg.count})</span>
			</button>
			<hr class="divider-book" />
			{#if isOpen}
				<ul id="results-{bg.book_id}" class="space-y-4">
					{#each bg.chapters as g (g.chapter_id)}
						<li class="block p-4 rounded-lg border border-border hover:border-ring transition-colors">
							<div class="text-sm text-muted-foreground mb-1">
								{#if pickMode}
									<span>{g.chapter_title}</span>
								{:else}
									<a
										href="/book/{g.book_id}/{g.chapter_id}{qSuffix}"
										class="hover:text-primary"
									>{g.chapter_title}</a>
								{/if}
							</div>
							<p class="font-serif text-foreground leading-relaxed">
								{#each g.items as r, i}
									{#if i > 0}<span class="text-muted-foreground">{r.position === g.items[i - 1].position + 1 ? ' ' : ' […] '}</span>{/if}{#if pickMode}<button
											type="button"
											onclick={() => onPick?.(r)}
											class="text-left hover:text-primary"
										>{#if r.paragraph_label}<span class="text-muted-foreground">§{r.paragraph_label} </span>{/if}{@html r.snippet}</button>{:else}<a
											href={resultUrl(r)}
											class="hover:text-primary"
										>{#if r.paragraph_label}<span class="text-muted-foreground">§{r.paragraph_label} </span>{/if}{@html r.snippet}</a>{/if}
								{/each}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/each}
</div>
