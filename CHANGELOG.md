# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).
This project also tries to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html),
although it not being a library and not exposing any APIs means the definitions for "major, minor, patch"
might be somewhat loose or subjective.


## [1.5.0] - 2026-07-17

### Added
- **Study view.** Open any two chapters side by side at `/study` to compare
  accounts — e.g. Bonaventure's telling of an episode against Celano's. Each
  pane independently shows either a chapter or corpus search results (with the
  advanced-search book and topic filters), and a share button copies a link
  that encodes the whole setup — query, filters, and both panes.
- **Wide layout.** A navbar toggle on large screens reclaims the decorative
  gutters: the ornamental figure steps aside and the wide reading surfaces
  (parallel reader, study view) stretch to the full viewport. The preference
  persists across visits.
- **Book collections.** The home page and the books menu now group the corpus
  into collections (biographies, the writings of Francis, …) with localized
  headings, driven by the corpus's new `categories.yaml` and per-book
  `category` / `sequence` frontmatter.
- **Verse and psalm layouts.** Non-prose texts keep their line structure: a
  `layout="verse"` paragraph preserves its authored line breaks (hymns such as
  the *Canticum fratris solis*), and `layout="psalm"` additionally breaks each
  verse at its `<caesura>` marks so pointed chant reads as half-lines (the
  *Officium Passionis* psalters).
- **In-work section headings.** A paragraph's label can render as a section
  heading (`label_format="heading"`), giving sub-chapter divisions inside a
  work real visual weight.
- **Collapsible book descriptions.** Long cover descriptions on the book page
  fold behind a "read more" control (fully expanded under NoScript).

### Changed
- The corpus gained four works split out of the *Opuscula* into their own
  books — *Admonitiones*, *Officium Passionis Domini*, *Regula bullata*, and
  *Regula non bullata* (see the `franciscus-data` changelog).
- Paragraph-id markers in the reader are trimmed to a quieter form.
- Previously hard-coded UI chrome is now localized, and unused
  Franciscan-source cross-reference plumbing was removed.
- Reworked the About page copy.

### Fixed
- The centered column no longer shifts between short and tall pages (scrollbar
  gutter), and the study view no longer causes horizontal overflow.
- The decorative St. Francis figure and the floating logo now cooperate with
  wide mode instead of overlapping the stretched reading surfaces.


## [1.4.0] - 2026-07-12

### Added
- **Advanced search.** The home search gains a disclosure with per-source book
  checkboxes and topic filters. Topic filters are a multiselect tags-combobox:
  typing narrows a suggestion list, chosen topics render as dismissible pills,
  and the filters AND-join. Selecting a topic with no text searches immediately,
  returning that topic's passages in reading order. Results nest book → chapter
  under collapsible headers.
- **Passage relations in the reader.** Parallel-passage links now surface under
  each paragraph in both directions, linking to the related passage with its
  relation type and verified mark. In editor mode a stepped picker walks
  book → chapter → passage in a modal, previewing the target through the reader
  and offering a full-corpus passage search.
- **Personal notes on bookmarks.** A bookmark can carry a free-text note, edited
  inline on the bookmarks page and shown under the passage label.
- **AI-usage disclaimer page** at `/ai` (English and Italian), detailing what is
  and is not AI-generated, its limitations, and how to report errors. Linked
  from the nav menu and from each book page's provenance note.
- **Refined annotation editing.** The add-topic picker opens in a searchable,
  focus-trapped modal with topic-category quick filters, and picking a topic
  advances to a confirm step where an optional comment can be attached in the
  same action.
- **Quieter reading view.** Outside editor mode, the topic and relation pills
  under each paragraph collapse to a single muted chip with a count that reveals
  them on tap.
- **Sung-psalm rendering.** Chanted texts in the newly added *Opuscula* display
  their psalm-pointing pauses (`<caesura>`) and Roman/Gallican psalter sigla
  (`<var psalter>`) from the reference edition.

### Fixed
- **Faster corpus loads.** A cached database is served immediately while it
  revalidates in the background (stale-while-revalidate); revalidation sends
  both `If-None-Match` and `If-Modified-Since` so hosts that vary the ETag no
  longer trigger needless re-downloads.
- The decorative St. Francis figure now shrinks into the content gutter and
  hides when there is no room, instead of running under the text on wide
  viewports and the parallel reader.
- The scrollbar gutter is reserved so the centered column no longer shifts
  between short and tall pages.

## [1.3.0] - 2026-07-05

### Added
- **Parallel reader.** Read a source text beside a chosen translation in two
  columns on wide screens, with editable translation asides. Toggle it from the
  language settings; the Latin column keeps the verse anchors so deep links and
  verse selection stay unambiguous.
- **Redesigned topic pages.** Occurrences now render through the same reader as
  the chapter view (read-only), grouped into collapsible book → chapter →
  passage sections and parallel-reader aware.
- **Auto-reload on new version.** The app detects a new deployment and offers to
  reload so returning visitors are not left on stale code.

### Fixed
- **Corpus download progress** is now a reliable, determinate 0–100% bar during
  the database download, instead of an indeterminate spinner.
- **Psalm scripture links** map Vulgate numbering to Masoretic so references
  resolve to the correct passage.
- The database manifest is served network-first, so a data-only redeploy reaches
  returning clients without a full app rebuild.


## [1.2.0] - 2026-07-03

### Added
- **In-app GitHub contributions.** Connect your GitHub account and stage
  annotation and prose edits while reading, then open a pull request against the
  corpus — fork, commit, and PR run client-side against your own token, with the
  OAuth Worker as the only backend.
- **"My Contributions" page** — signed-in profile, staged edits, your open pull
  request, and a history of closed and merged pull requests.
- **Pull-request review step** before submitting, with an editable title and
  description and an always-included, non-editable CC0 dedication.
- **First-contribution registration** in the corpus `contributors.yaml`.


## [1.1.0] - 2026-06-30

### Added
- **Prerendered hub and book routes.** The hub pages (`/`, `/about`,
  `/contribute`, `/topics`) and the book routes now prerender to real, crawlable
  HTML driven by a small `db-manifest.json` projection — a large SEO improvement
  and a working entry point for users with JavaScript disabled (NoScript notice
  included).
- **Book descriptions, short descriptions, and editorial notes in the UI**,
  rendered in the active UI language; notes are generated from each rendition's
  provenance.
- **DB loading UI** (`DbGate` / `DbProgressBar`) for the client-side database
  download.
- **Improved Navigation UI** restructuring navbar, adding logos and navigation to
  books.

### Changed
- **Ingestion updated for the new corpus schema** — translation and per-paragraph
  provenance, `description_short`, and normalized YAML data formats; the Rust
  parser, importer, and models were reworked accordingly.
- **Topic pills now show the full topic description.**
- Descriptions follow the UI language; assorted fixes after the schema changes.

## [1.0.0] - 2026-06-27 (Initial Release)

### Added
- **Read** each of the five source works chapter by chapter, in Latin, Italian,
  or English, with the reading interface in English or Italian.
- **Full-text search** across the whole corpus, jumping straight to the matching
  passage with terms highlighted.
- **Topic pages** for virtues, persons, places, and events that gather every
  relevant passage across all works.
- **Deep links** — a stable, shareable URL for every paragraph and verse.
- **Scriptural citations** highlighted straight from the reference editions.
- **PWA / offline support** — the SQLite database is cached after the first
  visit, so the app installs and works without a connection.
- **Responsive, accessible** reading with a light/dark medieval-manuscript palette.
- Fully **static architecture**: a Rust CLI compiles the corpus into a SQLite +
  FTS5 database that the SvelteKit app queries in the browser via `sql.js` (WASM),
  with no backend on the read path.
