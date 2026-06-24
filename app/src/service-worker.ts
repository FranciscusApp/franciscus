/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

// `self` is the service worker's global scope, not a Window.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `franciscus-cache-${version}`;

// Precache the app shell and static assets. The SPA fallback (`/`) is added so
// arbitrary routes resolve offline. The database is deliberately excluded — it
// is large and managed separately by `db.ts` via its own Cache Storage bucket,
// which keeps first-load progress reporting and avoids downloading it twice.
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
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

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

	event.respondWith(respond(request));
});

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
