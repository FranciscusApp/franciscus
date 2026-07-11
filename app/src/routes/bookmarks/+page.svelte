<script lang="ts">
	import { onMount } from 'svelte';
	import { getBookmarks, toggleBookmark, setBookmarkNote } from '$lib/bookmarks.svelte.js';
	import { getDbState } from '$lib/dbState';
	import { t } from '$lib/i18n';
	import NoScriptNotice from '$lib/NoScriptNotice.svelte';
	import BookmarkIcon from '@lucide/svelte/icons/bookmark';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';

	const bookmarks = $derived(getBookmarks());

	// Bookmarks deep-link into chapters, which need the sql.js DB; keep the links
	// inert until the background download finishes.
	const db = getDbState();

	// Bookmarks come from localStorage, so render the list only after mount; the
	// prerendered HTML carries the NoScriptNotice instead of a misleading state.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	// One note editor open at a time, keyed by the bookmark's href.
	let editingHref = $state<string | null>(null);
	let draftNote = $state('');

	function openNoteEditor(href: string, note: string | undefined) {
		editingHref = href;
		draftNote = note ?? '';
	}
	function saveNote() {
		if (editingHref === null) return;
		setBookmarkNote(editingHref, draftNote);
		editingHref = null;
	}
</script>

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<h1 class="text-2xl font-display font-bold text-foreground mb-6">{t('bookmarks.heading')}</h1>

	<NoScriptNotice />

	{#if !mounted}
		<!-- placeholder until client mount; no-JS sees the notice above -->
	{:else if bookmarks.length === 0}
		<p class="text-muted-foreground">{t('bookmarks.empty')}</p>
	{:else}
		<ul class="space-y-2">
			{#each bookmarks as b (b.href)}
				<li class="p-3 rounded-lg border border-border">
					<div class="flex items-center gap-2">
						<a
							href={b.href}
							aria-disabled={!db.ready}
							tabindex={db.ready ? undefined : -1}
							class="flex-1 text-foreground transition-colors {db.ready
								? 'hover:text-primary'
								: 'pointer-events-none opacity-60'}"
						>
							{b.label}
						</a>
						<button
							type="button"
							onclick={() =>
								editingHref === b.href ? (editingHref = null) : openNoteEditor(b.href, b.note)}
							aria-label={b.note ? t('bookmarks.editNote') : t('bookmarks.addNote')}
							aria-expanded={editingHref === b.href}
							class="p-1 pointer-coarse:p-2 rounded focus:outline-none focus:ring-2 focus:ring-ring transition-colors {b.note
								? 'text-primary hover:text-primary/80'
								: 'text-muted-foreground hover:text-primary'}"
						>
							<NotebookPen class="w-4 h-4" />
						</button>
						<button
							type="button"
							onclick={() => toggleBookmark(b.href, b.label)}
							aria-label={t('a11y.removeBookmark')}
							class="p-1 pointer-coarse:p-2 rounded text-primary hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
						>
							<BookmarkIcon class="w-4 h-4" fill="currentColor" />
						</button>
					</div>
					{#if editingHref === b.href}
						<div class="mt-2">
							<textarea
								bind:value={draftNote}
								rows="2"
								placeholder={t('bookmarks.notePlaceholder')}
								class="w-full rounded border border-input bg-background px-2 py-1 text-sm text-foreground"
							></textarea>
							<div class="mt-1 flex justify-end gap-2">
								<button
									type="button"
									onclick={() => (editingHref = null)}
									class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-sm text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
								>
									<X class="w-4 h-4" /> {t('edit.cancel')}
								</button>
								<button
									type="button"
									onclick={saveNote}
									class="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-sm text-background hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-ring"
								>
									<Check class="w-4 h-4" /> {t('edit.confirm')}
								</button>
							</div>
						</div>
					{:else if b.note}
						<p class="mt-1 text-sm text-muted-foreground font-serif whitespace-pre-line">{b.note}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
