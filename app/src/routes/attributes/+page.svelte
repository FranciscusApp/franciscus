<script lang="ts">
	import { getDistinctAttributes, type AttributeSummary } from '$lib';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { attrColors } from '$lib/attrColors';
	import { t } from '$lib/i18n';

	const attributes = getDistinctAttributes();

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

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<Breadcrumb.Root class="mb-6">
		<Breadcrumb.List class="text-sm text-stone-500 dark:text-stone-400">
			<Breadcrumb.Item>
				<Breadcrumb.Link href="/" class="hover:text-stone-600 dark:hover:text-stone-300">{t('nav.sources')}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator>/</Breadcrumb.Separator>
			<Breadcrumb.Item>
				<Breadcrumb.Page class="text-stone-600 dark:text-stone-300">{t('nav.attributes')}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>

	<h1 class="text-2xl font-serif font-bold text-stone-800 dark:text-stone-100 mb-6">{t('attributes.heading')}</h1>
	<p class="text-stone-500 dark:text-stone-400 mb-8">
		{t('attributes.description')}
	</p>

	{#each typeOrder as attrType}
		{@const items = grouped.get(attrType)}
		{#if items && items.length > 0}
			<section class="mb-8">
				<h2 class="text-lg font-serif text-stone-700 dark:text-stone-300 mb-3">
					{t(`attributes.typePlurals.${attrType}`)}
				</h2>
				<div class="flex flex-wrap gap-2">
					{#each items as attr}
						<a
							href="/attributes/{attr.attr_type}/{attr.attr_value}"
							class="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition-colors {attrColors(attr.attr_type, true)}"
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
