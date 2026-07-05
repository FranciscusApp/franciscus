/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

// `self` is the service worker's global scope, not a Window.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `franciscus-cache-${version}`;

// Precache the app shell and static assets. The SPA fallback (`/`) is added so
// arbitrary routes resolve offline. The prerendered hub pages (/, /about,
// /contribute, /topics) ride in via `prerendered`, and the tiny hub
// `db-manifest.json` they read rides in via `files` (it lives in static/) — so
// the hubs work offline. The database is deliberately excluded — it is large and
// managed separately by `db.ts` via its own Cache Storage bucket, which keeps
// first-load progress reporting and avoids downloading it twice.
const ASSETS = [
	'/',
	...build,
	...prerendered,
	...files.filter((f) => !f.endsWith('franciscus.db'))
];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => precache(cache))
			.then(() => sw.skipWaiting())
	);
});

// `addAll` is atomic: a single transiently-stale/404 asset at the CDN edge
// (assets propagate slightly out of step after a deploy) would reject the whole
// batch, fail `install`, and leave the *old* worker in control — the app then
// serves stale JS until enough manual reloads happen to catch the edge in a
// consistent state. Fall back to best-effort per-asset caching so the new
// worker still installs and activates; the fetch handler backfills anything
// skipped from the network on demand.
async function precache(cache: Cache): Promise<void> {
	try {
		await cache.addAll(ASSETS);
	} catch (err) {
		console.warn('[sw] atomic precache failed, falling back to best-effort', err);
		await Promise.allSettled(ASSETS.map((asset) => cache.add(asset)));
	}
}

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((k) => k.startsWith('franciscus-cache-') && k !== CACHE)
						.map((k) => caches.delete(k))
				)
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;
	// The database is cached by db.ts in its own bucket; don't duplicate it here.
	if (url.pathname.endsWith('franciscus.db')) return;

	// The manifest is dynamic data: `make db` rebuilds it without changing the
	// service-worker `version`, so a cache-first lookup would pin returning clients
	// to a stale copy — the copy that predates `db_bytes`, leaving the corpus
	// download progress bar permanently indeterminate. Always revalidate from the
	// network, falling back to cache only when offline.
	if (url.pathname === '/db-manifest.json') {
		event.respondWith(networkFirst(request));
		return;
	}

	event.respondWith(respond(request));
});

async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok && response.type === 'basic') {
			cache.put(request, response.clone());
		}
		return response;
	} catch (err) {
		const cached = await cache.match(request);
		if (cached) return cached;
		throw err;
	}
}

async function respond(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);

	const cached = await cache.match(request);
	if (cached) return cached;

	try {
		const response = await fetch(request);
		// Only cache complete, same-origin responses.
		if (response.ok && response.type === 'basic') {
			cache.put(request, response.clone());
		}
		return response;
	} catch (err) {
		// Offline: fall back to the cached app shell for navigations.
		if (request.mode === 'navigate') {
			const shell = await cache.match('/');
			if (shell) return shell;
		}
		throw err;
	}
}
