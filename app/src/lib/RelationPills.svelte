<script lang="ts">
	import type { RelationLink } from '$lib/db';
	import { getChapters, getParagraphs } from '$lib';
	import { t, getCorpusLang } from '$lib/i18n';
	import * as edits from '$lib/edits.svelte.js';
	import { isRelation } from '$lib/annotationDiff';
	import Modal from '$lib/Modal.svelte';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import X from '@lucide/svelte/icons/x';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Check from '@lucide/svelte/icons/check';

	// Renders a paragraph's cross-work relations (parallel passages), the
	// counterpart of AnnotationPills for the relations table. Read mode links to
	// the other passage. Edit mode stages relation add/remove in the shared edit
	// buffer: a relation edit reuses the Edit shape with `topic_type` = reltype
	// and `topic_value` = the fully-qualified target key `<book>-<paragraph>`
	// (spec: annotations.md) — annotationDiff already writes these to the sidecar.
	let {
		bookId,
		paragraphId,
		relations,
		books,
		editing
	}: {
		bookId: string;
		paragraphId: string;
		relations: RelationLink[];
		/** Corpus book list for the target picker: `{ id, title }`. */
		books: { id: string; title: string }[];
		editing: boolean;
	} = $props();

	const corpusLang = $derived(getCorpusLang());

	function relTypeLabel(type: string): string {
		return t(`relations.types.${type}`);
	}

	function targetKey(r: RelationLink): string {
		return `${r.other_book_id}-${r.other_paragraph_id}`;
	}

	function passageLabel(r: RelationLink): string {
		const book = r.other_book_title ?? r.other_book_id;
		return `${book} §${r.other_paragraph_label ?? r.other_paragraph_id}`;
	}

	function href(r: RelationLink): string | null {
		if (!r.other_chapter_id) return null; // target not in this corpus build
		return `/book/${r.other_book_id}/${r.other_chapter_id}#${r.other_paragraph_id}`;
	}

	// --- add-relation modal -------------------------------------------------

	let modalOpen = $state(false);
	let relType = $state('same_episode');
	let targetBook = $state('');
	let targetChapter = $state('');
	let targetPara = $state('');

	const targetChapters = $derived(targetBook ? getChapters(targetBook, corpusLang) : []);
	const targetParagraphs = $derived(
		targetBook && targetChapter ? getParagraphs(targetBook, targetChapter) : []
	);

	// Reset each picker session; also guards stale chapter/paragraph selections.
	$effect(() => {
		if (!modalOpen) {
			relType = 'same_episode';
			targetBook = '';
			targetChapter = '';
			targetPara = '';
		}
	});

	const selfTarget = $derived(`${targetBook}-${targetPara}` === `${bookId}-${paragraphId}`);
	const canStage = $derived(!!targetBook && !!targetChapter && !!targetPara && !selfTarget);

	function stage() {
		if (!canStage) return;
		edits.stageAdd(bookId, paragraphId, relType, `${targetBook}-${targetPara}`);
		modalOpen = false;
	}

	// Pending relation adds on this paragraph (the shared buffer also holds topic
	// adds — filter to relation types).
	const adds = $derived(
		edits.pendingAdds(bookId, paragraphId).filter((e) => isRelation(e.topic_type))
	);

	// Resolve a pending add's target for display: "Book §para" when the book is
	// known, else the raw key.
	function addLabel(e: edits.Edit): string {
		const dash = e.topic_value.indexOf('-');
		if (dash <= 0) return e.topic_value;
		const book = e.topic_value.slice(0, dash);
		const para = e.topic_value.slice(dash + 1);
		const title = books.find((b) => b.id === book)?.title ?? book;
		return `${title} §${para}`;
	}

	const hasAny = $derived(relations.length > 0 || editing);

	const pillBase =
		'inline-flex items-center gap-1 max-w-full text-xs rounded-full border border-border px-2 py-0.5 text-muted-foreground';
</script>

{#if hasAny}
	<div class="mt-1 ml-0 sm:ml-10 flex flex-wrap items-center gap-1">
		{#each relations as r (`${r.direction}:${r.relation_type}:${targetKey(r)}`)}
			{@const removed =
				r.direction === 'out' &&
				edits.pendingRemoval(bookId, paragraphId, r.relation_type, targetKey(r))}
			{@const link = href(r)}
			{#if !editing}
				{#if link}
					<a
						href={link}
						class="{pillBase} no-underline transition-colors hover:border-ring hover:text-primary"
						title={r.comment ?? relTypeLabel(r.relation_type)}
					>
						<ArrowRightLeft class="h-3 w-3 shrink-0" />
						<span class="break-words">{passageLabel(r)}</span>
						<span class="opacity-70">({relTypeLabel(r.relation_type).toLowerCase()}{r.provenance !== 'ai' ? ' ✓' : ''})</span>
					</a>
				{:else}
					<span class="{pillBase}" title={t('relations.missingTarget')}>
						<ArrowRightLeft class="h-3 w-3 shrink-0" />
						<span class="break-words">{passageLabel(r)}</span>
						<span class="opacity-70">({relTypeLabel(r.relation_type).toLowerCase()})</span>
					</span>
				{/if}
			{:else}
				<span
					class="{pillBase} {removed
						? 'border-dashed line-through'
						: ''}"
					title={r.direction === 'in' ? t('relations.incoming') : r.comment ?? ''}
				>
					<ArrowRightLeft class="h-3 w-3 shrink-0" />
					<span class="break-words">{passageLabel(r)}</span>
					<span class="opacity-70">({relTypeLabel(r.relation_type).toLowerCase()}{r.provenance !== 'ai' ? ' ✓' : ''})</span>
					{#if r.direction === 'out'}
						{#if removed}
							<button
								type="button"
								onclick={() =>
									edits.unstage({
										book_id: bookId,
										paragraph_id: paragraphId,
										topic_type: r.relation_type,
										topic_value: targetKey(r),
										op: 'remove'
									})}
								aria-label={t('edit.undo')}
								class="rounded-full py-0.5 pl-0.5 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring"
							>
								<Undo2 class="h-3 w-3" />
							</button>
						{:else}
							<button
								type="button"
								onclick={() =>
									edits.stageRemove(bookId, paragraphId, r.relation_type, targetKey(r))}
								aria-label={t('relations.remove')}
								class="rounded-full py-0.5 pl-0.5 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring"
							>
								<X class="h-3 w-3" />
							</button>
						{/if}
					{/if}
				</span>
			{/if}
		{/each}

		{#if editing}
			{#each adds as e (`${e.topic_type}:${e.topic_value}`)}
				<span class="{pillBase} border-dashed">
					<ArrowRightLeft class="h-3 w-3 shrink-0" />
					<span class="break-words">{addLabel(e)}</span>
					<span class="opacity-70">({relTypeLabel(e.topic_type).toLowerCase()})</span>
					<button
						type="button"
						onclick={() => edits.clearTarget(bookId, paragraphId, e.topic_type, e.topic_value)}
						aria-label={t('edit.undo')}
						class="rounded-full py-0.5 pl-0.5 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<X class="h-3 w-3" />
					</button>
				</span>
			{/each}

			<button
				type="button"
				onclick={() => (modalOpen = true)}
				aria-label={t('relations.add')}
				aria-haspopup="dialog"
				title={t('relations.add')}
				class="inline-flex items-center rounded-full border border-dashed border-muted-foreground/50 px-1.5 py-0.5 text-muted-foreground hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring"
			>
				<ArrowRightLeft class="h-3.5 w-3.5" />
			</button>

			<Modal bind:open={modalOpen} title={t('relations.add')}>
				<div class="space-y-3">
					<label class="block text-sm">
						<span class="mb-1 block text-xs text-muted-foreground">{t('relations.typeLabel')}</span>
						<select
							bind:value={relType}
							class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
						>
							<option value="same_episode">{t('relations.types.same_episode')}</option>
							<option value="related_to">{t('relations.types.related_to')}</option>
						</select>
					</label>
					<label class="block text-sm">
						<span class="mb-1 block text-xs text-muted-foreground">{t('relations.bookLabel')}</span>
						<select
							bind:value={targetBook}
							onchange={() => {
								targetChapter = '';
								targetPara = '';
							}}
							class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
						>
							<option value="" disabled>{t('relations.choose')}</option>
							{#each books as b (b.id)}
								<option value={b.id}>{b.title}</option>
							{/each}
						</select>
					</label>
					{#if targetBook}
						<label class="block text-sm">
							<span class="mb-1 block text-xs text-muted-foreground">{t('relations.chapterLabel')}</span>
							<select
								bind:value={targetChapter}
								onchange={() => (targetPara = '')}
								class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
							>
								<option value="" disabled>{t('relations.choose')}</option>
								{#each targetChapters as c (c.id)}
									<option value={c.id}>{c.title}</option>
								{/each}
							</select>
						</label>
					{/if}
					{#if targetChapter}
						<label class="block text-sm">
							<span class="mb-1 block text-xs text-muted-foreground">{t('relations.paragraphLabel')}</span>
							<select
								bind:value={targetPara}
								class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground"
							>
								<option value="" disabled>{t('relations.choose')}</option>
								{#each targetParagraphs as p (p.id)}
									<option value={p.id}>§{p.label ?? p.id}</option>
								{/each}
							</select>
						</label>
					{/if}
					<div class="flex justify-end">
						<button
							type="button"
							onclick={stage}
							disabled={!canStage}
							class="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-sm text-background hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
						>
							<Check class="h-4 w-4" /> {t('edit.confirm')}
						</button>
					</div>
				</div>
			</Modal>
		{/if}
	</div>
{/if}
