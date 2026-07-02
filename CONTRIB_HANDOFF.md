# Handoff — in-app GitHub contribution flow (Phases 3–4)

Context: this is the write-path contribution feature. Read
[`GITHUB_CONTRIBUTIONS_PLAN.md`](GITHUB_CONTRIBUTIONS_PLAN.md) first — it is the
source of truth for the design and per-phase status.

## Where things stand (working)

- **Phase 3** (reverse mapping, DB edit → source YAML diff): implemented in
  [`app/src/lib/annotationDiff.ts`](app/src/lib/annotationDiff.ts) with a self-check
  [`annotationDiff.test.ts`](app/src/lib/annotationDiff.test.ts)
  (`node --experimental-strip-types src/lib/annotationDiff.test.ts`).
- **Phase 4** (fork → commit → PR): [`app/src/lib/contribute.ts`](app/src/lib/contribute.ts),
  wired into [`contributions/+page.svelte`](app/src/routes/contributions/+page.svelte).
- **Auth is now an OAuth App** (was a GitHub App — switched because a GitHub App
  needs a per-account *install* for a fork flow; see the revised Phase 0 decision
  in the plan). Client ID `Ov23livh8M8e5za9LdKS`, scope `public_repo`. Worker
  unchanged except `CLIENT_ID`.
- **Transfer-redirect gotcha handled:** the maintainer had transferred
  `franciscus-data` from their personal account to the org, leaving a redirect
  that the REST API silently follows. `contribute.ts` now derives the fork's real
  coordinates from the fork API response instead of assuming `{login}/{REPO}`.
- **Dev targets `develop`:** in `dev` (`$app/environment`), the PR base is the
  upstream `develop` branch (falls back to the default branch if absent).
- A **real PR opened successfully** end-to-end. `npm run check` is clean.

## The bug to fix

**Symptom:** the user staged several edits; only **one addition** appeared in the
PR commits. Re-staging more edits and submitting again errors with **"These edits
produce no change to the source files."**

**Confirmed NOT the cause:** the diff engine. A direct test of
`applyAnnotationEdits` with 6 mixed edits (adds to two paragraphs + verify +
comment + remove) applied all of them correctly. The engine is sound for
multi-edit / multi-paragraph.

**Strong hypothesis — source-of-truth mismatch:**
`verify` / `comment` / `remove` only mutate an item when its exact `type:value`
**already exists in the branch YAML** (`applyToItems` → `findItem`; no match = a
**silent no-op**). An `add` of a pair already present is likewise a no-op. But:

- the reader stages edits against the **local sql.js DB**, built by `make db`
  from the local `../franciscus-data` working copy;
- the diff is computed against the **upstream branch** sidecar (`develop` in dev),
  fetched fresh in `submitContribution` via `getSidecar`.

When those two diverge (very likely — local corpus vs `develop`), every op except
a genuinely-new `add` silently drops. That reproduces both symptoms exactly:
only new adds "get through," and a re-submit whose edits are all no-ops against
the branch reports "no change."

## How to confirm (cheap)

1. In `applyToItems` ([`annotationDiff.ts`](app/src/lib/annotationDiff.ts)), make it
   return which edits actually applied (or `console.warn` the no-ops). Submit the
   same edits and see how many silently dropped.
2. Compare the paragraph blocks the user edited in the **`develop`** sidecar
   (`https://raw.githubusercontent.com/FranciscusApp/franciscus-data/develop/books/<id>.yaml`)
   against what the reader shows (the local DB). If the items differ, that's it.

## Suggested directions (not yet decided)

- **Surface no-ops instead of dropping them.** Have `submitContribution` collect
  per-edit results and tell the user "3 of 5 edits couldn't be applied — the
  source has changed since you loaded the page" rather than a blanket "no change."
- **Reconcile the source of truth.** Either (a) match edits against the *fetched*
  sidecar rather than the DB before/at staging time, or (b) ensure the DB the
  reader loads corresponds to the branch the PR targets (in dev, build the DB from
  `develop`). (a) is more robust; (b) is a dev-env fix only.
- Add a Phase-3 unit test that feeds a **realistic `develop` sidecar** plus the
  actual staged-edit set, to lock the behavior once the reconciliation is chosen.

## Cleanup for the maintainer

Earlier failed attempts (before the redirect fix) pushed stray
`franciscus/contrib-*` branches (and a commit) **directly onto the org repo**
`FranciscusApp/franciscus-data`. Delete them at
`https://github.com/FranciscusApp/franciscus-data/branches`.

## Key files

- [`app/src/lib/annotationDiff.ts`](app/src/lib/annotationDiff.ts) — the reverse-map
  engine (`applyAnnotationEdits`, `applyToItems`, `parseItems`, `validateAdds`).
- [`app/src/lib/contribute.ts`](app/src/lib/contribute.ts) — GitHub write path
  (`submitContribution`, `ensureFork`, `getSidecar`, `openPr`, `getRefSha`).
- [`app/src/lib/edits.svelte.ts`](app/src/lib/edits.svelte.ts) — the local edit buffer.
- [`app/src/routes/contributions/+page.svelte`](app/src/routes/contributions/+page.svelte)
  — the "My Contributions" page + submit UI + error box.
- `app/src/lib/i18n/{en,it}.json` → `contributions.*` keys.
