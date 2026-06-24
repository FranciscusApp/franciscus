<script lang="ts">
	import { page } from '$app/stores';
	import {
		getAttributePage,
		getAttributeOccurrences,
		type AttributePage,
		type AttributeOccurrence
	} from '$lib';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { attrColors } from '$lib/attrColors';
	import { t } from '$lib/i18n';

	const attrType = $derived($page.params.attr_type ?? '');
	const attrValue = $derived($page.params.attr_value ?? '');

	const attrPage = $derived(getAttributePage(attrType, attrValue));
	const occurrences = $derived(getAttributeOccurrences(attrType, attrValue));

	const displayTitle = $derived(attrPage?.title ?? attrValue.replaceAll('_', ' '));
</script>

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<Breadcrumb.Root class="mb-6">
		<Breadcrumb.List class="text-sm text-stone-500 dark:text-stone-400">
			<Breadcrumb.Item>
				<Breadcrumb.Link href="/" class="hover:text-stone-600 dark:hover:text-stone-300">{t('nav.sources')}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator>/</Breadcrumb.Separator>
			<Breadcrumb.Item>
				<Breadcrumb.Link href="/attributes" class="hover:text-stone-600 dark:hover:text-stone-300">{t('nav.attributes')}</Breadcrumb.Link>
			</Breadcrumb.Item>
			<Breadcrumb.Separator>/</Breadcrumb.Separator>
			<Breadcrumb.Item>
				<Breadcrumb.Page class="text-stone-600 dark:text-stone-300">{displayTitle}</Breadcrumb.Page>
			</Breadcrumb.Item>
		</Breadcrumb.List>
	</Breadcrumb.Root>

	<div class="mb-6">
		<Badge class="mb-2 rounded-full font-normal {attrColors(attrType)}">
			{t(`attributes.types.${attrType}`)}
		</Badge>
		<h1 class="text-2xl font-serif font-bold text-stone-800 dark:text-stone-100">{displayTitle}</h1>
	</div>

	{#if attrPage}
		<div class="prose prose-stone dark:prose-invert max-w-none mb-10 font-serif leading-relaxed text-stone-700 dark:text-stone-300">
			{@html attrPage.content}
		</div>
	{/if}

	{#if occurrences.length > 0}
		<section>
			<h2 class="text-lg font-serif text-stone-700 dark:text-stone-300 mb-4">
				{t('attributes.passagesHeading')} ({occurrences.length})
			</h2>
			<div class="space-y-4">
				{#each occurrences as occ}
					<div class="border border-stone-200 dark:border-stone-700 rounded-lg p-4">
						<div class="text-sm text-stone-500 dark:text-stone-400 mb-2">
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
						<div lang="la" class="font-serif text-stone-800 dark:text-stone-200 leading-relaxed">
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
			{t('attributes.noOccurrences')}
		</p>
	{/if}
</main>
