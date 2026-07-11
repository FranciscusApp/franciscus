<script lang="ts">
	import { tick } from 'svelte';
	import { t } from '$lib/i18n';
	import BookmarkIcon from '@lucide/svelte/icons/bookmark';
	import QuoteIcon from '@lucide/svelte/icons/quote';
	import CheckIcon from '@lucide/svelte/icons/check';
	import AnnotationPills from '$lib/AnnotationPills.svelte';
	import RelationPills from '$lib/RelationPills.svelte';
	import type { RelationLink } from '$lib/db';
	import ProseEditor from '$lib/ProseEditor.svelte';
	import { parseCitation } from '$lib/scripture';
	import { isBookmarked, toggleBookmark } from '$lib/bookmarks.svelte.js';
	import { pendingProse } from '$lib/edits.svelte.js';
	import { dbContentToSource, sourceToDisplay } from '$lib/proseDiff';
	import type { ReaderBlock } from '$lib/reader';

	// Renders an ordered list of blocks with the full in-content reading interface
	// (verse deep links, scripture-ref tooltip/modal, bookmark, copy-citation) and,
	// when `editing`, the prose pencil. Route-specific side effects (breadcrumbs,
	// progress, the single ScriptureModal) stay in the page: refs bubble up via
	// `onScriptureRef`. Editing is a pure gate — pass `false` for a read-only surface.
	let {
		blocks,
		bookId,
		chapterId,
		bookTitle,
		chapterTitle,
		corpusLang,
		parallel,
		editing,
		searchTerms = [],
		topicLabel = (_type: string, value: string) => value,
		candidates = [],
		relationsByParagraph = null,
		relationBooks = [],
		onScriptureRef
	}: {
		blocks: ReaderBlock[];
		bookId: string;
		chapterId: string;
		bookTitle: string;
		chapterTitle: string;
		corpusLang: string;
		parallel: boolean;
		editing: boolean;
		searchTerms?: string[];
		topicLabel?: (type: string, value: string) => string;
		candidates?: { type: string; value: string; label: string }[];
		/** Passage relations keyed by paragraph id; null hides the relation UI
		 *  entirely (surfaces like topic pages that don't query relations). */
		relationsByParagraph?: Map<string, RelationLink[]> | null;
		relationBooks?: { id: string; title: string }[];
		onScriptureRef: (to: string) => void;
	} = $props();

	// The rendered content root; the enhancement effect scopes its queries and
	// listeners here so a page mounting many readers never cross-wires them.
	let root = $state<HTMLElement | null>(null);

	function selectVerse(v: Element) {
		history.replaceState(null, '', `#${v.id}`);
	}

	// Reflect a staged prose edit in place (only in editor mode). A staged body is
	// source form, so re-run the verse rewrite to render it identically to
	// published content. The Latin column is edited under the 'la' slot.
	function paragraphDisplay(id: string, content: string): string {
		const pe = editing ? pendingProse(bookId, corpusLang, id) : null;
		return pe ? sourceToDisplay(pe.text, id) : content;
	}
	function originalDisplay(id: string, contentLa: string): string {
		const pe = editing ? pendingProse(bookId, 'la', id) : null;
		return pe ? sourceToDisplay(pe.text, id) : contentLa;
	}
	function asideDisplay(id: string, content: string): string {
		const pe = editing ? pendingProse(bookId, corpusLang, id) : null;
		return pe ? pe.text : content;
	}
	function originalAsideDisplay(id: string, contentLa: string): string {
		const pe = editing ? pendingProse(bookId, 'la', id) : null;
		return pe ? pe.text : contentLa;
	}

	// The Latin column owns the verse anchors; strip ids from the translation
	// column so deep links (#verse) and verse selection stay unambiguous.
	function stripVerseIds(html: string): string {
		return html.replace(/<v id="[^"]*">/g, '<v>');
	}

	function paraHref(id: string): string {
		return `/book/${bookId}/${chapterId}#${id}`;
	}
	function paraLabel(id: string, label: string | null): string {
		return `${chapterTitle} — ${label ?? id}`;
	}

	// One-click, shareable citation for a passage: a human-readable reference plus
	// its stable deep link. `copiedId` drives the transient "copied" checkmark.
	let copiedId = $state<string | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	function citationText(id: string, label: string | null): string {
		const ref = `${bookTitle}, ${chapterTitle}, ${label ?? id}`;
		const url = `${location.origin}${paraHref(id)}`;
		return `${ref}. ${url}`;
	}

	async function copyCitation(id: string, label: string | null) {
		try {
			await navigator.clipboard.writeText(citationText(id, label));
			copiedId = id;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copiedId = null), 1800);
		} catch {
			// Clipboard blocked (insecure context or denied permission): no-op, the
			// deep-link anchor on the label still lets the reader copy the URL by hand.
		}
	}

	// Make verses (deep-link targets) and scripture refs (tooltips) reachable by
	// keyboard and touch. The content is injected via {@html}, so we enhance the
	// rendered nodes after each render rather than authoring the markup directly.
	$effect(() => {
		// re-run when the rendered content changes
		void blocks;
		void corpusLang;
		void parallel;
		const container = root;
		if (!container) return;

		tick().then(() => {
			for (const v of container.querySelectorAll('v[id]')) {
				v.setAttribute('tabindex', '0');
				v.setAttribute('role', 'button');
			}
			for (const ref of container.querySelectorAll('ref')) {
				ref.setAttribute('tabindex', '0');
				const to = ref.getAttribute('to');
				// Only scripture refs open the modal; topic refs (e.g. place:…) stay
					// plain tooltip targets.
					if (to && parseCitation(to)) ref.setAttribute('role', 'button');
					if (to && !ref.getAttribute('aria-label')) ref.setAttribute('aria-label', to);
			}
		});

		// Scripture-ref tooltip: one shared element, positioned on show and clamped
		// to the viewport so it never overflows (and so the page can't scroll
		// horizontally on mobile). Shown on hover and keyboard/touch focus.
		const tooltip = document.createElement('div');
		tooltip.className = 'ref-tooltip';
		tooltip.setAttribute('role', 'tooltip');
		document.body.appendChild(tooltip);
		let activeRef: HTMLElement | null = null;

		function showTooltip(ref: HTMLElement) {
			const to = ref.getAttribute('to');
			if (!to) return;
			activeRef = ref;
			tooltip.textContent = to;
			tooltip.setAttribute('data-show', '');
			const margin = 8;
			const r = ref.getBoundingClientRect();
			const tip = tooltip.getBoundingClientRect();
			const left = Math.min(Math.max(margin, r.left), window.innerWidth - tip.width - margin);
			let top = r.top - tip.height - 6;
			if (top < margin) top = r.bottom + 6; // flip below when no room above
			tooltip.style.left = `${Math.max(margin, left)}px`;
			tooltip.style.top = `${top}px`;
		}
		function hideTooltip(ref: HTMLElement | null = null) {
			if (ref && ref !== activeRef) return;
			activeRef = null;
			tooltip.removeAttribute('data-show');
		}
		function onRefIn(e: Event) {
			const ref = (e.target as HTMLElement).closest('ref') as HTMLElement | null;
			if (ref) showTooltip(ref);
		}
		function onRefOut(e: Event) {
			const ref = (e.target as HTMLElement).closest('ref') as HTMLElement | null;
			if (ref) hideTooltip(ref);
		}

		container.addEventListener('pointerover', onRefIn);
		container.addEventListener('pointerout', onRefOut);
		container.addEventListener('focusin', onRefIn);
		container.addEventListener('focusout', onRefOut);
		// A fixed tooltip detaches from its ref on scroll/resize — just dismiss it.
		const dismiss = () => hideTooltip();
		window.addEventListener('scroll', dismiss, { passive: true });
		window.addEventListener('resize', dismiss);

		// A scripture ref opens the passage modal; anything else falls through to
		// verse selection. Returns true when the ref was handled.
		function openScriptureRef(el: HTMLElement): boolean {
			const ref = el.closest('ref') as HTMLElement | null;
			const to = ref?.getAttribute('to');
			if (!to || !parseCitation(to)) return false;
			hideTooltip();
			onScriptureRef(to);
			return true;
		}

		function onClick(e: MouseEvent) {
			const target = e.target as HTMLElement;
			if (openScriptureRef(target)) return;
			const v = target.closest('v[id]');
			if (v) selectVerse(v);
		}
		function onKeydown(e: KeyboardEvent) {
			const target = e.target as HTMLElement;
			if (e.key === 'Escape' && target.tagName === 'REF') {
				target.blur();
				return;
			}
			if (e.key !== 'Enter' && e.key !== ' ') return;
			if (target.tagName === 'REF' && openScriptureRef(target)) {
				e.preventDefault();
				return;
			}
			const v = target.closest('v[id]');
			if (v) {
				e.preventDefault();
				selectVerse(v);
			}
		}

		container.addEventListener('click', onClick);
		container.addEventListener('keydown', onKeydown);
		return () => {
			container.removeEventListener('click', onClick);
			container.removeEventListener('keydown', onKeydown);
			container.removeEventListener('pointerover', onRefIn);
			container.removeEventListener('pointerout', onRefOut);
			container.removeEventListener('focusin', onRefIn);
			container.removeEventListener('focusout', onRefOut);
			window.removeEventListener('scroll', dismiss);
			window.removeEventListener('resize', dismiss);
			tooltip.remove();
		};
	});

	function highlightTerms(container: HTMLElement, terms: string[]) {
		if (!terms.length) return;
		const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
		for (const node of textNodes) {
			const text = node.textContent ?? '';
			if (!pattern.test(text)) continue;
			pattern.lastIndex = 0;
			const frag = document.createDocumentFragment();
			let last = 0;
			let m;
			while ((m = pattern.exec(text)) !== null) {
				if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
				const mark = document.createElement('mark');
				mark.className = 'search-highlight';
				mark.textContent = m[0];
				frag.appendChild(mark);
				last = pattern.lastIndex;
			}
			if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
			node.parentNode?.replaceChild(frag, node);
		}
	}

	$effect(() => {
		if (searchTerms.length === 0 || blocks.length === 0) return;
		tick().then(() => {
			if (root) highlightTerms(root, searchTerms);
		});
	});
</script>

<!-- Parallel mode tags each column's lang instead of the whole surface. -->
<div bind:this={root} class="chapter-content space-y-4" lang={parallel ? undefined : corpusLang}>
	{#each blocks as block}
		{#if block.kind === 'gap'}
			<div class="text-center text-muted-foreground font-serif" aria-hidden="true">[…]</div>
		{:else if block.kind === 'paragraph'}
			{@const proseStaged = editing && !!pendingProse(bookId, corpusLang, block.id)}
			<div class="paragraph group" id={block.id}>
				<div class="float-right ml-2 flex items-center gap-0.5">
					<button
						type="button"
						onclick={() => toggleBookmark(paraHref(block.id), paraLabel(block.id, block.label))}
						aria-pressed={isBookmarked(paraHref(block.id))}
						aria-label={isBookmarked(paraHref(block.id)) ? t('a11y.removeBookmark') : t('a11y.addBookmark')}
						class="p-1 pointer-coarse:p-2 rounded text-muted-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring opacity-40 group-hover:opacity-100 focus:opacity-100 aria-pressed:opacity-100 aria-pressed:text-primary transition"
					>
						<BookmarkIcon class="w-4 h-4" fill={isBookmarked(paraHref(block.id)) ? 'currentColor' : 'none'} />
					</button>
					<button
						type="button"
						onclick={() => copyCitation(block.id, block.label)}
						aria-label={copiedId === block.id ? t('a11y.citationCopied') : t('a11y.copyCitation')}
						title={copiedId === block.id ? t('a11y.citationCopied') : t('a11y.copyCitation')}
						class="p-1 pointer-coarse:p-2 rounded text-muted-foreground hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring opacity-40 group-hover:opacity-100 focus:opacity-100 transition {copiedId ===
						block.id
							? 'opacity-100 text-primary'
							: ''}"
					>
						{#if copiedId === block.id}
							<CheckIcon class="w-4 h-4" />
						{:else}
							<QuoteIcon class="w-4 h-4" />
						{/if}
					</button>
					<ProseEditor
						{bookId}
						lang={corpusLang}
						{chapterId}
						kind="paragraph"
						targetId={block.id}
						originalText={dbContentToSource(block.content)}
						{editing}
					/>
				</div>
				<span class="inline-block min-w-8 text-xs text-muted-foreground font-mono mr-2 align-top pt-1">
					{block.label ?? block.id}
				</span>
				{#if parallel}
					<div class="grid grid-cols-2 gap-6">
						<div class="para-text font-serif text-foreground leading-relaxed" lang="la">
							{@html originalDisplay(block.id, block.contentLa)}
						</div>
						<div
							class="para-text font-serif text-foreground leading-relaxed {proseStaged
								? 'rounded bg-primary/5 px-1 ring-1 ring-primary/30'
								: ''}"
							lang={corpusLang}
						>
							{@html stripVerseIds(paragraphDisplay(block.id, block.content))}
						</div>
					</div>
				{:else}
					<span
						class="para-text font-serif text-foreground leading-relaxed {proseStaged
							? 'rounded bg-primary/5 px-1 ring-1 ring-primary/30'
							: ''}"
					>
						{@html paragraphDisplay(block.id, block.content)}
					</span>
				{/if}
				<AnnotationPills
					{bookId}
					paragraphId={block.id}
					annotations={block.annotations}
					{topicLabel}
					{candidates}
					{editing}
				/>
				{#if relationsByParagraph}
					<RelationPills
						{bookId}
						paragraphId={block.id}
						relations={relationsByParagraph.get(block.id) ?? []}
						books={relationBooks}
						{editing}
					/>
				{/if}
				{#if block.comment}
					<p class="mt-2 text-sm text-muted-foreground italic">{block.comment}</p>
				{/if}
			</div>
		{:else}
			{@const asideStaged = editing && !!pendingProse(bookId, corpusLang, block.id)}
			{#if parallel}
				<div class="grid grid-cols-2 gap-6 items-start">
					<aside class="text-sm italic text-muted-foreground font-serif py-2" lang="la">
						{originalAsideDisplay(block.id, block.contentLa)}
					</aside>
					<!-- Only the translation column is editable (the Latin column is
					     read-only in parallel, as with paragraphs); the pencil reveals on
					     hover via the group, matching the single-column aside editor. -->
					<div class="group flex items-start gap-1">
						<aside
							class="flex-1 text-sm italic text-muted-foreground font-serif py-2 {asideStaged
								? 'rounded bg-primary/5 px-1 ring-1 ring-primary/30'
								: ''}"
							lang={corpusLang}
						>
							{asideDisplay(block.id, block.content)}
						</aside>
						{#if editing}
							<div class="pt-2">
								<ProseEditor
									{bookId}
									lang={corpusLang}
									{chapterId}
									kind="aside"
									targetId={block.id}
									originalText={block.content}
									{editing}
								/>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<div class="group flex items-start gap-1">
					<aside
						class="flex-1 text-sm italic text-muted-foreground font-serif py-2 {asideStaged
							? 'rounded bg-primary/5 px-1 ring-1 ring-primary/30'
							: ''}"
					>
						{asideDisplay(block.id, block.content)}
					</aside>
					{#if editing}
						<div class="pt-2">
							<ProseEditor
								{bookId}
								lang={corpusLang}
								{chapterId}
								kind="aside"
								targetId={block.id}
								originalText={block.content}
								{editing}
							/>
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	{/each}
</div>
