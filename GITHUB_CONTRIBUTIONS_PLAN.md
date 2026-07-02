# GitHub-backed contributions — implementation plan

## Goal

Add an in-app contribution path **without a read-path backend**. The site stays a
fully static prerendered SPA ([`adapter-static`](app/svelte.config.js)); GitHub is
the write backend. A single stateless Cloudflare Worker exists only to hold the
OAuth client secret for the token exchange.

Contributors authenticate with their own GitHub account, the app forks
`FranciscusApp/franciscus-data`, applies edits to the source files, and
opens a PR upstream. All PRs are human-reviewed before merge; a merged change is
**not live** until the corpus DB is rebuilt and redeployed.

Guest / bot contributions are **explicitly out of scope** (a hardcoded credential
in a static bundle is public; safe guests would require a secret-holding proxy).

## Decisions (locked)

- **Token storage:** long-lived user token in `localStorage`. No expiring tokens,
  no refresh route. Rationale: the token is device-local either way, all PRs are
  validated before merge, and we do not police user device security.
- **v1 scope includes prose**, but we sequence it last. First close the
  **auth → fork → commit → PR** loop end-to-end using annotation edits (the
  simplest edit type), *then* close the feature gap by adding prose edits.
- **OAuth App** flow with the `public_repo` scope. *(Revised — originally a
  GitHub App user-to-server flow, chosen for fine-grained per-repo permissions.
  That fights the fork model: a GitHub App must be **installed** on every
  contributor's account before it can write to their fork — "authorize" alone
  grants no repo access, and a "selected repositories" install can't cover a fork
  that doesn't exist yet, so writes 403. An OAuth App has no install step: one
  authorize screen, and `public_repo` is enough to fork the public repo, push to
  the user's own fork, and open the PR upstream. The broader scope is the
  accepted cost.)*

## Architecture

```
static SPA (GitHub Pages)                        Cloudflare Worker (free tier)
  Connect popup ──authorize──▶ github.com/login/oauth/authorize
                                       │ user approves
                          redirect ◀───┘  (?code=…&state=…)
  popup lands on ─────────────────────▶ GET /auth/callback
                                          exchanges code + CLIENT_SECRET → token
  window.opener ◀──postMessage(token)──  returns tiny HTML that posts + closes
  store token in localStorage
       │
       ▼  (all subsequent calls are browser → GitHub REST API, user token)
  fork · branch · commit · PR
```

The **Decap CMS popup pattern** is used deliberately: it keeps the token out of
the main window URL and avoids GitHub's token-endpoint CORS limitation (only the
Worker talks to the token endpoint, server-side).

---

## Phase 0 — One-time infra (prerequisite) — ✅ DONE

Infra lives in its **own private repo**, `FranciscusApp/franciscus-infra`
(AGPL-3.0), kept apart from the app/corpus. The Worker is in
`franciscus-infra/worker/` (zero-build JS module; `wrangler deploy`).

**GitHub OAuth App** on `FranciscusApp` (Client ID `Ov23livh8M8e5za9LdKS`):
- **Scope:** `public_repo`, requested at authorize time. No repository
  permissions to configure and **no install step** — fork/commit/PR all work
  from the user token directly.
- Tokens are long-lived (per decision).
- Authorization callback URL →
  `https://franciscus-auth.as-be3.workers.dev/auth/callback`.

*(Superseded the original GitHub App `4191800` / `Iv23liUYOiH6aSzkICg2` — see the
revised Decision above for why the App model doesn't fit a fork-based flow.)*

**Cloudflare Worker** — deployed at `https://franciscus-auth.as-be3.workers.dev`:
- `GET /auth/callback` — the *only* route (GitHub's OAuth redirect is a browser
  **GET**, not POST as originally sketched). Exchanges `code` + `CLIENT_SECRET`
  for a user token server-side, returns HTML that `postMessage`s the result to
  the opener and closes. Everything else → 404.
- **CSRF is split** (the Worker is stateless, so it can't store the nonce): the
  Worker guarantees **targetOrigin** — it only posts the token to an origin in
  `ALLOWED_ORIGINS`, read from `state.o` — and echoes `state.n` back; the **app**
  compares `state.n` to a `sessionStorage` nonce. `state` =
  `base64url({ n: nonce, o: appOrigin })`.
- Config: `CLIENT_ID` + `ALLOWED_ORIGINS` (`https://franciscus.app`,
  `http://localhost:5173`) in `wrangler.toml [vars]`; `GH_CLIENT_SECRET` set via
  `wrangler secret` (never in git). Message shape + `state` contract documented
  in `franciscus-infra/worker/README.md`.

**App config** (Vite `PUBLIC_` env) — to set in Phase 1:
- `PUBLIC_GH_CLIENT_ID = Ov23livh8M8e5za9LdKS`
- `PUBLIC_AUTH_WORKER_ORIGIN = https://franciscus-auth.as-be3.workers.dev`
- `PUBLIC_DATA_REPO = FranciscusApp/franciscus-data`

**Local dev model:** the app runs on `localhost:5173` and points at the **one
deployed Worker** (localhost is whitelisted in `ALLOWED_ORIGINS`). No app
deployment and no local Worker/secret are needed to build the login flow — the
popup ends at the deployed Worker, which posts the token back to localhost. Run
the Worker locally (`wrangler dev` + `.dev.vars` + a second callback URL) only
when editing the Worker itself.

**Exit criteria (met):** Worker deployed and smoke-tested — 404 on unknown paths;
400 refusal on missing/untrusted `state`; a trusted-origin request reaches
GitHub's token endpoint (returns `bad_verification_code` for a bogus code,
proving `CLIENT_ID`/secret are wired). Real end-to-end code exchange will be
exercised by the Phase 1 Connect flow.

---

## Phase 1 — Connect flow (`/contribute` section) — ✅ DONE

Build the identity layer only; no writes.

Implemented in the app repo:
- `app/.env` — `PUBLIC_GH_CLIENT_ID`, `PUBLIC_AUTH_WORKER_ORIGIN`,
  `PUBLIC_DATA_REPO` (all public; read via `$env/static/public`).
- `app/src/lib/github.svelte.ts` — identity state module (`token`, `user`,
  `consent`, `connecting`, `error`; `connect()`/`disconnect()`/`revalidate()`).
  OAuth popup builds `state=base64url({n,o})`, verifies `event.origin ===
  worker` + nonce + `source:'franciscus-auth'`, then `GET /user`; 401 →
  disconnect. Persists token/user/consent in localStorage, `browser`-guarded.
- `contribute/+page.svelte` — CC0-consent toggle gating a Connect button;
  connected state shows avatar/name/@login/Disconnect; errors localized;
  interactive block wrapped in `{#if browser}` so no-JS keeps the static copy.
  `onMount → revalidate()`.
- i18n keys added to `en.json`/`it.json` (`githubTitle`, `githubBody`,
  `consentLabel`, `connectButton`, `connecting`, `disconnect`, `githubNoScript`,
  `errConnect`/`errPopupBlocked`/`errPopupClosed`).

`npm run check` clean. Live end-to-end popup exchange not yet exercised in a
browser (needs a real GitHub sign-in against the deployed Worker).

1. **`app/src/lib/github.svelte.ts`** — state module modeled on
   [`bookmarks.svelte.ts`](app/src/lib/bookmarks.svelte.ts):
   `token`, `user`, `consent`, `connect()`, `disconnect()`,
   localStorage persistence, `browser` guard, `GET /user` on connect,
   401 → drop to disconnected.
2. **New "Contribute on GitHub" section** in
   [`contribute/+page.svelte`](app/src/routes/contribute/+page.svelte):
   - **CC0 consent toggle** (persisted). Label: "I understand all contributions
     are released under CC0…". Gates the Connect button (disabled until on).
   - Connect button → opens authorize popup → receives token via `postMessage`.
   - Connected state: avatar + login + name + **Disconnect**.
   - Page stays `prerender = true`; this block is client-only and `browser`-guarded,
     so no-JS visitors still get the static copy.
3. **i18n** strings in `en.json` / `it.json`.

**Exit criteria:** toggle → connect → the user's GitHub identity renders; refresh
persists the session; disconnect clears it.

---

## Phase 2 — Edit interface (compose changes locally)

Vehicle for closing the loop: **annotation / topic edits only**. Chosen because
annotations live in the [`<id>.yaml`
sidecar](../franciscus-data/spec/annotations.md) keyed **directly by paragraph
id** — no build-artifact remapping. (Prose is Phase 5.)

This phase also builds the **contributor UI chrome** that every later phase hangs
off of: the login-gated editor mode, the options panel, and the "My
Contributions" page shell. No network writes/reads yet — the "My Contributions"
page shows only the **local staged-edits** section this phase; its remote
sections (fork status, open PRs, "open a PR") are filled in Phase 4.

### 2a — Contributor chrome (login-gated)

- **Editor mode** — a global UI flag, persisted in localStorage (like `theme`),
  **default off even when connected**. Only meaningful/visible once
  `github.token` is present. When on, the reader shows the edit affordances (2b)
  and a visible "you're editing" cue (accent/badge) so destructive taps aren't a
  surprise. New tiny state module or a field on `github.svelte.ts`.
- **Options panel (gear)** — [`LanguagePicker.svelte`](app/src/lib/LanguagePicker.svelte)
  becomes a general options panel: swap the globe glyph for a gear, rename the
  a11y label (`a11y.languageSettings` → `a11y.settings`), keep the corpus/UI
  language selects, and add the **editor-mode toggle** (only rendered when
  connected). Theme stays its own always-visible navbar button — out of the gear.
- **"My Contributions" nav entry** — in [`TopNav.svelte`](app/src/lib/TopNav.svelte),
  a new item **right after Bookmarks**, conditional on `github.token`. Plumbing:
  add the route to `HUB_LABELS` (TopNav) and `TRAIL_HUBS`
  ([`+layout.svelte`](app/src/routes/+layout.svelte)) so it resets the trail like
  the other hubs. New route `contributions/+page.svelte` (`prerender = true`,
  client-only body, `browser`-guarded, `revalidate()` on mount). Phase 2 renders
  only the **local buffer** section (staged edits, grouped by book/paragraph,
  each unstageable); remote sections are stubbed for Phase 4.

### 2b — Reader edit affordances (editor mode on)

Mirror the existing hover-pill pattern on `.paragraph.group`. Every edit gesture
is **confirm-gated** — a checkmark (confirm) / xmark (cancel) pair using Lucide
`Check`/`X` **action buttons**, kept visually distinct from the label's text `✓`
(which already means "human-verified provenance"). Four ops, one buffer:

- **Remove** — an `X` on each pill → pending-removal state (pill struck-through /
  dimmed) → confirm stages a `remove`.
- **Add** — a `+` at the end of the pill row → picker of valid topics **sourced
  from the DB** (every `type:value` already in the corpus, via the `/topics`
  set — full `topics.yaml` validation lands in Phase 3) → confirm stages an
  `add`. Pending-add pills render dashed/outlined.
- **Verify** — tap a pill body → compact edit popover with a **"Correct /
  verified" toggle** that promotes `provenance` ai→human → confirm stages a
  `verify`. (Highest-value, lowest-risk contribution.)
- **Comment** — same popover holds an English **comment field** → confirm stages
  a `comment` (edit/add the editorial note).

Staged edits are reflected **in the reader in place** (pending-add dashed,
pending-remove struck-through, verified/commented marked), so the reader and the
"My Contributions" buffer are two views of the same state.

**Exit criteria:** connected + editor mode on, a user can stage/unstage all four
op types, see each reflected in the reader and aggregated on "My Contributions";
still no network writes.

**Starting points (verified):**
- Reader: [`book/[book_id]/[chapter_id]/+page.svelte`](app/src/routes/book/%5Bbook_id%5D/%5Bchapter_id%5D/+page.svelte).
  Paragraphs render in a `{#each}` as `<div class="paragraph group" id={p.id}>`;
  annotations come from an `annotationsByParagraph` map and render as topic pills
  (`/topics/{type}/{value}`, showing `✓` when `provenance !== 'ai'`). The
  per-paragraph `.group` + `id={p.id}` is where the affordances hang — mirror the
  existing hover bookmark-button/pill pattern.
- Data reads: [`src/lib/db.ts`](app/src/lib/db.ts) — `getChapterAnnotations(bookId,
  chapterId): Annotation[]` and `getParagraphs(...)`. `Annotation` /`Paragraph`
  types in [`src/lib/types.ts`](app/src/lib/types.ts). Topic-type labels via
  `t('topics.types.<type>')`; pill colors via
  [`src/lib/topicColors.ts`](app/src/lib/topicColors.ts); UI-lang topic labels via
  `getTopicDescriptions(uiLang)`. The **add-picker's** candidate list is the full
  set of `type:value` topics in the DB (same source the `/topics` hub uses).
- State module: new `edits.svelte.ts` mirroring the localStorage-backed `$state` +
  `browser`-guarded-getters pattern of
  [`github.svelte.ts`](app/src/lib/github.svelte.ts) /
  [`bookmarks.svelte.ts`](app/src/lib/bookmarks.svelte.ts). Each edit is keyed by
  `{book_id, paragraph_id, topic_type, topic_value}` with an `op` of
  `add | remove | verify | comment` and a payload (`verified` bool / `comment`
  string where relevant). `add`+`remove` on the same key cancel out.
- **i18n** (en/it): `nav.myContributions`, `a11y.settings`, editor-mode label,
  add/remove/verify/comment labels + a11y, confirm/cancel a11y, pending-state
  copy, and the "My Contributions" empty/section headings.

**Superseded by Phase 2C:** the old CSV-vs-structured-field concern is resolved
by the 2C format — every annotation is one addressable paragraph-grouped item, so
`verify` becomes setting `by:` (AI→human) and `comment` an item field. The
editor-mode verify/comment popover also becomes **AI-only** in 2C. See Phase 2C.

**Local dev gotcha (bit us in Phase 1):** run the app with `make dev` (or at
least `make install`) from [`franciscus/`](franciscus/) — plain `npm run dev`
skips the `install` target that copies
`app/node_modules/fts5-sql-bundle/dist/sql-wasm.wasm` → `app/static/`. Without it
the console shows `[404] GET /sql-wasm.wasm` and **no chapter page can load the
DB** (sql.js can't init). `franciscus.db` is likewise a `make db` artifact. Both
are gitignored.

---

## Phase 2C — Annotation schema normalization (paragraph-grouped, implicit authorship)

Reshape the annotation source format so a staged edit maps to **one addressable
item**, and so authorship/provenance stop being repeated boilerplate. Spans the
**data** and **scripts** repos plus the Rust ingest; **no DB schema change** —
emitted rows keep their shape, so `SCHEMA_VERSION`, `models.rs`, and `types.ts`
are untouched.

### Decisions (locked)

- **One annotation = one `(topic | relation)`** + optional comment. The
  multi-pair CSV entry with a shared comment/provenance is retired. The DB is
  already flat on `(paragraph, type:value)`; the source now matches it.
- **Grouped by paragraph**, not by contributor. Contributor is an *attribute*,
  not a navigation axis — grouping mirrors how the UI and Phase 3 address an
  annotation (by paragraph + topic) and keeps the unique key local to one list:

  ```yaml
  annotations:
    '40':
      - theme:prayer                 # AI-authored (implicit)
      - topic: virtue:fortitude      # map form when a pair needs overrides
        by: alfredo
        comment: courage fits the Latin better than fortitude
  ```

- **Authorship is implicit.** No `by` ⇒ authored by the project AI (Claude); a
  `by: <handle>` ⇒ human-authored. **The presence of `by` is the human signal**,
  so the annotation-level `provenance` field is **dropped entirely**. Ingest
  derives the DB columns: `by_whom` = resolve(`by`) else the Claude default;
  `provenance` = `human` when `by` is present, else `ai`.
- **`provenance` survives at paragraph level only**, solely for the
  non-derivable **`reviewed`** state (a human vetted the AI text); see
  [`books.md`](../franciscus-data/spec/books.md). `ai`/`human` there stay
  defaulted/derivable.
- **`contributors.yaml`** (new, in `franciscus-data/`) lists **humans only**,
  `handle → { name, email, github }`. Claude is never listed (it is the
  default). Resolves `by:` for commits/PRs and DB `by_whom`; `CREDITS.md` can be
  generated from it.

### Work items

1. **Spec** — rewrite [`spec/annotations.md`](../franciscus-data/spec/annotations.md)
   to the grouped, one-pair-per-item format: the scalar-or-map item, implicit
   authorship, and that annotations carry **no** `provenance`.
2. **`contributors.yaml`** — new registry, documented in the spec.
3. **Ingest (Rust)** — new parser for the grouped shape; derive
   `by_whom`/`provenance` as above. Row output unchanged ⇒ no schema bump.
4. **Migration** (franciscus-scripts) — one-time: explode existing multi-topic
   CSV entries into paragraph-grouped bare scalars (all default = Claude/ai).
   Idempotent — re-running on already-grouped files is a no-op.

### UI tweak (editor mode)

- **Verify + comment are AI-only.** The popover opens only on AI-authored
  annotations (`provenance === 'ai'`, i.e. no `by`). Human-authored annotations
  expose **remove** only — a human acts on the AI's annotations, not on another
  human's. (Verify already required `ai`; this extends the gate to the whole
  popover.) In `AnnotationPills.svelte`, gate `openPopover` on AI provenance;
  the pill body is inert for human annotations.

### Exit criteria

- Migration rewrites every sidecar to the new format; `make db` ingests them to a
  DB with the **same rows** as before (parser + migration proven faithful).
- Viewer reader unchanged; in editor mode, verify/comment appear only on AI
  annotations, remove on all.

**Order:** spec → `contributors.yaml` → migration → ingest parser → app UI gate
(spec first, so parser and migration target one agreed contract).

---

## Phase 3 — Reverse mapping (DB → source), annotations — ✅ DONE

Implemented as pure, testable functions in
[`app/src/lib/annotationDiff.ts`](app/src/lib/annotationDiff.ts) (self-check:
[`annotationDiff.test.ts`](app/src/lib/annotationDiff.test.ts), run with
`node --experimental-strip-types`):
- `applyAnnotationEdits(yamlText, bookId, edits, author)` — targeted **text
  surgery** on the 2C grouped format (no YAML round-trip, so untouched lines stay
  byte-identical → minimal diff). Handles all four ops: `add` appends a scalar
  item, `remove` deletes it (dropping an emptied paragraph key), `verify` sets
  `by: <author>` (scalar→map), `comment` sets a JSON-encoded `comment` field.
  Creates a missing paragraph key / `annotations:` section as needed.
- `parseTopicsVocab` + `validateAdds` — closed-vocabulary check (Phase 3 bullet).
  Relations skip the check (free target key); only their reltype is closed.

**Deferred to Phase 4 (network):** fetching the current `<id>.yaml` (fork else
`raw.githubusercontent.com`) and `topics.yaml` to feed these pure functions —
that's the read/write wiring Phase 4 already owns.

**Format note:** targets the Phase 2C grouped format — locate
`annotations['<paragraph>']` and add / remove / rewrite a **single item**; there
is no CSV to splice and no shared-entry split. The CSV-mutation bullets below are
superseded by 2C (verify ⇒ set `by:` on the item, comment ⇒ its `comment` field).

Turn a DB-addressed edit into a source-file text diff.

- Fetch current `<id>.yaml` (from the user's fork once it exists, else
  `raw.githubusercontent.com`).
- Parse → mutate the paragraph's CSV `topics` / `relations` `type:value` string →
  re-serialize, preserving formatting. **This covers `add`/`remove` only.**
- **`verify` and `comment` ops touch structured entry fields, not the CSV**
  (per Phase 2): `verify` rewrites the annotation's `provenance`, `comment`
  rewrites/adds its `comment`. The reverse-mapping must locate the specific
  annotation entry for `{paragraph_id, type:value}` and edit those fields,
  preserving surrounding YAML — not just splice the CSV string.
- **Validate client-side before pushing** against the closed
  [`topics.yaml`](../franciscus-data/topics/) vocabulary — reject unknown values,
  mirroring the Rust ingest rule. (This is where the full-vocabulary check lands;
  Phase 2's add-picker was DB-sourced.)

**Exit criteria:** a staged annotation edit produces a correct, minimal
`<id>.yaml` diff in memory.

---

## Phase 4 — GitHub write path (fork → commit → PR) — ✅ DONE (needs a live GitHub sign-in to exercise end-to-end)

Implemented in [`app/src/lib/contribute.ts`](app/src/lib/contribute.ts) +
wired into [`contributions/+page.svelte`](app/src/routes/contributions/+page.svelte):
- `submitContribution(token, login, edits)` runs the whole loop in one action:
  validate every `add` against the fetched `topics.yaml` (Phase 3 check) → ensure
  the user's fork (`POST /forks`, poll) → create a **branch in the fork at the
  *upstream* head sha** (reachable because forks share the object store) → commit
  each edited sidecar via the Contents API (Phase 3 transform) → open the PR
  upstream with a CC0 note. Session edits across books batch into one branch/PR.
- **Add-to-open-PR:** if the user already has an open PR from this flow
  (`findReusablePr`, branch prefix `franciscus/contrib-`), a later submit
  **commits onto that branch** — reading each sidecar from the branch so it builds
  on prior commits — and opens **no** second PR. First submit forks+commits+PRs in
  one action; subsequently staged notes extend the same open PR.
- `forkExists` / `listOpenPrs` back the "My Contributions" remote sections; the
  page shows the user's open PRs, an **Open pull request** button (submitting /
  error / success-with-link states), and clears the local buffer on success.
- i18n: replaced the `remoteSoon` placeholder with `submit`/`submitting`/
  `submitHint`/`submitted`/`openPrsHeading` (en + it); `clearAll()` added to the
  edits buffer.

`npm run check` clean. **Not yet exercised live** — landing a real PR needs a
browser GitHub sign-in against the deployed Worker (same gap Phase 1 noted).

**ponytail simplifications:** no manual commit-now / PR-later split — the first
submit opens the PR and later submits extend it automatically; `userPulls` reads a
single `per_page=100` page (no pagination — fine at this repo's PR volume); one
Contents commit per file rather than a batched git-tree commit.

**Original work items (for reference):**

1. Ensure fork exists (`POST /repos/{owner}/{repo}/forks`; poll until ready;
   reuse if present).
2. Create/reuse a working branch on the fork.
3. Commit via Contents API (`GET` blob sha → `PUT /contents/{path}` with new
   content + sha + branch). Batch a session's buffered edits into one branch.
4. `POST /repos/{upstream}/pulls`, `head = user:branch`, base `master`, CC0 note
   in the body.
5. **Fill the "My Contributions" page's remote sections** (shell + local buffer
   built in Phase 2): fork status (exists? has commits?), the user's open PRs
   upstream, and a branch-with-unpushed-commits → **"open a PR"** action. These
   are the GitHub-API reads/writes the page was scaffolded for.

**Exit criteria:** from a clean state, a user connects, stages an annotation edit,
and lands a real PR on `franciscus-data` — the full loop, reviewed by a human
before merge.

---

## Phase 5 — Prose edits — **closes the feature gap**

Extend the edit interface + reverse mapping to source `.md` prose. This is the
hard part (build-artifact IDs), deliberately deferred until the loop is proven.

- Reverse-translate DB elements back to source:
  - `<v id="<p-id>-N">N</v>` → source `[N]` verse markers.
  - `<aside>` positional ids (`<chapter>-aside-K`) → the bare source `<aside>`.
  - Body edits target `<p id="…">` in the `.md`.
- Locate the `<p id>` region in the fetched source `.md`, apply the text change,
  preserve surrounding structure.
- Client-side subset of the [`books.md`](../franciscus-data/spec/books.md)
  invariants before pushing (heading depth, id presence, `<ref>` well-formedness).

**Exit criteria:** a prose correction on a paragraph produces a valid `.md` diff
and rides the same fork/commit/PR path from Phase 4.

---

## Phase 6 — Polish

- Rate-limit + error states; friendly reconnect on 401.
- Multiple edits (annotation + prose) batched into one PR per session.
- Staleness messaging: "under review; won't appear live until the corpus is
  rebuilt."
- a11y, i18n coverage, tests for the reverse-mapping engine.

---

## Out of scope

- Guest / `franciscus-bot` contributions (needs a secret-holding proxy; the
  hardcoded-key approach is unsafe by construction).
- Any read-path backend. The DB ships as a static asset and is queried client-side
  via sql.js; that does not change.
