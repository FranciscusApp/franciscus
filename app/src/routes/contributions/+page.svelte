<script lang="ts">
	import { onMount } from 'svelte';
	import { t, getUiLang } from '$lib/i18n';
	import * as github from '$lib/github.svelte.js';
	import { getEdits, unstage, type Edit } from '$lib/edits.svelte.js';
	import { getDbState } from '$lib/dbState';
	import { getTopicDescriptions } from '$lib';
	import NoScriptNotice from '$lib/NoScriptNotice.svelte';
	import { topicColors } from '$lib/topicColors';

	// Phase 2 renders only the local staged-edits buffer; the fork/PR sections
	// land in Phase 4. Client-only (edits live in localStorage), so mount-gate it.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
		github.revalidate();
	});

	const db = getDbState();
	const uiLang = $derived(getUiLang());
	// Nice topic labels once the DB is loaded; the raw value is the fallback.
	const labels = $derived(db.ready ? getTopicDescriptions(uiLang) : new Map<string, string>());
	function topicLabel(type: string, value: string): string {
		return labels.get(`${type}:${value}`) ?? value.replaceAll('_', ' ');
	}

	const edits = $derived(getEdits());
	// Group by book, then paragraph, preserving insertion order.
	const grouped = $derived.by(() => {
		const byBook = new Map<string, Map<string, Edit[]>>();
		for (const e of edits) {
			const byPara = byBook.get(e.book_id) ?? new Map<string, Edit[]>();
			const list = byPara.get(e.paragraph_id) ?? [];
			list.push(e);
			byPara.set(e.paragraph_id, list);
			byBook.set(e.book_id, byPara);
		}
		return byBook;
	});
</script>

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<h1 class="text-2xl font-display font-bold text-foreground mb-6">{t('contributions.heading')}</h1>

	<NoScriptNotice />

	{#if !mounted}
		<!-- placeholder until client mount; no-JS sees the notice above -->
	{:else if !github.isConnected()}
		<p class="text-muted-foreground">{t('contributions.notConnected')}</p>
	{:else if edits.length === 0}
		<p class="text-muted-foreground">{t('contributions.empty')}</p>
	{:else}
		<section>
			<h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 mb-3">
				{t('contributions.localHeading')}
			</h2>
			<p class="mb-4 text-sm text-muted-foreground">{t('contributions.remoteSoon')}</p>

			{#each grouped as [bookId, byPara] (bookId)}
				<div class="mb-6">
					<h3 class="mb-2 font-serif font-medium text-foreground">{bookId}</h3>
					{#each byPara as [paraId, list] (paraId)}
						<div class="mb-3 rounded-lg border border-border p-3">
							<div class="mb-2 font-mono text-xs text-muted-foreground">{paraId}</div>
							<ul class="space-y-1.5">
								{#each list as e (`${e.topic_type}:${e.topic_value}:${e.op}`)}
									<li class="flex items-center gap-2 text-sm">
										<span
											class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium {topicColors(
												e.topic_type
											)}"
										>
											{t(`contributions.op.${e.op}`)}
										</span>
										<span class="min-w-0 flex-1 text-foreground">
											{topicLabel(e.topic_type, e.topic_value)}
											<span class="text-muted-foreground"
												>({t(`topics.types.${e.topic_type}`).toLowerCase()})</span
											>
											{#if e.op === 'comment' && e.comment}
												<span class="block truncate text-xs text-muted-foreground italic"
													>“{e.comment}”</span
												>
											{/if}
										</span>
										<button
											type="button"
											onclick={() => unstage(e)}
											class="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
										>
											{t('contributions.unstage')}
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/each}
		</section>
	{/if}
</main>
