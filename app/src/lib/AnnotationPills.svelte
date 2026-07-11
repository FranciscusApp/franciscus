<script lang="ts">
	import type { Annotation } from '$lib/types';
	import { topicColors } from '$lib/topicColors';
	import { t } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Plus from '@lucide/svelte/icons/plus';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import * as edits from '$lib/edits.svelte.js';
	import { isRelation } from '$lib/annotationDiff';
	import Modal from '$lib/Modal.svelte';

	// Renders a paragraph's topic pills. Read-only mode (`editing = false`) matches
	// the plain reader: pills link to their topic pages. Edit mode adds the four
	// confirm-gated ops (remove / add / verify / comment) from the plan; every
	// staged change is reflected here in place, so this row and "My Contributions"
	// are two views of the same buffer.
	let {
		bookId,
		paragraphId,
		annotations,
		topicLabel,
		candidates,
		editing
	}: {
		bookId: string;
		paragraphId: string;
		annotations: Annotation[];
		topicLabel: (type: string, value: string) => string;
		/** Full DB topic set for the add-picker: `{ type, value, label }`. */
		candidates: { type: string; value: string; label: string }[];
		editing: boolean;
	} = $props();

	// At most one interaction open at a time (kept deliberately simple). The
	// popover edits one topic; `allowVerify` is on only for AI annotations (a
	// human verifies the AI's work — a pending-add is already human-authored).
	let popover = $state<{ type: string; value: string; allowVerify: boolean } | null>(null);
	let pickerOpen = $state(false);
	let pickerFilter = $state('');
	let pickerInput = $state<HTMLInputElement | null>(null);

	// Draft state for the verify/comment popover, seeded from buffer + source.
	let draftVerified = $state(false);
	let draftComment = $state('');
	// Seeded values, so we know when the draft is dirty (edited but unsaved).
	let seedVerified = $state(false);
	let seedComment = $state('');
	let popoverEl = $state<HTMLElement | null>(null);
	const dirty = $derived(
		!!popover && (draftVerified !== seedVerified || draftComment !== seedComment)
	);

	// Close the popover on a click outside it — unless the draft has unsaved edits.
	$effect(() => {
		if (!popover) return;
		const onDown = (e: PointerEvent) => {
			if (!dirty && popoverEl && !popoverEl.contains(e.target as Node)) popover = null;
		};
		document.addEventListener('pointerdown', onDown, true);
		return () => document.removeEventListener('pointerdown', onDown, true);
	});

	function typeName(type: string): string {
		return t(`topics.types.${type}`).toLowerCase();
	}

	function isVerified(a: Annotation): boolean {
		return edits.pendingVerify(bookId, paragraphId, a.topic_type, a.topic_value) || a.provenance !== 'ai';
	}

	/** Open the editor for one topic. `allowVerify` gates the verify toggle;
	 * `sourceComment` seeds the field when nothing is staged yet. */
	function openPopover(type: string, value: string, allowVerify: boolean, sourceComment = '') {
		popover = { type, value, allowVerify };
		seedVerified = allowVerify && edits.pendingVerify(bookId, paragraphId, type, value);
		seedComment = edits.pendingComment(bookId, paragraphId, type, value) ?? sourceComment;
		draftVerified = seedVerified;
		draftComment = seedComment;
	}
	function savePopover() {
		if (!popover) return;
		const { type, value, allowVerify } = popover;
		if (allowVerify) edits.setVerify(bookId, paragraphId, type, value, draftVerified);
		edits.setComment(bookId, paragraphId, type, value, draftComment);
		popover = null;
	}

	function addTopic(type: string, value: string) {
		edits.stageAdd(bookId, paragraphId, type, value);
		pickerOpen = false;
		pickerFilter = '';
	}

	// Topics not already present (as annotations or pending adds) — the pickable set.
	const takenKeys = $derived(
		new Set([
			...annotations.map((a) => `${a.topic_type}:${a.topic_value}`),
			...edits.pendingAdds(bookId, paragraphId).map((e) => `${e.topic_type}:${e.topic_value}`)
		])
	);
	const filteredCandidates = $derived.by(() => {
		const q = pickerFilter.trim().toLowerCase();
		return candidates
			.filter((c) => !takenKeys.has(`${c.type}:${c.value}`))
			.filter((c) => !q || c.label.toLowerCase().includes(q) || c.value.includes(q))
			.slice(0, 60);
	});

	// Start each picker session with an empty filter (closing discards the query).
	$effect(() => {
		if (!pickerOpen) pickerFilter = '';
	});

	// The buffer also holds relation adds (RelationPills renders those).
	const adds = $derived(
		edits.pendingAdds(bookId, paragraphId).filter((e) => !isRelation(e.topic_type))
	);
	// Edit mode always shows the row: the add button must be reachable even on a
	// paragraph with no annotations yet.
	const hasAny = $derived(annotations.length > 0 || editing);
</script>

{#if hasAny}
	<div class="mt-1 ml-0 sm:ml-10 flex flex-wrap items-center gap-1">
		{#each annotations as a}
			{@const removed = edits.pendingRemoval(bookId, paragraphId, a.topic_type, a.topic_value)}
			{@const verified = isVerified(a)}
			{@const commented =
				edits.pendingComment(bookId, paragraphId, a.topic_type, a.topic_value) !== null}
			{#if !editing}
				<a
					href="/topics/{a.topic_type}/{a.topic_value}"
					class="inline-block max-w-full break-words text-xs px-2 py-0.5 rounded-full no-underline transition-colors {topicColors(
						a.topic_type,
						true
					)}"
					title={a.comment ?? ''}
				>
					{topicLabel(a.topic_type, a.topic_value)} ({typeName(a.topic_type)}{a.provenance !== 'ai'
						? ' ✓'
						: ''})
				</a>
			{:else}
				<span
					class="inline-flex items-center gap-0.5 max-w-full text-xs rounded-full {removed
						? 'border border-dashed border-muted-foreground/60 text-muted-foreground line-through'
						: topicColors(a.topic_type)} {commented && !removed ? 'ring-1 ring-current' : ''}"
				>
					{#if a.provenance === 'ai'}
						<button
							type="button"
							onclick={() => openPopover(a.topic_type, a.topic_value, true, a.comment ?? '')}
							class="pl-2 py-0.5 break-words rounded-l-full focus:outline-none focus:ring-2 focus:ring-ring"
							title={edits.pendingComment(bookId, paragraphId, a.topic_type, a.topic_value) ??
								a.comment ??
								t('edit.editAnnotation')}
						>
							{topicLabel(a.topic_type, a.topic_value)} ({typeName(a.topic_type)}{verified
								? ' ✓'
								: ''})
						</button>
					{:else}
						<!-- Human-authored annotation — body is inert, remove only. -->
						<span class="pl-2 py-0.5 break-words rounded-l-full" title={a.comment ?? ''}>
							{topicLabel(a.topic_type, a.topic_value)} ({typeName(a.topic_type)} ✓)
						</span>
					{/if}
					{#if removed}
						<button
							type="button"
							onclick={() =>
								edits.unstage({
									book_id: bookId,
									paragraph_id: paragraphId,
									topic_type: a.topic_type,
									topic_value: a.topic_value,
									op: 'remove'
								})}
							aria-label={t('edit.undo')}
							class="pr-1.5 pl-0.5 py-0.5 rounded-r-full hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring"
						>
							<Undo2 class="w-3 h-3" />
						</button>
					{:else}
						<!-- Single click stages the removal (struck-through, undoable) — no
						     confirm step; nothing reaches GitHub until the PR is opened. -->
						<button
							type="button"
							onclick={() => edits.stageRemove(bookId, paragraphId, a.topic_type, a.topic_value)}
							aria-label={t('edit.remove')}
							class="pr-1.5 pl-0.5 py-0.5 rounded-r-full hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring"
						>
							<X class="w-3 h-3" />
						</button>
					{/if}
				</span>
			{/if}
		{/each}

		{#if editing}
			{#each adds as e}
				{@const commented =
					edits.pendingComment(bookId, paragraphId, e.topic_type, e.topic_value) !== null}
				<span
					class="inline-flex items-center gap-0.5 text-xs rounded-full border border-dashed border-current px-1 py-0.5 {topicColors(
						e.topic_type
					)} {commented ? 'ring-1 ring-current' : ''}"
				>
					<button
						type="button"
						onclick={() => openPopover(e.topic_type, e.topic_value, false)}
						class="pl-1 break-words rounded-l-full focus:outline-none focus:ring-2 focus:ring-ring"
						title={edits.pendingComment(bookId, paragraphId, e.topic_type, e.topic_value) ??
							t('edit.editAnnotation')}
					>
						{topicLabel(e.topic_type, e.topic_value)} ({typeName(e.topic_type)})
					</button>
					<button
						type="button"
						onclick={() => edits.clearTarget(bookId, paragraphId, e.topic_type, e.topic_value)}
						aria-label={t('edit.undo')}
						class="pl-0.5 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<X class="w-3 h-3" />
					</button>
				</span>
			{/each}

			<button
				type="button"
				onclick={() => (pickerOpen = true)}
				aria-label={t('edit.add')}
				aria-expanded={pickerOpen}
				aria-haspopup="dialog"
				class="inline-flex items-center rounded-full border border-dashed border-muted-foreground/50 px-1.5 py-0.5 text-muted-foreground hover:text-primary hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
			>
				<Plus class="w-3.5 h-3.5" />
			</button>
			<!-- Add-topic picker: a centered modal (not an inline dropdown), so the
			     list is searchable comfortably on mobile and can't overflow small
			     screens. -->
			<Modal bind:open={pickerOpen} title={t('edit.add')} initialFocus={() => pickerInput}>
				<input
					type="text"
					bind:this={pickerInput}
					bind:value={pickerFilter}
					placeholder={t('edit.searchTopics')}
					class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
				/>
				<ul class="mt-2 max-h-[50vh] overflow-y-auto">
					{#each filteredCandidates as c (`${c.type}:${c.value}`)}
						<li>
							<button
								type="button"
								onclick={() => addTopic(c.type, c.value)}
								class="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus:outline-none focus:bg-accent"
							>
								<span
									class="inline-block h-2 w-2 shrink-0 rounded-full {topicColors(c.type)}"
								></span>
								<span class="truncate text-foreground">{c.label}</span>
								<span class="ml-auto shrink-0 text-xs text-muted-foreground"
									>{typeName(c.type)}</span
								>
							</button>
						</li>
					{:else}
						<li class="px-2 py-1 text-sm text-muted-foreground">{t('edit.noTopics')}</li>
					{/each}
				</ul>
			</Modal>
		{/if}
	</div>

	{#if popover}
		{@const p = popover}
		<div
			bind:this={popoverEl}
			class="mt-2 ml-0 sm:ml-10 rounded-md border border-border bg-popover p-3 shadow-sm"
		>
			<p class="mb-2 text-sm font-medium text-foreground">
				{topicLabel(p.type, p.value)} ({typeName(p.type)})
			</p>
			{#if p.allowVerify}
				<label class="mb-2 flex items-center gap-2 text-sm text-foreground">
					<input type="checkbox" bind:checked={draftVerified} class="h-4 w-4 rounded border-border" />
					{t('edit.verifyLabel')}
				</label>
			{/if}
			<label class="block text-sm text-foreground">
				<span class="mb-1 block text-xs text-muted-foreground">{t('edit.commentLabel')}</span>
				<textarea
					bind:value={draftComment}
					rows="2"
					class="w-full rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
				></textarea>
			</label>
			<div class="mt-2 flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (popover = null)}
					class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<X class="w-4 h-4" /> {t('edit.cancel')}
				</button>
				<button
					type="button"
					onclick={savePopover}
					class="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-sm text-background hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<Check class="w-4 h-4" /> {t('edit.confirm')}
				</button>
			</div>
		</div>
	{/if}
{/if}
