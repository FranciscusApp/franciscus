<script lang="ts">
	import { splitDescription } from '$lib/truncateDescription';
	import { t } from '$lib/i18n';

	// Long cover descriptions collapse to their leading paragraphs with a
	// [read more] toggle. `html` is trusted, build-time-rendered Markdown
	// (see the book page), so {@html} is safe here.
	//
	// The tail and toggle are always in the prerendered DOM; JS collapses the
	// tail on the client. Without JS the toggle is inert, so the <noscript>
	// style below reveals the full text and hides the button.
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

{#if split.truncated}
	<noscript>
		<style>
			.expandable-tail {
				display: block !important;
			}
			.expandable-toggle {
				display: none !important;
			}
		</style>
	</noscript>
{/if}

<div
	class="prose prose-stone dark:prose-invert max-w-none mt-4 font-serif leading-relaxed text-foreground"
>
	{@html split.preview}
	{#if split.truncated}
		<div class="expandable-tail" class:hidden={!expanded}>
			{@html split.rest}
		</div>
	{/if}
</div>
{#if split.truncated}
	<button
		type="button"
		class="expandable-toggle group mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:text-primary"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		<span
			aria-hidden="true"
			class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-sm font-semibold leading-none text-secondary-foreground transition-all duration-200 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground"
		>
			{expanded ? '−' : '+'}
		</span>
		{expanded ? t('book.readLess') : t('book.readMore')}
	</button>
{/if}
