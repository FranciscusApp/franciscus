<script lang="ts">
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { initDb, type DbProgress } from '$lib';
	import { resetTrail } from '$lib/trail.svelte.js';
	import LanguagePicker from '$lib/LanguagePicker.svelte';
	import DecorativeImage from '$lib/DecorativeImage.svelte';
	import TopNav from '$lib/TopNav.svelte';
	import Footer from '$lib/Footer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { t, getUiLang } from '$lib/i18n';

	let { children } = $props();

	// Hubs are entry points, not waypoints: landing on one clears the breadcrumb
	// trail so the menu acts as a fresh start. Content pages (book / chapter /
	// topic) record themselves and are left untouched here.
	const TRAIL_HUBS = new Set(['/', '/topics', '/about', '/contact', '/contribute', '/bookmarks']);
	afterNavigate((nav) => {
		const routeId = nav.to?.route.id;
		if (routeId && TRAIL_HUBS.has(routeId)) resetTrail();
	});

	let ready = $state(false);
	let error = $state<string | null>(null);
	let dark = $state(false);
	let progress = $state<DbProgress | null>(null);
	let scrolled = $state(false);

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

	const pct = $derived(
		progress && progress.total ? Math.round((progress.loaded / progress.total) * 100) : null
	);

	$effect(() => {
		dark = document.documentElement.classList.contains('dark');
	});

	function toggleTheme() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		localStorage.setItem('theme', dark ? 'dark' : 'light');
	}

	$effect(() => {
		initDb((p) => { progress = p; })
			.then(() => { ready = true; })
			.catch((e) => { error = String(e); });
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
		<div class="flex items-center gap-1">
			{#if ready && isReader}
			<div class="flex items-center" role="group" aria-label={t('reader.textSize')}>
				<Button
					variant="ghost"
					size="icon"
					onclick={() => setScale(scale - 0.1)}
					disabled={scale <= 0.9}
					class="rounded-full pointer-coarse:size-11 text-muted-foreground hover:text-foreground hover:bg-accent"
					aria-label={t('reader.textSmaller')}
				>
					<span class="text-sm font-serif">A</span>
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onclick={() => setScale(scale + 0.1)}
					disabled={scale >= 1.6}
					class="rounded-full pointer-coarse:size-11 text-muted-foreground hover:text-foreground hover:bg-accent"
					aria-label={t('reader.textLarger')}
				>
					<span class="text-lg font-serif">A</span>
				</Button>
			</div>
		{/if}
		{#if ready}
			<LanguagePicker />
		{/if}
		<Button
			variant="ghost"
			size="icon"
			onclick={toggleTheme}
			class="rounded-full pointer-coarse:size-11 text-muted-foreground hover:text-foreground hover:bg-accent"
			aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
		>
			{#if dark}
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
					<path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06L5.403 4.343a.75.75 0 00-1.06 1.06l1.06 1.06z" />
				</svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
					<path fill-rule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clip-rule="evenodd" />
				</svg>
			{/if}
		</Button>
		</div>
	</nav>

	{#if error}
		<main id="main-content" tabindex="-1" class="min-h-screen flex items-center justify-center">
			<p class="text-destructive">{t('app.dbError')} {error}</p>
		</main>
	{:else if !ready}
		<main id="main-content" tabindex="-1" class="min-h-screen flex items-center justify-center px-6">
			<div class="w-full max-w-xs text-center">
				<p class="text-muted-foreground mb-3">
					{progress?.cached ? t('app.loading') : t('app.downloading')}
				</p>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
					{#if pct !== null}
						<div
							class="h-full rounded-full bg-primary transition-[width] duration-150"
							style="width: {pct}%"
						></div>
					{:else}
						<div class="h-full w-1/3 animate-pulse rounded-full bg-primary"></div>
					{/if}
				</div>
				{#if pct !== null}
					<p class="mt-2 text-xs tabular-nums text-muted-foreground">{pct}%</p>
				{/if}
			</div>
		</main>
	{:else}
		{@render children()}
	{/if}
	<DecorativeImage />
	<Footer {dark} />
</div>
