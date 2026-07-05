import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// Short git hash of the app repo, baked into the bundle for the footer. Empty
// when building outside a git checkout (e.g. a release tarball).
function gitShort(): string {
	try {
		return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return '';
	}
}

// Dev-only: allow reverse-proxied hosts (e.g. dev.salata.ovh) through Vite's
// host check. Comma-separated list via VITE_ALLOWED_HOSTS; empty by default.
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? '')
	.split(',')
	.map((h) => h.trim())
	.filter(Boolean);

export default defineConfig({
	server: {
		// Bind loopback only; Caddy reverse-proxies the public host to here.
		host: '127.0.0.1',
		port: 1337,
		strictPort: true,
		allowedHosts
	},
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__APP_COMMIT__: JSON.stringify(gitShort())
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Poll the build version file so a returning client detects a new
			// deploy and can prompt to reload (see UpdatePrompt).
			version: { pollInterval: 30_000 },
			// SPA fallback for the non-prerendered (client-only) routes. It must
			// NOT be `index.html`, or it would overwrite the prerendered home page;
			// GitHub Pages serves `404.html` for unknown paths, which boots the SPA.
			adapter: adapter({
				fallback: '404.html'
			})
		})
	]
});
