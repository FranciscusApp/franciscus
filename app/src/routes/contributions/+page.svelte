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
	import {
		submitContribution,
		listUserPrs,
		getPrDraft,
		CC0_NOTICE,
		type UserPr,
		type PrDraft
	} from '$lib/contribute';

	// Client-only (edits live in localStorage), so mount-gate it.
	let mounted = $state(false);
	// Remote state — the user's PRs (open + history).
	let prs = $state<UserPr[]>([]);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let submittedUrl = $state<string | null>(null);

	// Review step: a draft is prepared (no writes) so the user can review/edit the
	// PR message before anything is pushed. The CC0 notice is shown locked.
	let reviewOpen = $state(false);
	let preparing = $state(false);
	let draft = $state<PrDraft | null>(null);
	let reviewTitle = $state('');
	let reviewBody = $state('');

	async function loadPrs() {
		const u = github.getUser();
		const tok = github.getToken();
		if (!u || !tok) return;
		try {
			prs = await listUserPrs(tok, u.login);
		} catch {
			/* non-fatal: the remote list just stays empty */
		}
	}

	onMount(async () => {
		mounted = true;
		await github.revalidate();
		await loadPrs();
	});

	// Open the review step: prepare the draft (create vs append) and prefill.
	async function openReview() {
		const u = github.getUser();
		const tok = github.getToken();
		if (!u || !tok || preparing || submitting) return;
		preparing = true;
		submitError = null;
		submittedUrl = null;
		try {
			draft = await getPrDraft(tok, u.login, getEdits(), getProseEdits());
			reviewTitle = draft.title;
			reviewBody = draft.body;
			reviewOpen = true;
		} catch (e) {
			submitError = e instanceof Error ? e.message : String(e);
		} finally {
			preparing = false;
		}
	}

	function cancelReview() {
		reviewOpen = false;
		draft = null;
	}

	// Confirm the review → run the actual write path.
	async function confirmSubmit() {
		const u = github.getUser();
		const tok = github.getToken();
		if (!u || !tok || submitting) return;
		submitting = true;
		submitError = null;
		submittedUrl = null;
		try {
			const url = await submitContribution(tok, u.login, getEdits(), getProseEdits(), {
				title: reviewTitle,
				body: reviewBody,
				name: u.name,
				email: u.email
			});
			submittedUrl = url;
			clearAll();
			reviewOpen = false;
			draft = null;
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

	// Split the PR list into the open section (top) and the history section
	// (closed + merged, bottom). GitHub returns newest-first.
	const openPrs = $derived(prs.filter((p) => p.state === 'open'));
	const historyPrs = $derived(prs.filter((p) => p.state !== 'open'));
	// An open PR from this flow means the next submit appends to it (not a new PR).
	const appendTarget = $derived(openPrs.find((p) => p.fromFlow) ?? null);

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

<main id="main-content" tabindex="-1" class="w-full max-w-3xl mx-auto px-4 py-8">
	<h1 class="text-2xl font-display font-bold text-foreground mb-6">{t('contributions.heading')}</h1>

	<NoScriptNotice />

	{#if !mounted}
		<!-- placeholder until client mount; no-JS sees the notice above -->
	{:else if !github.isConnected()}
		<p class="text-muted-foreground">{t('contributions.notConnected')}</p>
	{:else}
		{@const user = github.getUser()}
		{#if user}
			<div class="mb-8 flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
				<img
					src={user.avatarUrl}
					alt=""
					width="40"
					height="40"
					class="h-10 w-10 shrink-0 rounded-full"
				/>
				<div class="min-w-0 flex-1">
					<a
						href={user.htmlUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="block truncate font-medium text-foreground underline decoration-transparent hover:decoration-inherit"
					>
						{user.name ?? user.login}
					</a>
					<div class="truncate text-sm text-muted-foreground">@{user.login}</div>
				</div>
				<button
					type="button"
					onclick={() => github.disconnect()}
					aria-label={t('pages.contribute.disconnect')}
					title={t('pages.contribute.disconnect')}
					class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring sm:px-3"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="size-4 sm:hidden"
						aria-hidden="true"
					>
						<path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
						<path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
						<line x1="8" x2="8" y1="2" y2="4" />
						<line x1="2" x2="4" y1="8" y2="8" />
						<line x1="16" x2="16" y1="20" y2="22" />
						<line x1="20" x2="22" y1="16" y2="16" />
					</svg>
					<span class="hidden sm:inline">{t('pages.contribute.disconnect')}</span>
				</button>
			</div>
		{/if}

		{#if submittedUrl}
			<p class="mb-6 rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
				{t('contributions.submitted')}
				<a href={submittedUrl} target="_blank" rel="noopener noreferrer" class="break-all underline"
					>{submittedUrl}</a
				>
			</p>
		{/if}

		<!-- 1. Open pull requests (if any) -->
		{#if openPrs.length > 0}
			<section class="mb-8">
				<h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 mb-3">
					{t('contributions.openPrsHeading')}
				</h2>
				<ul class="space-y-1.5">
					{#each openPrs as pr (pr.number)}
						<li class="flex items-center gap-2 text-sm">
							<a
								href={pr.url}
								target="_blank"
								rel="noopener noreferrer"
								class="shrink-0 underline">#{pr.number}</a
							>
							<span class="min-w-0 flex-1 truncate text-foreground">{pr.title}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- 2. Staged edits + 3. append/create button -->
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
					onclick={openReview}
					disabled={preparing || submitting}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
				>
					{#if preparing}
						{t('contributions.preparing')}
					{:else if appendTarget}
						{t('contributions.appendSubmit')}
					{:else}
						{t('contributions.submit')}
					{/if}
				</button>
				<p class="mt-2 text-xs text-muted-foreground">
					{appendTarget ? t('contributions.appendHint') : t('contributions.submitHint')}
				</p>
			</section>
		{/if}

		<!-- 4. History (closed + merged) -->
		{#if historyPrs.length > 0}
			<section class="mt-10 border-t border-border pt-6">
				<h2 class="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80 mb-3">
					{t('contributions.historyHeading')}
				</h2>
				<ul class="space-y-1.5">
					{#each historyPrs as pr (pr.number)}
						<li class="flex items-center gap-2 text-sm">
							<span
								class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium {pr.state === 'merged'
									? 'bg-primary/10 text-primary'
									: 'bg-muted text-muted-foreground'}"
							>
								{pr.state === 'merged'
									? t('contributions.stateMerged')
									: t('contributions.stateClosed')}
							</span>
							<a
								href={pr.url}
								target="_blank"
								rel="noopener noreferrer"
								class="shrink-0 underline">#{pr.number}</a
							>
							<span class="min-w-0 flex-1 truncate text-foreground">{pr.title}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Review step: editable PR message with a locked CC0 dedication -->
		{#if reviewOpen && draft}
			<div
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
				role="dialog"
				aria-modal="true"
				aria-labelledby="review-heading"
			>
				<div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-xl">
					<h2 id="review-heading" class="mb-4 text-lg font-display font-semibold text-foreground">
						{t('contributions.reviewHeading')}
					</h2>

					{#if draft.mode === 'append'}
						<p class="mb-4 text-sm text-muted-foreground">
							{t('contributions.reviewAppendNotice')}
							<a
								href={draft.prUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="underline">#{draft.prNumber}</a
							>
						</p>
					{:else}
						<label class="mb-3 block">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
								>{t('contributions.reviewTitleLabel')}</span
							>
							<input
								type="text"
								bind:value={reviewTitle}
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							/>
						</label>
						<label class="mb-3 block">
							<span class="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
								>{t('contributions.reviewBodyLabel')}</span
							>
							<textarea
								bind:value={reviewBody}
								rows="5"
								class="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							></textarea>
						</label>
					{/if}

					<!-- CC0 dedication: always included, never editable -->
					<div class="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2">
						<div class="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="size-3.5"
								aria-hidden="true"
							>
								<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
								<path d="M7 11V7a5 5 0 0 1 10 0v4" />
							</svg>
							{t('contributions.reviewCc0Label')}
						</div>
						<p class="text-xs leading-relaxed text-muted-foreground">{CC0_NOTICE}</p>
					</div>

					{#if errorDisplay}
						<p class="mb-3 whitespace-pre-line text-sm text-destructive" role="alert">{errorDisplay}</p>
					{/if}

					<div class="flex justify-end gap-2">
						<button
							type="button"
							onclick={cancelReview}
							disabled={submitting}
							class="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
						>
							{t('contributions.reviewCancel')}
						</button>
						<button
							type="button"
							onclick={confirmSubmit}
							disabled={submitting}
							class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
						>
							{submitting
								? t('contributions.submitting')
								: draft.mode === 'append'
									? t('contributions.appendSubmit')
									: t('contributions.reviewConfirm')}
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</main>
