<script lang="ts">
	import { page } from '$app/stores';
	import { getTopicPage, getTopicOccurrences } from '$lib';
	import Breadcrumbs from '$lib/Breadcrumbs.svelte';
	import Reader from '$lib/Reader.svelte';
	import ScriptureModal from '$lib/ScriptureModal.svelte';
	import { recordPage } from '$lib/trail.svelte.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { groupByBook } from '$lib/utils';
	import { occurrencesToBlocks } from '$lib/reader';
	import { isLargeViewport } from '$lib/viewport.svelte.js';
	import { topicColors } from '$lib/topicColors';
	import { t, getCorpusLang, getUiLang, getParallelReader } from '$lib/i18n';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import Columns2 from '@lucide/svelte/icons/columns-2';
	import { studyHref } from '$lib/study';
	import { getWideLayout } from '$lib/wide.svelte.js';

	const topicType = $derived($page.params.topic_type ?? '');
	// Canonical URL is /topics/<type>/<topic_value> (the source-file value).
	// Unknown values fall through and the template renders the "no page" state.
	const topicValue = $derived($page.params.topic_value ?? '');
	const corpusLang = $derived(getCorpusLang());
	const uiLang = $derived(getUiLang());

	// Parallel needs both Latin and translation per passage (the reader feeds the
	// original column from content_la), so it only engages once a translation is
	// selected and the viewport is wide enough — same gate as the chapter reader.
	const large = isLargeViewport();
	const parallel = $derived(getParallelReader() && corpusLang !== 'la' && large.current);

	// Topic page chrome (description, body) follows the UI language;
	// the occurrence list shows source-corpus material (book/chapter titles,
	// paragraph bodies), so it follows the corpus language instead.
	const topicPage = $derived(getTopicPage(topicType, topicValue, uiLang));
	const occurrences = $derived(getTopicOccurrences(topicType, topicValue, corpusLang));
	const bookGroups = $derived(groupByBook(occurrences));

	const displayTitle = $derived(topicPage?.description ?? topicValue.replaceAll('_', ' '));

	// Collapse state: expanded book ids, default all collapsed. The count in each
	// header lets a reader gauge weight without expanding.
	let expanded = $state(new Set<string>());
	function toggleBook(bookId: string) {
		const next = new Set(expanded);
		if (!next.delete(bookId)) next.add(bookId);
		expanded = next;
	}

	// Arriving via a deep link to a specific passage: reveal its book so the
	// target isn't hidden inside a collapsed container.
	$effect(() => {
		const hash = location.hash.slice(1);
		if (!hash) return;
		const owner = occurrences.find((o) => o.paragraph_id === hash);
		if (owner && !expanded.has(owner.book_id)) expanded = new Set([...expanded, owner.book_id]);
	});

	// Selected scripture ref for the single page-level modal; the readers below
	// emit it upward (they never own a modal of their own).
	let scriptureRef = $state<string | null>(null);

	$effect(() => {
		// Only real topics become waypoints; the unknown-slug fallback does not.
		if (!topicPage && occurrences.length === 0) return;
		const href = `/topics/${topicType}/${topicValue}`;
		recordPage([{ id: href, label: displayTitle, href }]);
	});
</script>

<main id="main-content" tabindex="-1" class="{parallel ? (getWideLayout() ? 'max-w-none' : 'max-w-6xl') : 'max-w-3xl'} mx-auto px-4 py-8">
	<Breadcrumbs />

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
			<div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-lg font-display text-foreground">
					{t('topics.passagesHeading')} ({occurrences.length})
				</h2>
				<!-- Discreet hand-off: the study view opens with this topic as a
				     filter, listing the same passages in its two-pane reader. -->
				<a
					href={studyHref({ topics: [`${topicType}:${topicValue}`] })}
					class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
				>
					<Columns2 class="h-3.5 w-3.5" />
					{t('study.openInStudy')}
				</a>
			</div>
			<div class="space-y-6">
				{#each bookGroups as bg}
					{@const isOpen = expanded.has(bg.book_id)}
					<div>
						<button
							type="button"
							onclick={() => toggleBook(bg.book_id)}
							aria-expanded={isOpen}
							aria-controls="book-{bg.book_id}"
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
							<div id="book-{bg.book_id}" class="space-y-6">
								{#each bg.chapters as cg}
									<div>
										<a
											href="/book/{cg.book_id}/{cg.chapter_id}"
											class="text-sm font-display text-muted-foreground hover:text-primary"
										>
											{cg.chapter_title}
										</a>
										<hr class="divider-chapter" />
										<Reader
											blocks={occurrencesToBlocks(cg.items)}
											bookId={cg.book_id}
											chapterId={cg.chapter_id}
											bookTitle={cg.book_title}
											chapterTitle={cg.chapter_title}
											{corpusLang}
											{parallel}
											editing={false}
											onScriptureRef={(to) => (scriptureRef = to)}
										/>
									</div>
								{/each}
							</div>
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

	<ScriptureModal bind:to={scriptureRef} />
</main>
