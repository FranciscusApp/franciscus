# Topic-page reader: reuse the reader renderer

**Status:** planned · **Tracking:** ROADMAP → Reader features

Make the passage list on topic pages homogeneous with the normal chapter
reader — same renderer, same interactivity, parallel-reader aware — with
editing always disabled and matches grouped into collapsible book/chapter
containers. This requires extracting the reader's block renderer into a
shared component, which also unblocks later comparison views.

---

## Motivation

The passage list on a topic page and the chapter reader render the *same
underlying content* (paragraph HTML from the corpus) through **two unrelated
code paths**:

- **Chapter reader** — `app/src/routes/book/[book_id]/[chapter_id]/+page.svelte`.
  Rich: verse (`<v id>`) deep-link/selection, scripture `<ref>` tooltip +
  modal, search-term highlight, parallel two-column mode, per-paragraph
  affordances (bookmark, copy-citation, editor pencil). All hand-rolled inline
  in the route.
- **Topic page** — `app/src/routes/topics/[topic_type]/[topic_value]/+page.svelte`.
  Bespoke cards: `{@html occ.content}` in a `border rounded-lg p-4` box, grouped
  by chapter via `groupByChapter`. **None** of the reader interactivity — no
  verse/ref behaviour, no scripture modal, no parallel mode, no reading
  affordances. Different padding and typography.

Result: the topic reader feels like a different app, and every reader
improvement (parallel mode, scripture modal, verse interaction) has to be
re-implemented to reach it. Alfredo wants the topic page to *be* the reader,
read-only.

## Goal

1. Extract the reader's block renderer into a **shared component** used by both
   the chapter reader and the topic page.
2. Redesign the topic page passage list as **collapsible book containers →
   chapter groups → passages**, rendered by that shared component with no extra
   padding.
3. Editing is **always disabled** on the topic page; the rest of the normal
   reading interface (verse/ref interaction, scripture modal, parallel mode,
   bookmark, copy-citation) is preserved.

---

## Target architecture

### Shared renderer component

Extract a component — proposed `app/src/lib/Reader.svelte` (name open) — that
owns **rendering + in-content interactivity for a list of blocks**, and nothing
route-specific.

**Props (proposed):**

| prop | purpose |
|---|---|
| `blocks` | ordered `Block[]` (`paragraph` \| `aside`) to render |
| `bookId`, `chapterId` | context for deep links, citations, editor targets |
| `corpusLang` | translation slot / per-column `lang` |
| `parallel` | two-column source+translation (already derived in the reader) |
| `editing` | gates the editor pencil only; **topic page passes `false`** |
| `searchTerms?` | optional highlight terms (reader keeps this; topic page omits) |
| `onScriptureRef` | callback/event emitting the selected `<ref to>` upward |

**Moves into the component:**

- The `{#each blocks}` paragraph/aside markup, including the parallel
  `grid grid-cols-2` branch, `stripVerseIds`, verse-id ownership (Latin column
  owns anchors), and per-column `lang`.
- The post-render enhancement `$effect` (verse `tabindex`/`role`, ref a11y,
  scripture tooltip element, click/keydown handlers). **Scope it to the
  component's own root**, not a global `.chapter-content` query — a topic page
  mounts *many* renderer instances, so a single global selector would break.
- Per-paragraph affordances toolbar (bookmark, copy-citation, editor pencil).
  Pencil is gated by `editing`; bookmark + copy-citation always render (they are
  part of "the normal reading interface").

**Stays in the route (not the component):**

- `ScriptureModal` — keep **one** instance at page level; the component emits
  the selected ref via `onScriptureRef`, the page binds it into the modal. (A
  topic page has many renderers but must share one modal.)
- Route side effects: `Breadcrumbs`, `recordPage`, `recordProgress`. Progress
  must **not** advance from a topic page — keep that logic out of the shared
  component entirely.
- The `parallel` derivation (`getParallelReader() && corpusLang !== 'la' &&
  isLarge`) and the `matchMedia` width tracking may live in the route or a small
  shared helper; pass the resolved boolean in.

**Acceptance for this step:** the chapter reader, refactored onto the component,
is visually and behaviourally byte-identical to today (single-column *and*
parallel), `npm run check`/`build` clean.

### Data shape: occurrences → blocks

`getTopicOccurrences(type, value, lang)` returns `TopicOccurrence[]`
(`db.ts:334`): paragraph-only rows with `content` already coalesced to the
requested lang, plus `book_id/title`, `chapter_id/title`, `paragraph_id`,
`paragraph_label`, `position`, `comment`. No asides, no annotations.

The shared renderer consumes `Block[]`. Provide an adapter that maps each
occurrence to a `paragraph` block (`annotations: []`). Notes:

- **Comment:** occurrences carry a curated `comment` the reader's `Paragraph`
  has no slot for. Decide: render it under the passage (as today) via a small
  render-time extra, or drop it. Recommend keeping it — pass an optional
  `comment` through the block or render it in the topic page around the renderer.
- **Labels/anchors:** the topic page should keep each passage's `§label` as a
  **deep link out** to `/book/{book}/{chapter}#{paragraph}` (as today), not an
  in-page anchor. Confirm the shared renderer allows suppressing/overriding the
  in-page `id={p.id}` anchor to avoid duplicate ids across a page that lists many
  chapters (ids are unique per paragraph, so likely fine — verify).

### Parallel-reader support on topic pages — data gap

Parallel needs **both** the Latin original *and* the chosen translation per
passage. `getTopicOccurrences` returns only one `content` (coalesced to `lang`).
For parallel on the topic page, the query/adapter must also surface the raw
Latin `p.content`. Options:

- Extend `getTopicOccurrences` to return `content_la` alongside the
  translation (add `p.content AS content_la`), and have the adapter build the
  paragraph block so the renderer's `originalDisplay` path has the Latin. **(recommended)**
- Or fetch translations per paragraph the way the reader does. Heavier; avoid.

Editor-only display helpers in the reader (`pendingProse`, staged highlight)
are inert when `editing = false`, so the topic page naturally shows clean
published text.

---

## Topic page redesign — visual spec

Replace the flat chapter cards with a **two-level collapsible tree**:

**Level 1 — Book container (collapsible, default collapsed).**
One per book. Header row: `+ / −` toggle icon · book title · match count.
Followed by a **primary `<hr>`** (gold/primary accent — see the UI-flourish
palette work). Collapsed by default; the count lets a reader gauge weight
without expanding.

**Level 2 — Chapter group (revealed on expand).**
Within an expanded book, passages grouped by chapter. Chapter header +
**secondary `<hr>`** (crimson/royal-blue accent). Mirrors the book header at a
lower visual weight.

**Level 3 — Passages.**
Rendered by the **shared reader component**, same typography as the chapter
reader, **no added padding**. Parallel mode applies here too when enabled.
Keep the existing non-contiguous `[…]` gap marker between passages whose
positions aren't adjacent.

**Grouping data:** current `groupByChapter` gives book+chapter groups. Add a
book-level grouping (a `groupByBook`, or nest: book → `ChapterGroup[]`) so Level
1 can show a per-book total and own its collapse state. Occurrences are already
ordered `book, chapter.position, paragraph.position`, so a sequential pass
suffices (same approach as `groupByChapter`, `utils.ts:21`).

**Collapse state:** local component state, default collapsed. Consider deep-link
convenience — if the URL targets a passage, auto-expand its book. (Optional;
flag, don't gold-plate.)

**Accessibility:** the `+ / −` toggle is a real `<button>` with
`aria-expanded`; the revealed region is associated via `aria-controls`. Keyboard
operable, respects reduced motion for any expand animation.

---

## Editing & affordances on the topic page

- Editor pencil (`ProseEditor`): **hidden** — `editing = false`.
- Bookmark + copy-citation: **kept** (they define "the normal reading
  interface" Alfredo wants parity with). Verify citation text is sensible for a
  passage reached via a topic (it already builds book/chapter/label + deep link).
- Scripture `<ref>` modal and verse deep-link selection: **kept**.

---

## Suggested agent-sized breakdown

1. **Extract `Reader.svelte`** from the chapter reader; refactor the reader route
   onto it with zero behaviour change (single-column + parallel). Scope the
   enhancement effect to the component root; lift `ScriptureModal` via
   `onScriptureRef`. *Gate: reader byte-identical, check/build clean.*
2. **Occurrence→block adapter** + extend `getTopicOccurrences` with `content_la`
   for parallel.
3. **Collapsible book/chapter tree** on the topic page (grouping util +
   collapse UI + primary/secondary `<hr>`), rendering passages via `Reader.svelte`.
4. **Parallel + polish pass** on the topic page; verify parallel, scripture
   modal, bookmarks, and the `[…]` gap marker all work there.

## Open decisions (for Alfredo)

- Component name (`Reader.svelte`? `PassageList.svelte`?).
- Keep the per-passage curated `comment` on the topic page? (recommend yes.)
- Auto-expand the book when arriving via a deep link? (recommend yes, cheap.)
- Do bookmark/copy-citation belong on the topic reader, or is "reading
  interface" strictly the text + interactivity? (assumed kept.)

## Acceptance criteria

- Chapter reader unchanged (single-column and parallel), check/build clean.
- Topic page passages render through the shared component with reader
  typography and no extra padding; verse/ref interaction and scripture modal
  work; parallel mode works when enabled on lg+.
- Matches grouped into collapsible, default-collapsed book containers (toggle,
  title, count, primary `<hr>`) → chapter groups (secondary `<hr>`) → passages.
- Editing disabled throughout the topic page.
