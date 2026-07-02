<script lang="ts">
	import { onMount } from 'svelte';
	import { t, getUiLang } from '$lib/i18n';
	import * as github from '$lib/github.svelte.js';
	import {
		getEdits,
		getProseEdits,
		unstage,
		unstageProse,
		clearAll,
		type Edit,
		type ProseEdit
	} from '$lib/edits.svelte.js';
	import { getDbState } from '$lib/dbState';
	import { getTopicDescriptions } from '$lib';
	import NoScriptNotice from '$lib/NoScriptNotice.svelte';
	import { topicColors } from '$lib/topicColors';
	import { submitContribution, listOpenPrs, type OpenPr } from '$lib/contribute';

	// Client-only (edits live in localStorage), so mount-gate it.
	let mounted = $state(false);
	// Phase 4 remote state.
	let openPrs = $state<OpenPr[]>([]);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let submittedUrl = $state<string | null>(null);

	async function loadPrs() {
		const u = github.getUser();
		const tok = github.getToken();
		if (!u || !tok) return;
		try {
			openPrs = await listOpenPrs(tok, u.login);
		} catch {
			/* non-fatal: the remote list just stays empty */
		}
	}

	onMount(async () => {
		mounted = true;
		await github.revalidate();
		await loadPrs();
	});

	async function submit() {
		const u = github.getUser();
		const tok = github.getToken();
		if (!u || !tok || submitting) return;
		submitting = true;
		submitError = null;
		submittedUrl = null;
		try {
			const url = await submitContribution(tok, u.login, getEdits(), getProseEdits());
			submittedUrl = url;
			clearAll();
			await loadPrs();
		} catch (e) {
			submitError = e instanceof Error ? e.message : String(e);
		} finally {
			submitting = false;
		}
	}

	const db = getDbState();
	const uiLang = $derived(getUiLang());
	// Nice topic labels once the DB is loaded; the raw value is the fallback.
	const labels = $derived(db.ready ? getTopicDescriptions(uiLang) : new Map<string, string>());
	function topicLabel(type: string, value: string): string {
		return labels.get(`${type}:${value}`) ?? value.replaceAll('_', ' ');
	}

	// Map a raw error to display text: a known code gets a localized message, an
	// unexpected one shows a generic line plus the technical detail.
	const errorDisplay = $derived.by(() => {
		if (!submitError) return null;
		if (submitError === 'APP_NOT_INSTALLED') return t('contributions.errAppNotInstalled');
		if (submitError === 'EXISTING_NON_FORK') return t('contributions.errNotAFork');
		if (submitError === 'FORK_FAILED') return t('contributions.errForkFailed');
		return `${t('contributions.errGeneric')}\n${submitError}`;
	});

	const edits = $derived(getEdits());
	const proseEdits = $derived(getProseEdits());
	const hasEdits = $derived(edits.length > 0 || proseEdits.length > 0);
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
	// Prose edits grouped by book (each row is one paragraph/aside rendition).
	const proseByBook = $derived.by(() => {
		const byBook = new Map<string, ProseEdit[]>();
		for (const e of proseEdits) {
			const list = byBook.get(e.book_id) ?? [];
			list.push(e);
			byBook.set(e.book_id, list);
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
	{:else}
		{#if submittedUrl}
			<p class="mb-6 rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
				{t('contributions.submitted')}
				<a href={submittedUrl} target="_blank" rel="noopener noreferrer" class="underline"
					>{submittedUrl}</a
				>
			</p>
		{/if}

		{#if openPrs.length > 0}
			<section class="mb-8">
				<h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 mb-3">
					{t('contributions.openPrsHeading')}
				</h2>
				<ul class="space-y-1.5">
					{#each openPrs as pr (pr.number)}
						<li class="text-sm">
							<a href={pr.url} target="_blank" rel="noopener noreferrer" class="underline"
								>#{pr.number}</a
							>
							<span class="text-foreground">{pr.title}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if !hasEdits}
			<p class="text-muted-foreground">{t('contributions.empty')}</p>
		{:else}
		<section>
			<h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 mb-3">
				{t('contributions.localHeading')}
			</h2>

			{#if proseEdits.length > 0}
				<div class="mb-6">
					<h3 class="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
						{t('contributions.textHeading')}
					</h3>
					{#each proseByBook as [bookId, list] (bookId)}
						<div class="mb-3">
							<h4 class="mb-1 font-serif font-medium text-foreground">{bookId}</h4>
							<ul class="space-y-1.5">
								{#each list as e (`${e.lang}:${e.target_id}`)}
									<li class="flex items-center gap-2 text-sm">
										<span
											class="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
										>
											{t(`contributions.kind.${e.kind}`)}
										</span>
										<span class="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
											{e.target_id}
											<span class="text-muted-foreground">({e.lang})</span>
										</span>
										<button
											type="button"
											onclick={() => unstageProse(e.book_id, e.lang, e.target_id)}
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
			{/if}

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

			{#if errorDisplay}
				<div
					role="alert"
					class="mb-3 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive"
				>
					<p class="min-w-0 flex-1 whitespace-pre-line text-sm leading-relaxed">{errorDisplay}</p>
					<button
						type="button"
						onclick={() => (submitError = null)}
						aria-label={t('contributions.dismiss')}
						class="-mr-1 -mt-1 shrink-0 rounded-md p-1 hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="size-4"
							aria-hidden="true"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
			{/if}
			<button
				type="button"
				onclick={submit}
				disabled={submitting}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
			>
				{submitting ? t('contributions.submitting') : t('contributions.submit')}
			</button>
			<p class="mt-2 text-xs text-muted-foreground">{t('contributions.submitHint')}</p>
		</section>
		{/if}
	{/if}
</main>
