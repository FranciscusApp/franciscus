# Roadmap

The single roadmap for the whole Franciscus project — app, corpus, and scripts.
It records where the project has been and where it's going. Once there are
contributors, granular work may move to GitHub issues; for now the direction
lives here, in one place.

**v1.0.0 has shipped.** Its checklist is kept below as a record of what the first
release covered. Everything under [Post v1.0.0](#post-v100) is grouped roughly by
priority — top groups are nearer-term.

Status legend: `[ ]` planned | `[~]` in progress | `[x]` done

---

## v1.0.0

### Content
- [x] Complete **1Cel** (Vita Prima) machine transcription
- [x] Complete **2Cel** (Vita Secunda) machine transcription
- [x] Complete **LMj** (Legenda Maior) machine transcription
- [x] Complete **3Soc** (Legenda Trium Sociorum) machine transcription *(bonus)*
- [x] Complete **Testamentum** (Testamentum Fratris Francisci) machine transcription *(bonus)*
- [x] Italian machine translation for all sources *(bonus)*
- [x] Italian machine annotation for all sources *(bonus)*
- [x] Parse verse markers `[N]` during ingestion into `<v id="<paragraph-id>-N">N</v>` so verses are individually styleable and addressable client-side
- [x] Assign positional IDs to `<aside>` elements during ingestion (auto-incrementing per chapter: `<chapter_id>-aside-1`, `<chapter_id>-aside-2`, ...)
- [x] Draft wiki-like pages for topics (persons, places, events)

*(Items marked bonus were not in the original v1.0.0 scope but landed in the first release anyway.)*

### Search & Discovery
- [x] Build FTS5 index in the Rust CLI alongside the main DB
- [x] Search page: query input, ranked results with context snippets, click-through to the matching passage
- [x] Highlight matched terms inside the reader when arriving from a search result

### General UI
- [x] Adopt a UI library to simplify pages (shadcn-svelte)
- [x] Mobile-responsive layout
- [x] Fix all accessibility, a11y, and aria-* related issues, and ensure reader compatibility
- [x] Expressive style: golden-crimson-white (light) and golden-royal-blue / night-blue (dark) palette, reminiscent of medieval manuscripts but with a modern, readable interpretation
- [x] Italian and English UI machine translation
- [x] Full, first-class breadcrumbs. Breadcrumbs now follow the path the user actually traversed
      (a session-persisted trail among content pages), not the static site map. Going from a chapter
      to a topic page keeps the chapter in the trail; hubs (home, topics index, About/Contact/etc.)
      reset the trail and show no breadcrumb.

### Reader UI
- [x] Verse-level styling and interaction via the generated `<v>` elements
- [x] Navigable links from relation and annotation badges to their target passages
- [x] Deep linking: stable, shareable URLs down to paragraph and verse (`/book/1Cel/c1#prolog-1`)

### Annotations & Topics
- [x] Annotation data model in the DB (paragraph-keyed, typed topics, provenance field)
- [x] Topic page ingestion in the Rust CLI (parse frontmatter + markdown, insert into DB, load translations)
- [x] Topic page rendering: curated intro + auto-generated passage list for each virtue / theme / person / place
- [x] Curated topic list lock-down
- [x] AI annotation pipeline, pass 1: segmentation, themes, biblical allusions (high confidence)

### Internationalization
- [x] Implement content translation ingestion in the Rust CLI (walk `books/<id>.<lang>.md`, parse, insert into translation tables)
- [x] Add `paragraph_translations` and `aside_translations` tables to the DB schema
- [x] App UI i18n setup (JSON key files, language switcher component)
- [x] UI for selecting corpus language and UI language independently (default: Latin corpus, English UI)

### Infrastructure
- [x] DB download with progress indicator after the app shell loads
- [x] Client-side caching strategy (Service Worker and/or IndexedDB) so repeat visits skip the download
- [x] PWA manifest + service worker for offline and installable mobile support
- [x] Deployment pipeline (GitHub Pages)

---

## Post v1.0.0

### Polish & fixes — next
- [x] **UI flourish.** The gold primary colour barely appears anywhere. Bring it (and secondary crimson / royal-blue accents) into title underlines and `<hr>` dividers so pages read richer and more manuscript-like. Dividers might be good secondary, while `<strong>` or `<h1>` could be gold, to consider.
Also the gold should match the Verbum Caro logo gold.
- [x] **Reader layout fixes.**
      - The navbar overlays body text once the page is scrolled. Give it a body-matched background plus a fade-on-scroll shadow so text passes cleanly underneath.
      - Some pages scroll horizontally on mobile. Most likely cause: `<ref>` popovers overflowing the viewport — constrain them to screen width.
- [x] **Domain redirect.** Add a GitHub Pages `CNAME` and redirect `www.franciscus.app` to the naked domain.
- [x] **Typography.** Slightly larger base text, ideally a user-tweakable size control.
- [x] **Version visibility.** Surface the DB and app version somewhere in-app (footer or About page) so a reader can tell which build and corpus snapshot they're on.

### Data corrections — next
- [x] **Phantom topics.** AI annotation invented topic values outside the controlled vocabulary (e.g. `virtue:prayer`). Reconcile every annotation against `topics/topics.yaml`, mapping or dropping the strays.
- [x] **Untranslated book titles.** Titles still render in Latin under translated UIs; add their translations.
- [x] **English translations.** Machine-translate all sources into English (the corpus currently ships Latin + Italian).

### Reader features
- [x] Search results and topic references grouped by book and chapter (one "box entry" per chapter, with paragraphs joined by [...])
- [x] **Bookmarks & reading progress.** Let readers mark passages and resume where they left off — client-side only, no account required.
- [ ] **Side-by-side reader.** _(on hold)_ Parallel-column view for comparing two works, or two translations of the same passage.
- [x] **Copy citation.** One-click copy of a formatted, shareable reference for any passage.

### Scripture cross-referencing
- [ ] **Bible reference modal.** Clicking a `<ref>` opens a modal showing the referenced passage, fetched from a source chosen by the active UI language.
  - [ ] Design the modal UI.
  - [ ] Bibbiaedu driver (Italian → CEI 2008): no API, so fetch + parse the page.
  - [ ] Define the English source (TBD) and implement its driver.

### In-app contributions
- [x] **GitHub login + contribution flow.** Sign in to propose corrections, translations, and annotation edits from within the app.

### Long-term & ongoing / Content quality
- [ ] **Manual review of the Latin sources.** Human verification of the machine transcriptions.
- [ ] **Manual review of translations.** Human verification of machine translations. Today a translation file is all-or-nothing with no per-passage provenance; this likely needs a format change to mark reviewed passages.
- [ ] **AI annotation pass 2.** Cross-work parallels seeded from *Fontes Franciscani* concordances (requires human review).
- [ ] **Fuller entity pages.** Grow the persons / places / events topic pages into wiki-like entries with cross-referenced passages and richer curated context.
