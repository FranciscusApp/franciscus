<script lang="ts">
	import { splitDescription } from '$lib/truncateDescription';
	import { t } from '$lib/i18n';

	// Long cover descriptions collapse to their leading paragraphs with a
	// [read more] toggle. `html` is trusted, build-time-rendered Markdown
	// (see the book page), so {@html} is safe here.
	let { html }: { html: string } = $props();

	const split = $derived(splitDescription(html));
	let expanded = $state(false);

	// Collapse again when the description itself changes (e.g. the reader
	// switches UI language and a new blurb loads).
	$effect(() => {
		html;
		expanded = false;
	});
</script>

<div
	class="prose prose-stone dark:prose-invert max-w-none mt-4 font-serif leading-relaxed text-foreground"
>
	{#if split.truncated && !expanded}
		{@html split.preview}
	{:else}
		{@html html}
	{/if}
</div>
{#if split.truncated}
	<button
		type="button"
		class="mt-2 text-sm text-muted-foreground underline hover:text-primary transition-colors"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		{expanded ? t('book.readLess') : t('book.readMore')}
	</button>
{/if}
