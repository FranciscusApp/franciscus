<script lang="ts">
	import { getDistinctTopics, type TopicSummary } from '$lib';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { topicColors } from '$lib/topicColors';
	import { t, getUiLang } from '$lib/i18n';

	const uiLang = $derived(getUiLang());
	const topics = $derived(getDistinctTopics(uiLang));

	const grouped = $derived.by(() => {
		const map = new Map<string, TopicSummary[]>();
		for (const a of topics) {
			const list = map.get(a.topic_type) ?? [];
			list.push(a);
			map.set(a.topic_type, list);
		}
		return map;
	});

	const typeOrder = ['virtue', 'theme', 'event', 'place', 'person'];
</script>

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<Breadcrumb.Root class="mb-6">
		<Breadcrumb.List class="text-sm text-muted-foreground">
			<Breadcrumb.Item>
				<Breadcrumb.Link href="/" class="hover:text-foreground">{t('nav.sources')}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator>/</Breadcrumb.Separator>
			<Breadcrumb.Item>
				<Breadcrumb.Page class="text-foreground">{t('nav.topics')}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>

	<h1 class="text-2xl font-display font-bold text-foreground mb-6">{t('topics.heading')}</h1>
	<p class="text-muted-foreground mb-8">
		{t('topics.description')}
	</p>

	{#each typeOrder as topicType}
		{@const items = grouped.get(topicType)}
		{#if items && items.length > 0}
			<section class="mb-8">
				<h2 class="text-lg font-display text-foreground mb-3">
					{t(`topics.typePlurals.${topicType}`)}
				</h2>
				<div class="flex flex-wrap gap-2">
					{#each items as topic}
						<a
							href="/topics/{topic.topic_type}/{topic.topic_value}"
							class="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full transition-colors {topicColors(topic.topic_type, true)}"
						>
							{(topic.lang_slug ?? topic.topic_value).replaceAll('_', ' ')}
							<span class="text-xs opacity-60">({topic.count})</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}
	{/each}
</main>
