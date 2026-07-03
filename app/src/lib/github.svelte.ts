import { browser } from '$app/environment';
import { PUBLIC_GH_CLIENT_ID, PUBLIC_AUTH_WORKER_ORIGIN } from '$env/static/public';

/**
 * GitHub identity for the contribution flow. Client-side only: the user signs in
 * with their own GitHub account via a Decap-style OAuth App popup, and we keep a
 * long-lived user token in localStorage (per the locked plan decision — the
 * token is device-local and every PR is human-reviewed before merge). This
 * module owns only the *identity* layer; no repo writes happen here.
 *
 * The token exchange runs through the `franciscus-auth` Cloudflare Worker, the
 * only backend in the path — it holds the client secret and posts the token back
 * to this window. CSRF is split: the Worker locks the postMessage targetOrigin
 * to its allow-list and echoes our nonce; we verify `event.origin` and the nonce
 * here. See the Worker README for the message contract.
 */
export interface GithubUser {
	login: string;
	name: string | null;
	/** Public email if the user exposes one on their profile, else null. Used to
	 * enrich the first-contribution `contributors.yaml` entry; email is optional
	 * there, so null is fine. `public_repo` scope can't read private emails. */
	email: string | null;
	avatarUrl: string;
	htmlUrl: string;
}

const TOKEN_KEY = 'franciscus-gh-token';
const USER_KEY = 'franciscus-gh-user';
const CONSENT_KEY = 'franciscus-gh-consent';
const NONCE_KEY = 'gh_oauth_nonce';

/** Origin the token-bearing postMessage must come from (Worker README). */
const WORKER_ORIGIN = PUBLIC_AUTH_WORKER_ORIGIN;

function loadString(key: string): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function loadUser(): GithubUser | null {
	const raw = loadString(USER_KEY);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as GithubUser;
	} catch {
		return null;
	}
}

let token = $state<string | null>(loadString(TOKEN_KEY));
let user = $state<GithubUser | null>(loadUser());
let consent = $state<boolean>(loadString(CONSENT_KEY) === 'true');
let connecting = $state(false);
/** Machine-readable error code from the last connect attempt (or null). */
let error = $state<string | null>(null);

function persist(key: string, value: string | null) {
	if (!browser) return;
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		/* localStorage may be unavailable (private mode, quota) */
	}
}

export function getToken(): string | null {
	return token;
}

export function getUser(): GithubUser | null {
	return user;
}

export function isConnected(): boolean {
	return token !== null && user !== null;
}

export function isConnecting(): boolean {
	return connecting;
}

export function getError(): string | null {
	return error;
}

export function getConsent(): boolean {
	return consent;
}

export function setConsent(value: boolean) {
	consent = value;
	persist(CONSENT_KEY, value ? 'true' : null);
}

/** base64url of a JSON string, matching the Worker's `decodeState`. */
function base64url(json: string): string {
	return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Fetch the authenticated user. Throws `unauthorized` on a 401 so callers can
 *  drop to the disconnected state. */
async function fetchUser(tok: string): Promise<GithubUser> {
	const res = await fetch('https://api.github.com/user', {
		headers: {
			Authorization: `Bearer ${tok}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});
	if (res.status === 401) throw new Error('unauthorized');
	if (!res.ok) throw new Error(`github_${res.status}`);
	const j = await res.json();
	return {
		login: j.login,
		name: j.name ?? null,
		email: j.email ?? null,
		avatarUrl: j.avatar_url,
		htmlUrl: j.html_url
	};
}

/** Open the OAuth popup and resolve with the user token, or reject with a code
 *  (`popup_blocked`, `popup_closed`, or a GitHub/Worker error). */
function runOAuthPopup(): Promise<string> {
	return new Promise((resolve, reject) => {
		const nonce = crypto.randomUUID();
		sessionStorage.setItem(NONCE_KEY, nonce);
		const state = base64url(JSON.stringify({ n: nonce, o: location.origin }));

		const authUrl = new URL('https://github.com/login/oauth/authorize');
		authUrl.searchParams.set('client_id', PUBLIC_GH_CLIENT_ID);
		authUrl.searchParams.set('state', state);
		authUrl.searchParams.set('redirect_uri', `${WORKER_ORIGIN}/auth/callback`);
		// OAuth App scope: enough to fork the public data repo, push to the user's
		// own fork, and open a PR upstream. (`repo` would be needed only if the
		// corpus repo were private.)
		authUrl.searchParams.set('scope', 'public_repo');

		const popup = window.open(
			authUrl.toString(),
			'franciscus-github-auth',
			'width=680,height=760,menubar=no,toolbar=no'
		);
		if (!popup) {
			sessionStorage.removeItem(NONCE_KEY);
			reject(new Error('popup_blocked'));
			return;
		}

		let settled = false;
		const cleanup = () => {
			window.removeEventListener('message', onMessage);
			clearInterval(pollClosed);
			sessionStorage.removeItem(NONCE_KEY);
		};

		const onMessage = (event: MessageEvent) => {
			// Trust only the Worker origin and our own nonce.
			if (event.origin !== WORKER_ORIGIN) return;
			const data = event.data;
			if (!data || data.source !== 'franciscus-auth') return;
			if (data.state !== sessionStorage.getItem(NONCE_KEY)) return;
			settled = true;
			cleanup();
			popup.close();
			if (data.ok && data.token) resolve(data.token as string);
			else reject(new Error(data.error || 'auth_failed'));
		};
		window.addEventListener('message', onMessage);

		// The user may close the popup without completing the flow.
		const pollClosed = setInterval(() => {
			if (popup.closed && !settled) {
				cleanup();
				reject(new Error('popup_closed'));
			}
		}, 500);
	});
}

/** Run the full connect flow: popup → token → identity. Requires consent. */
export async function connect(): Promise<void> {
	if (!browser || connecting) return;
	error = null;
	connecting = true;
	try {
		const tok = await runOAuthPopup();
		const u = await fetchUser(tok);
		token = tok;
		user = u;
		persist(TOKEN_KEY, tok);
		persist(USER_KEY, JSON.stringify(u));
	} catch (e) {
		error = e instanceof Error ? e.message : 'unknown';
	} finally {
		connecting = false;
	}
}

/** Re-check a persisted token against GitHub; drop to disconnected on 401.
 *  Network/other errors leave the cached identity in place. */
export async function revalidate(): Promise<void> {
	if (!browser || !token) return;
	try {
		const u = await fetchUser(token);
		user = u;
		persist(USER_KEY, JSON.stringify(u));
	} catch (e) {
		if (e instanceof Error && e.message === 'unauthorized') disconnect();
	}
}

/** Forget the session. Consent is a separate preference and is left intact. */
export function disconnect() {
	token = null;
	user = null;
	error = null;
	persist(TOKEN_KEY, null);
	persist(USER_KEY, null);
}
