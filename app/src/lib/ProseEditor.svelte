<script lang="ts">
	import { tick } from 'svelte';
	import { t } from '$lib/i18n';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import * as edits from '$lib/edits.svelte.js';
	import type { ProseEdit } from '$lib/edits.svelte';

	// Prose affordance: a pencil that opens a modal textarea holding the
	// paragraph/aside body in **source form** ([N] verse markers, literal <ref>).
	// Confirm stages a full-body ProseEdit; the reader reflects it in place. The
	// modal is self-contained — it owns its open state and writes the shared
	// buffer, so the reader only decides which body (staged vs original) to render.
	let {
		bookId,
		lang,
		chapterId,
		kind,
		targetId,
		originalText,
		editing
	}: {
		bookId: string;
		lang: string;
		chapterId: string;
		kind: ProseEdit['kind'];
		targetId: string;
		/** The current source-form body, used to seed the editor and to detect a
		 * no-op confirm (text unchanged ⇒ unstage rather than stage). */
		originalText: string;
		editing: boolean;
	} = $props();

	const staged = $derived(edits.pendingProse(bookId, lang, targetId));

	let open = $state(false);
	let draft = $state('');
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	async function openEditor() {
		draft = staged?.text ?? originalText;
		open = true;
		await tick();
		textareaEl?.focus();
	}

	function save() {
		const text = draft.replace(/\s+$/, '');
		if (text === originalText.replace(/\s+$/, '') || text.trim() === '') {
			// no net change (or emptied) — clear any prior staged edit for this target
			edits.unstageProse(bookId, lang, targetId);
		} else {
			edits.setProse({ book_id: bookId, lang, chapter_id: chapterId, kind, target_id: targetId, text });
		}
		open = false;
	}

	function discard() {
		edits.unstageProse(bookId, lang, targetId);
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

{#if editing}
	<button
		type="button"
		onclick={openEditor}
		aria-label={t('edit.editProse')}
		title={staged ? t('edit.edited') : t('edit.editProse')}
		class="p-1 pointer-coarse:p-2 rounded transition focus:outline-none focus:ring-2 focus:ring-ring {staged
			? 'text-primary opacity-100'
			: 'text-muted-foreground hover:text-primary opacity-40 group-hover:opacity-100 focus:opacity-100'}"
	>
		<Pencil class="w-4 h-4" />
	</button>
{/if}

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		onkeydown={onKeydown}
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && (open = false)}
	>
		<div
			class="w-full max-w-2xl rounded-lg border border-border bg-popover p-4 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-label={t('edit.editProse')}
		>
			<p class="mb-1 text-sm font-medium text-foreground">
				{kind === 'aside' ? t('edit.editAside') : t('edit.editProse')}
				<span class="font-mono text-xs text-muted-foreground">{targetId}</span>
			</p>
			<p class="mb-2 text-xs text-muted-foreground">{t('edit.proseHelp')}</p>
			<textarea
				bind:this={textareaEl}
				bind:value={draft}
				rows="10"
				class="w-full resize-y rounded border border-input bg-background px-2 py-1 font-mono text-sm text-foreground leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
			></textarea>
			<div class="mt-3 flex items-center justify-between gap-2">
				{#if staged}
					<button
						type="button"
						onclick={discard}
						class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<Trash2 class="w-4 h-4" /> {t('edit.undoEdit')}
					</button>
				{:else}
					<span></span>
				{/if}
				<div class="flex gap-2">
					<button
						type="button"
						onclick={() => (open = false)}
						class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<X class="w-4 h-4" /> {t('edit.cancel')}
					</button>
					<button
						type="button"
						onclick={save}
						class="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-sm text-background hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-ring"
					>
						<Check class="w-4 h-4" /> {t('edit.confirm')}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
