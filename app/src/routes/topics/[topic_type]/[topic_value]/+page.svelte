<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		getTopicPage,
		getTopicOccurrences,
		resolveTopicSlug,
		type TopicPage,
		type TopicOccurrence
	} from '$lib';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { topicColors } from '$lib/topicColors';
	import { t, getCorpusLang, getUiLang } from '$lib/i18n';

	const topicType = $derived($page.params.topic_type ?? '');
	const urlSlug = $derived($page.params.topic_value ?? '');
	const corpusLang = $derived(getCorpusLang());
	const uiLang = $derived(getUiLang());

	// Canonical URL is /topics/<type>/<topic_value> (the source-file value).
	// A request for a lang_slug (e.g. .../st_chiara_di_assisi) is resolved to
	// the canonical pair and redirected. Unknown slugs fall through and the
	// template renders the "no page" state.
	const canonical = $derived(resolveTopicSlug(topicType, urlSlug));
	const topicValue = $derived(canonical?.topic_value ?? urlSlug);

	$effect(() => {
		if (canonical && canonical.topic_value !== urlSlug) {
			goto(`/topics/${canonical.topic_type}/${canonical.topic_value}`, { replaceState: true });
		}
	});

	// Topic page chrome (description, body, lang_slug) follows the UI language;
	// the occurrence list shows source-corpus material (book/chapter titles,
	// paragraph bodies), so it follows the corpus language instead.
	const topicPage = $derived(getTopicPage(topicType, topicValue, uiLang));
	const occurrences = $derived(getTopicOccurrences(topicType, topicValue, corpusLang));

	const displayTitle = $derived(topicPage?.description ?? topicValue.replaceAll('_', ' '));
</script>

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<Breadcrumb.Root class="mb-6">
		<Breadcrumb.List class="text-sm text-muted-foreground">
			<Breadcrumb.Item>
				<Breadcrumb.Link href="/" class="hover:text-foreground">{t('nav.sources')}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator>/</Breadcrumb.Separator>
			<Breadcrumb.Item>
				<Breadcrumb.Link href="/topics" class="hover:text-foreground">{t('nav.topics')}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator>/</Breadcrumb.Separator>
			<Breadcrumb.Item>
				<Breadcrumb.Page class="text-foreground">{displayTitle}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>

	<div class="mb-6">
		<Badge class="mb-2 rounded-full font-normal {topicColors(topicType)}">
			{t(`topics.types.${topicType}`)}
		</Badge>
		<h1 class="text-2xl font-display font-bold text-foreground">{displayTitle}</h1>
	</div>

	{#if topicPage}
		<div class="prose prose-stone dark:prose-invert max-w-none mb-10 font-serif leading-relaxed text-foreground">
			{@html topicPage.content}
		</div>
	{/if}

	{#if occurrences.length > 0}
		<section>
			<h2 class="text-lg font-display text-foreground mb-4">
				{t('topics.passagesHeading')} ({occurrences.length})
			</h2>
			<div class="space-y-4">
				{#each occurrences as occ}
					<div class="border border-border rounded-lg p-4">
						<div class="text-sm text-muted-foreground mb-2">
							<a
								href="/book/{occ.book_id}"
								class="hover:text-primary"
							>{occ.book_title}</a>
							<span> / </span>
							<a
								href="/book/{occ.book_id}/{occ.chapter_id}"
								class="hover:text-primary"
							>{occ.chapter_title}</a>
							<span> / </span>
							<a
								href="/book/{occ.book_id}/{occ.chapter_id}#{occ.paragraph_id}"
								class="hover:text-primary"
							>{occ.paragraph_label ?? occ.paragraph_id}</a>
						</div>
						<div lang={corpusLang} class="font-serif text-foreground leading-relaxed">
							{@html occ.content}
						</div>
						{#if occ.comment}
							<p class="mt-2 text-sm text-muted-foreground italic">
								{occ.comment}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{:else}
		<p class="text-muted-foreground italic">
			{t('topics.noOccurrences')}
		</p>
	{/if}
</main>
