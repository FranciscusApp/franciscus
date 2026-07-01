// Client-side glue around the service worker SvelteKit auto-registers from
// `src/service-worker.ts`. The worker itself calls `skipWaiting()` +
// `clients.claim()`, so a new version activates as soon as it installs — but an
// already-open page keeps running the old JS until it reloads. These helpers
// close that gap: they nudge the browser to check for a new worker and reload
// the page once a new one takes control.

import { evictDbCache } from './db';

// sessionStorage key bounding how many times a single tab will auto-reload to
// recover from a schema mismatch, so a genuinely broken deploy (server serving
// an incompatible db/app pair) can't trap the user in a reload loop.
const RECOVER_KEY = 'franciscus-schema-recover';
const MAX_RECOVER_ATTEMPTS = 2;

/** Wire up automatic update handling. Safe to call once on mount; a no-op
 *  outside secure contexts or where service workers are unavailable. */
export function initServiceWorkerUpdates(): void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

	// Reload when a freshly activated worker takes control — but only if the page
	// was already controlled. On a first-ever visit `controller` is null and the
	// initial `clients.claim()` fires `controllerchange` too; reloading then is
	// pointless (the page is already on current network assets).
	if (navigator.serviceWorker.controller) {
		let refreshing = false;
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (refreshing) return;
			refreshing = true;
			location.reload();
		});
	}

	// Ask the browser to re-check the worker script now and whenever the app
	// returns to the foreground. Without this a long-lived installed PWA only
	// checks on navigation/every 24h, so a returning user can sit on stale code.
	navigator.serviceWorker.ready.then(checkForUpdate);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') checkForUpdate();
	});
	window.addEventListener('focus', checkForUpdate);
}

async function checkForUpdate(): Promise<void> {
	try {
		const reg = await navigator.serviceWorker.getRegistration();
		await reg?.update();
	} catch (e) {
		console.warn('[sw] update check failed', e);
	}
}

/** Clear the mismatch-recovery attempt counter after a clean db load. */
export function resetSchemaRecovery(): void {
	if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RECOVER_KEY);
}

/**
 * Recover from a {@link SchemaMismatchError}: the cached db and the running app
 * code disagree on schema. Evict the db so a fresh copy is fetched, prod the
 * service worker to pull the new build, and reload. Bounded by
 * `MAX_RECOVER_ATTEMPTS` per tab; throws once exhausted so the caller can show a
 * real error instead of looping. Reloads the page on success (does not return).
 */
export async function recoverFromSchemaMismatch(): Promise<never> {
	const attempts = Number(sessionStorage.getItem(RECOVER_KEY) ?? '0');
	if (attempts >= MAX_RECOVER_ATTEMPTS) {
		throw new Error('Schema mismatch persists after reloading for a new version.');
	}
	sessionStorage.setItem(RECOVER_KEY, String(attempts + 1));

	// Refetch the corpus (covers a stale cached db lagging a newer app)...
	await evictDbCache();
	// ...and pull a newer worker/build (covers stale app code lagging a newer db).
	if ('serviceWorker' in navigator) {
		try {
			const reg = await navigator.serviceWorker.getRegistration();
			await reg?.update();
		} catch (e) {
			console.warn('[sw] update during recovery failed', e);
		}
	}

	location.reload();
	// `location.reload()` doesn't halt execution synchronously; block so callers
	// can rely on the `never` return and don't race the reload.
	return await new Promise<never>(() => {});
}
