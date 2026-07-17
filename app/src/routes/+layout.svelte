<script lang="ts">
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { initDb, type DbProgress } from '$lib';
	import { SchemaMismatchError } from '$lib/db';
	import { initServiceWorkerUpdates, recoverFromSchemaMismatch, resetSchemaRecovery } from '$lib/sw';
	import { resetTrail } from '$lib/trail.svelte.js';
	import { setDbState } from '$lib/dbState';
	import LanguagePicker from '$lib/LanguagePicker.svelte';
	import DecorativeImage from '$lib/DecorativeImage.svelte';
	import TopNav from '$lib/TopNav.svelte';
	import Footer from '$lib/Footer.svelte';
	import UpdatePrompt from '$lib/UpdatePrompt.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { t, getUiLang } from '$lib/i18n';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Hubs are entry points, not waypoints: landing on one clears the breadcrumb
	// trail so the menu acts as a fresh start. Content pages (book / chapter /
	// topic) record themselves and are left untouched here.
	const TRAIL_HUBS = new Set(['/', '/topics', '/study', '/about', '/contribute', '/bookmarks', '/contributions']);
	afterNavigate((nav) => {
		const routeId = nav.to?.route.id;
		if (routeId && TRAIL_HUBS.has(routeId)) resetTrail();
	});

	let ready = $state(false);
	let error = $state<string | null>(null);
	let updating = $state(false);
	let dark = $state(false);
	let progress = $state<DbProgress | null>(null);
	let scrolled = $state(false);

	// Publish the background-DB state to DB-gated routes (book / topic-detail)
	// and the hub chrome. Getters keep consumers reactive to the $state above.
	setDbState({
		get ready() {
			return ready;
		},
		get error() {
			return error;
		},
		get progress() {
			return progress;
		},
		get updating() {
			return updating;
		}
	});

	// Keep the installed PWA's code current: auto-reload when a new service
	// worker takes control, and re-check for one when the app regains focus.
	onMount(initServiceWorkerUpdates);

	// Reader text-size knob (only shown on the chapter reader). Scales the
	// reader's --reader-scale CSS var; persisted and applied early in app.html.
	const isReader = $derived($page.route.id === '/book/[book_id]/[chapter_id]');
	let scale = $state(1);
	$effect(() => {
		const stored = Number(localStorage.getItem('franciscus-reader-scale'));
		if (stored) scale = stored;
	});
	function setScale(next: number) {
		scale = Math.min(1.6, Math.max(0.9, Math.round(next * 10) / 10));
		document.documentElement.style.setProperty('--reader-scale', String(scale));
		localStorage.setItem('franciscus-reader-scale', String(scale));
	}

	// Fade in a shadow under the fixed chrome once the page scrolls, so body
	// text passes cleanly beneath the body-matched background band.
	$effect(() => {
		const onScroll = () => (scrolled = window.scrollY > 8);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	$effect(() => {
		dark = document.documentElement.classList.contains('dark');
	});

	function toggleTheme() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		localStorage.setItem('theme', dark ? 'dark' : 'light');
	}

	$effect(() => {
		// The manifest (already loaded above) carries the uncompressed db size, so
		// the progress bar is determinate even when the transfer has no Content-Length.
		// Read it defensively: if the manifest is ever missing on this route, the
		// download must still run (falling back to Content-Length) rather than
		// throwing here and leaving the gate stuck on an indeterminate spinner.
		const total = data.manifest?.corpus?.db_bytes;
		initDb((p) => { progress = p; }, total)
			.then(() => { resetSchemaRecovery(); ready = true; })
			.catch((e) => {
				// A schema mismatch means this client is running against a db built
				// for a different app version: drive an update + reload rather than
				// showing a scary error. If recovery gives up (loop guard tripped),
				// it throws and we fall through to the generic error.
				if (e instanceof SchemaMismatchError) {
					updating = true;
					recoverFromSchemaMismatch().catch((re) => { updating = false; error = String(re); });
					return;
				}
				error = String(e);
			});
	});

	// Keep <html lang> in sync with the active UI language (the page chrome).
	// Source text gets its own lang topic on the reader region.
	$effect(() => {
		document.documentElement.lang = getUiLang();
	});
</script>

<svelte:head>
	<title>{t('app.title')} — {t('app.subtitle')}</title>
</svelte:head>

<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-1/2 focus:-translate-x-1/2 focus:z-[60]
	       focus:rounded-md focus:bg-popover focus:px-4 focus:py-2 focus:shadow-lg
	       focus:text-popover-foreground focus:outline-none focus:ring-2 focus:ring-ring"
>
	{t('a11y.skipToContent')}
</a>

<div class="flex min-h-screen flex-col bg-background transition-colors pt-20 md:pt-24 md:pb-20">
	<!-- Body-matched navbar over the floating chrome. On scroll it gains a soft
	     drop shadow tinted with the page background, so body text appears to
	     fade out as it passes underneath rather than ending at a hard edge. -->
	<nav
		class="fixed inset-x-0 top-0 z-50 flex py-2 items-center justify-between px-3 md:px-4 bg-background transition-shadow duration-300 {scrolled
			? 'shadow-[0_10px_16px_4px_var(--background)]'
			: ''}"
	>
		<TopNav />
		<div class="flex shrink-0 items-center gap-1">
			{#if ready && isReader}
			<div class="flex items-center" role="group" aria-label={t('reader.textSize')}>
				<Button
					variant="ghost"
					size="icon-lg"
					onclick={() => setScale(scale - 0.1)}
					disabled={scale <= 0.9}
					class="rounded-full pointer-coarse:size-11 text-muted-foreground hover:text-foreground hover:bg-accent"
					aria-label={t('reader.textSmaller')}
				>
					<span class="text-sm font-serif">A</span>
				</Button>
				<Button
					variant="ghost"
					size="icon-lg"
					onclick={() => setScale(scale + 0.1)}
					disabled={scale >= 1.6}
					class="rounded-full pointer-coarse:size-11 text-muted-foreground hover:text-foreground hover:bg-accent"
					aria-label={t('reader.textLarger')}
				>
					<span class="text-lg font-serif">A</span>
				</Button>
			</div>
		{/if}
		{#if !ready && !error}
			<!-- Circular indicator: the corpus DB is still loading/downloading in
			     the background; hub pages stay usable while it lands. Rendered in
			     the prerendered HTML (visible from first paint for JS users) but
			     `js-only`, so no-JS visitors don't see a perpetual spinner. -->
			<span
				role="status"
				aria-label={progress && !progress.cached ? t('app.downloading') : t('app.loading')}
				class="js-only inline-flex size-10 items-center justify-center text-muted-foreground"
			>
				<svg class="size-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
					<path class="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z" />
				</svg>
			</span>
		{/if}
		<LanguagePicker languages={data.manifest.corpus.languages} />
		<Button
			variant="ghost"
			onclick={toggleTheme}
			size="icon-lg"
			class="rounded-full pointer-coarse:size-11 text-muted-foreground hover:text-foreground hover:bg-accent"
			aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
		>
			{#if dark}
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6">
					<path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06L5.403 4.343a.75.75 0 00-1.06 1.06l1.06 1.06z" />
				</svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6">
					<path fill-rule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clip-rule="evenodd" />
				</svg>
			{/if}
		</Button>
		</div>
	</nav>

	<!-- The root layout no longer gates on the DB: hubs render from the manifest
	     immediately. DB-dependent routes (book / topic-detail) wrap themselves in
	     DbGate (their nested +layout) to show the loading/progress screen. -->
	{@render children()}
	<DecorativeImage />
	<Footer {dark} />
</div>

<UpdatePrompt />
