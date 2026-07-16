<script lang="ts">
	import { getBook, getChapters } from '$lib';
	import { getDbState } from '$lib/dbState';
	import Breadcrumbs from '$lib/Breadcrumbs.svelte';
	import ExpandableDescription from '$lib/ExpandableDescription.svelte';
	import NoScriptNotice from '$lib/NoScriptNotice.svelte';
	import { recordPage } from '$lib/trail.svelte.js';
	import { getProgress } from '$lib/progress.svelte.js';
	import { t, bookNote, getCorpusLang, getUiLang } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const db = getDbState();

	const bookId = $derived(data.book.id);
	const corpusLang = $derived(getCorpusLang());
	const uiLang = $derived(getUiLang());

	// The manifest (source/Latin) renders immediately and prerenders; once the DB
	// is ready, swap to the corpus-language title/chapters and the UI-language
	// description. The editorial note is generated from the rendition's provenance.
	const localized = $derived(db.ready ? getBook(bookId, corpusLang, uiLang) : null);
	const book = $derived(localized ?? data.book);
	const note = $derived(bookNote(book));
	const chapters = $derived(db.ready ? getChapters(bookId, corpusLang) : data.chapters);
	const resume = $derived(db.ready ? getProgress(bookId) : null);

	$effect(() => {
		recordPage([{ id: `/book/${bookId}`, label: book.title, href: `/book/${bookId}` }]);
	});

	const meta = $derived(
		[
			book.author,
			book.date ? `(${book.date})` : '',
			book.ref_edition ? `— ${book.ref_edition}` : ''
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<svelte:head>
	<title>{book.title} — {book.author} · Franciscus</title>
</svelte:head>

<main id="main-content" tabindex="-1" class="max-w-3xl mx-auto px-4 py-8">
	<Breadcrumbs />

	<header class="mb-8">
		<h1 class="text-2xl font-display font-bold text-foreground">{book.title}</h1>
		<p class="text-muted-foreground mt-1">{meta}</p>
		{#if book.description}
			<!-- Rendered to HTML at build time (Markdown); see server render_markdown.
			     Long blurbs collapse to a preview with a [read more] toggle. -->
			<ExpandableDescription html={book.description} />
		{/if}
		{#if note}
			<section class="mt-4">
				<h2 class="text-sm font-display text-muted-foreground uppercase tracking-wide">
					{t('book.notesHeading')}
				</h2>
				<p class="mt-1 text-sm text-muted-foreground font-serif">{note}</p>
				<a href="/ai" class="mt-1 inline-block text-sm text-muted-foreground underline hover:text-primary transition-colors">
					{t('book.aiNoteLink')}
				</a>
			</section>
		{/if}
	</header>

	{#if resume}
		<a
			href={resume.href}
			class="block mb-6 p-3 rounded-lg border border-ring bg-accent/40 text-foreground hover:text-primary transition-colors"
		>
			{t('book.continueReading')}: {resume.label}
		</a>
	{/if}

	<section>
		<h2 class="text-lg font-display text-foreground mb-3">{t('book.chaptersHeading')}</h2>
		<!-- The chapter reader (/book/<id>/<chapter>) needs JS + the DB, so its
		     links stay disabled without scripts; the notice explains why. -->
		<div class="mb-3">
			<NoScriptNotice />
		</div>
		<ul class="space-y-2">
			{#each chapters as ch}
				<li>
					<a
						href="/book/{bookId}/{ch.id}"
						aria-disabled={!db.ready}
						tabindex={db.ready ? undefined : -1}
						class="block p-3 rounded-lg border border-border transition-colors text-foreground {db.ready
							? 'hover:border-ring hover:text-primary'
							: 'pointer-events-none opacity-60'}"
					>
						{ch.title}
					</a>
				</li>
			{/each}
		</ul>
	</section>
</main>
