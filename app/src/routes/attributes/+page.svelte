<script lang="ts">
	import { getDistinctAttributes, type AttributeSummary } from '$lib';

	const attributes = getDistinctAttributes();

	const typeLabels: Record<string, string> = {
		virtue: 'Virtues',
		topic: 'Topics',
		event: 'Events',
		place: 'Places',
		person: 'People'
	};

	const typeColors: Record<string, string> = {
		virtue: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800',
		topic: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800',
		event: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800',
		place: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800',
		person: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-800'
	};

	const grouped = $derived.by(() => {
		const map = new Map<string, AttributeSummary[]>();
		for (const a of attributes) {
			const list = map.get(a.attr_type) ?? [];
			list.push(a);
			map.set(a.attr_type, list);
		}
		return map;
	});

	const typeOrder = ['virtue', 'topic', 'event', 'place', 'person'];
</script>

<main class="max-w-3xl mx-auto px-4 py-8">
	<nav class="text-sm text-stone-400 dark:text-stone-500 mb-6">
		<a href="/" class="hover:text-stone-600 dark:hover:text-stone-300">Sources</a>
		<span> / </span>
		<span class="text-stone-600 dark:text-stone-300">Attributes</span>
	</nav>

	<h2 class="text-2xl font-serif font-bold text-stone-800 dark:text-stone-100 mb-6">Attributes</h2>
	<p class="text-stone-500 dark:text-stone-400 mb-8">
		Index of all attributes annotated in the sources: virtues, topics, events, places, and people.
	</p>

	{#each typeOrder as attrType}
		{@const items = grouped.get(attrType)}
		{#if items && items.length > 0}
			<section class="mb-8">
				<h3 class="text-lg font-serif text-stone-700 dark:text-stone-300 mb-3">
					{typeLabels[attrType] ?? attrType}
				</h3>
				<div class="flex flex-wrap gap-2">
					{#each items as attr}
						<a
							href="/attributes/{attr.attr_type}/{attr.attr_value}"
							class="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition-colors {typeColors[attr.attr_type] ?? 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'}"
						>
							{attr.attr_value.replaceAll('_', ' ')}
							<span class="text-xs opacity-60">({attr.count})</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}
	{/each}
</main>
