import { dev } from '$app/environment';
import { PUBLIC_DATA_REPO } from '$env/static/public';
import type { Edit, ProseEdit } from './edits.svelte';
import { applyAnnotationEdits, parseTopicsVocab, validateAdds } from './annotationDiff';
import { applyProseEdits, validateProse } from './proseDiff';

/**
 * Phase 4 — the GitHub write path. Browser → GitHub REST API with the user's own
 * token; the only backend anywhere in the flow is the OAuth Worker (Phase 1).
 *
 * One "Open pull request" action does the whole loop: validate → ensure the
 * user's fork → branch off the *upstream* head (not the possibly-stale fork
 * default — the branch ref is created in the fork at the upstream sha, which is
 * reachable because forks share the object store) → commit each edited sidecar
 * via the Contents API → open a PR upstream. Session edits batch into one branch,
 * one PR.
 *
 * ponytail: collapses commit-now / PR-later into a single action, and uses a
 * fresh uniquely-named branch per submission (no branch reuse / conflict dance).
 * Add the two-step "commit, PR later" flow only if a real workflow needs it.
 */
const API = 'https://api.github.com';
const [UPSTREAM_OWNER, REPO] = PUBLIC_DATA_REPO.split('/');

async function gh(token: string, path: string, init?: RequestInit): Promise<Response> {
	return fetch(path.startsWith('http') ? path : `${API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			...init?.headers
		}
	});
}

async function ghJson<T>(token: string, path: string, init?: RequestInit): Promise<T> {
	const res = await gh(token, path, init);
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		// A GitHub App user-to-server token can only write to repos where the app
		// is installed with Contents write. "Resource not accessible by integration"
		// means the app isn't installed on the user's account / doesn't cover the
		// fork — not something the code can grant; point the user at the fix.
		if (res.status === 403 && /not accessible by integration/i.test(body)) {
			throw new Error('APP_NOT_INSTALLED');
		}
		throw new Error(`GitHub ${res.status} on ${path}: ${body.slice(0, 200)}`);
	}
	return res.json() as Promise<T>;
}

// UTF-8 ↔ base64 (the Contents API speaks base64; corpus text is Unicode).
function toBase64(s: string): string {
	const bytes = new TextEncoder().encode(s);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}
function fromBase64(s: string): string {
	const bin = atob(s.replace(/\s/g, ''));
	const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

const sidecarPath = (bookId: string) => `books/${bookId}.yaml`;
/** Source file for a prose rendition: `la` is the canonical `<id>.md`; any other
 * lang is the translation `<id>.<lang>.md` (spec: franciscus-data/spec/books.md). */
const renditionPath = (bookId: string, lang: string) =>
	lang === 'la' ? `books/${bookId}.md` : `books/${bookId}.${lang}.md`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- reads for the "My Contributions" remote sections ----------------------

export interface OpenPr {
	number: number;
	title: string;
	url: string;
}

interface RepoInfo {
	full_name: string;
	name: string;
	owner: { login: string };
	fork: boolean;
	parent?: { full_name: string };
	default_branch: string;
}

/** The concrete fork we commit to, by its real coordinates. Not assumed to be
 * `{login}/{REPO}`: a transfer/rename redirect at that path can point elsewhere,
 * and a fork may be created under a different name. */
interface Fork {
	owner: string;
	name: string;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** GET `/repos/{owner}/{name}`, or null on 404. Note GitHub **follows transfer
 * redirects**, so the returned repo's `full_name` may differ from what we asked
 * for — callers must check `owner.login`. */
async function getRepo(token: string, owner: string, name: string): Promise<RepoInfo | null> {
	const res = await gh(token, `/repos/${owner}/${name}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`GitHub ${res.status} reading ${owner}/${name}`);
	return (await res.json()) as RepoInfo;
}

/** Is `repo` a fork of upstream genuinely owned by `login` (not a redirect to a
 * different owner, e.g. the transferred source)? */
function isUsableFork(repo: RepoInfo, login: string): boolean {
	if (!eq(repo.owner.login, login)) return false; // path redirected off our account
	if (!repo.fork) return false;
	const parent = repo.parent?.full_name?.toLowerCase();
	return !parent || parent === PUBLIC_DATA_REPO.toLowerCase();
}

/** Whether the user has a usable fork of the data repo at the expected path. */
export async function forkExists(token: string, login: string): Promise<boolean> {
	const repo = await getRepo(token, login, REPO);
	return !!repo && isUsableFork(repo, login);
}

interface RawPr {
	number: number;
	title: string;
	html_url: string;
	user: { login: string };
	head: { ref: string };
}

/** Branch-name prefix for the branches this flow creates on the user's fork. */
const BRANCH_PREFIX = 'franciscus/contrib-';

/** The user's open PRs against the upstream data repo (single page — enough at
 * this repo's volume). ponytail: no pagination; add it if a fork ever has 100+
 * open PRs. */
async function userPulls(token: string, login: string): Promise<RawPr[]> {
	const prs = await ghJson<RawPr[]>(
		token,
		`/repos/${UPSTREAM_OWNER}/${REPO}/pulls?state=open&per_page=100`
	);
	return prs.filter((p) => p.user?.login === login);
}

/** The user's open PRs, for the "My Contributions" remote section. */
export async function listOpenPrs(token: string, login: string): Promise<OpenPr[]> {
	const prs = await userPulls(token, login);
	return prs.map((p) => ({ number: p.number, title: p.title, url: p.html_url }));
}

/** An open PR from *this* flow whose branch we can add more commits to, or null.
 * Lets a user keep staging notes after opening a PR: the extra edits land on the
 * same branch (extending the open PR) instead of spawning a second one. */
async function findReusablePr(
	token: string,
	login: string
): Promise<{ branch: string; url: string } | null> {
	const prs = await userPulls(token, login);
	const mine = prs.find((p) => p.head?.ref?.startsWith(BRANCH_PREFIX));
	return mine ? { branch: mine.head.ref, url: mine.html_url } : null;
}

// --- the write path --------------------------------------------------------

interface GitRef {
	object: { sha: string };
}
interface Contents {
	content: string;
	sha: string;
}

/** Head commit sha of an upstream branch, or null if the branch doesn't exist. */
async function getRefSha(token: string, branch: string): Promise<string | null> {
	const res = await gh(token, `/repos/${UPSTREAM_OWNER}/${REPO}/git/ref/heads/${branch}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`GitHub ${res.status} reading ref ${branch}`);
	return ((await res.json()) as GitRef).object.sha;
}

/** Ensure a usable fork exists and return its real coordinates. Handles the
 * transfer-redirect case (a repo at `{login}/{REPO}` that is actually the
 * upstream) by forking regardless and trusting the fork API's response. */
async function ensureFork(token: string, login: string): Promise<Fork> {
	const existing = await getRepo(token, login, REPO);
	if (existing) {
		if (isUsableFork(existing, login)) {
			return { owner: existing.owner.login, name: existing.name };
		}
		// A *real* same-named repo under the user that isn't a fork blocks the name.
		// (A redirect to a different owner is not this — that just falls through to
		// forking, which supersedes the redirect.)
		if (eq(existing.owner.login, login) && !existing.fork) {
			console.warn('[contribute] non-fork repo blocks the fork name:', existing.full_name);
			throw new Error('EXISTING_NON_FORK');
		}
	}
	// 202 Accepted; the response carries the fork's real owner/name. Poll until it
	// resolves as a fork under our account.
	const created = await ghJson<RepoInfo>(token, `/repos/${UPSTREAM_OWNER}/${REPO}/forks`, {
		method: 'POST'
	});
	if (!eq(created.owner.login, login) || !created.fork) {
		// GitHub handed back something that isn't our fork (e.g. a redirect collision
		// returned the source) — nothing sane to commit to.
		console.warn('[contribute] fork creation returned an unexpected repo:', created.full_name);
		throw new Error('FORK_FAILED');
	}
	const fork = { owner: created.owner.login, name: created.name };
	for (let i = 0; i < 20; i++) {
		await sleep(1500);
		const r = await getRepo(token, fork.owner, fork.name);
		if (r && isUsableFork(r, login)) return fork;
	}
	throw new Error('Fork did not become ready in time — try again in a moment.');
}

/** GET a sidecar's content + blob sha at a given ref; `null` if it doesn't exist
 * yet (a brand-new sidecar — then we PUT without a sha). */
async function getSidecar(
	token: string,
	owner: string,
	name: string,
	path: string,
	ref: string
): Promise<{ content: string; sha?: string } | null> {
	const res = await gh(token, `/repos/${owner}/${name}/contents/${path}?ref=${ref}`);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`GitHub ${res.status} reading ${path}`);
	const file = (await res.json()) as Contents;
	return { content: fromBase64(file.content), sha: file.sha };
}

/**
 * Run the full loop and return the PR's URL. Throws with a readable message on
 * validation failure or any GitHub error (the caller surfaces it).
 *
 * First submit forks → branches → commits → opens a PR, all in one action. If an
 * open PR from this flow already exists, later submits **commit onto its branch**
 * (extending that PR) and no new PR is opened.
 */
export async function submitContribution(
	token: string,
	login: string,
	edits: Edit[],
	proseEdits: ProseEdit[] = []
): Promise<string> {
	if (edits.length === 0 && proseEdits.length === 0) throw new Error('No staged edits to submit.');

	// Books touched by either kind of edit — for the base ref choice and PR title.
	const books = [...new Set([...edits, ...proseEdits].map((e) => e.book_id))];

	// PR base (also the vocabulary/source-of-truth ref). In dev, target `develop`
	// so local testing never PRs into the production branch — fall back to the
	// default branch if `develop` doesn't exist upstream.
	const repo = await ghJson<{ default_branch: string }>(
		token,
		`/repos/${UPSTREAM_OWNER}/${REPO}`
	);
	const base = dev && (await getRefSha(token, 'develop')) ? 'develop' : repo.default_branch;

	// Validate prose bodies against a subset of the format spec (Phase 5 check).
	const proseErrors = validateProse(proseEdits);
	if (proseErrors.length) throw new Error(proseErrors.join('\n'));

	// Validate every annotation `add` against the closed vocabulary (Phase 3
	// check). Skip the topics.yaml fetch entirely when there are no adds.
	if (edits.some((e) => e.op === 'add')) {
		const topicsFile = await ghJson<Contents>(
			token,
			`/repos/${UPSTREAM_OWNER}/${REPO}/contents/topics/topics.yaml?ref=${base}`
		);
		const vocab = parseTopicsVocab(fromBase64(topicsFile.content));
		const errors = validateAdds(edits, vocab);
		if (errors.length) throw new Error(errors.join('\n'));
	}

	// One plan per touched file: the path plus how to rewrite its current text.
	// Annotation sidecars use the Phase 3 transform; prose renditions the Phase 5
	// one. Renditions are keyed by `book|lang` so each `.md`/`.<lang>.md` is one file.
	const plans = new Map<string, (current: string) => string>();
	for (const bookId of new Set(edits.map((e) => e.book_id))) {
		plans.set(sidecarPath(bookId), (c) => applyAnnotationEdits(c, bookId, edits, login));
	}
	for (const key of new Set(proseEdits.map((e) => `${e.book_id}|${e.lang}`))) {
		const [bookId, lang] = key.split('|');
		plans.set(renditionPath(bookId, lang), (c) => applyProseEdits(c, bookId, lang, proseEdits));
	}

	// Ensure a real fork (handles the transfer-redirect case) and use its actual
	// coordinates for every write — never the possibly-redirecting {login}/{REPO}.
	const fork = await ensureFork(token, login);

	// Reuse an already-open PR's branch if we have one; else make a fresh branch
	// on the fork at the upstream head.
	const existing = await findReusablePr(token, login);
	let branch: string;
	if (existing) {
		branch = existing.branch;
	} else {
		const baseSha = await getRefSha(token, base);
		if (!baseSha) throw new Error(`Upstream branch "${base}" not found.`);
		branch = `${BRANCH_PREFIX}${Date.now()}`;
		await ghJson(token, `/repos/${fork.owner}/${fork.name}/git/refs`, {
			method: 'POST',
			body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha })
		});
	}

	// Compute each edited file's new content, reading the current file *from the
	// working branch* so reused PRs build on prior commits.
	const commits: { path: string; text: string; sha?: string }[] = [];
	for (const [path, apply] of plans) {
		const file = await getSidecar(token, fork.owner, fork.name, path, branch);
		const current = file?.content ?? '';
		const next = apply(current);
		if (next !== current) commits.push({ path, text: next, sha: file?.sha });
	}
	if (commits.length === 0) throw new Error('These edits produce no change to the source files.');

	// Commit each file to the branch (Contents API, one commit per file).
	for (const c of commits) {
		await ghJson(token, `/repos/${fork.owner}/${fork.name}/contents/${c.path}`, {
			method: 'PUT',
			body: JSON.stringify({
				message: `Update ${c.path}`,
				content: toBase64(c.text),
				branch,
				...(c.sha ? { sha: c.sha } : {})
			})
		});
	}

	// Reused an open PR → the commits already extend it; otherwise open a new PR.
	if (existing) return existing.url;
	return openPr(token, fork.owner, branch, base, books);
}

/** POST the PR, retrying the transient `head invalid` 422 GitHub returns when it
 * hasn't yet indexed a just-pushed branch. A persistent one is re-thrown. */
async function openPr(
	token: string,
	forkOwner: string,
	branch: string,
	base: string,
	books: string[]
): Promise<string> {
	const body = JSON.stringify({
		title: `Corpus edits: ${books.join(', ')}`,
		head: `${forkOwner}:${branch}`,
		base,
		body:
			'Edits proposed via the in-app contribution flow.\n\n' +
			'All contributions are released under CC0 (public domain), per the ' +
			'consent given in-app.'
	});
	for (let attempt = 0; ; attempt++) {
		const res = await gh(token, `/repos/${UPSTREAM_OWNER}/${REPO}/pulls`, {
			method: 'POST',
			body
		});
		if (res.ok) return ((await res.json()) as { html_url: string }).html_url;
		const text = await res.text().catch(() => '');
		const headNotReady = res.status === 422 && /"field":\s*"head"/.test(text);
		if (headNotReady && attempt < 4) {
			await sleep(2000);
			continue;
		}
		throw new Error(`GitHub ${res.status} opening PR: ${text.slice(0, 200)}`);
	}
}
