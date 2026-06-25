# Roadmap

A digital portal for the Franciscan source texts.
The app ships as a static SvelteKit SPA with client-side SQLite (sql.js);
a Rust CLI builds the `.db` from the markdown corpus at editorial pace.

Status legend: `[ ]` planned | `[~]` in progress | `[x]` done

---

## v1.0.0

### Content
- [x] Complete **1Cel** (Vita Prima) machine transcription
- [x] Complete **2Cel** (Vita Seconda) machine transcription
- [x] Complete **LMj** (Legenda Maior) machine transcription
- [x] (BONUS, NOT INITIALLY MEANT FOR v1.0.0) Complete **3Soc* (Legenda Triorum Sociorum) machine transcription
- [x] (BONUS, NOT INITIALLY MEANT FOR v1.0.0) Complete **Testamentum* (Testamentum Frate Francisci) machine transcription
- [x] (BONUS, NOT INITIALLY MEANT FOR v1.0.0) Italian Machine translation for all sources
- [x] (BONUS, NOT INITIALLY MEANT FOR v1.0.0) Italian machine annotation for all sources
- [x] Parse verse markers `[N]` during ingestion into `<v id="<paragraph-id>-N">N</v>` so verses are individually styleable and addressable client-side
- [x] Assign positional IDs to `<aside>` elements during ingestion (auto-incrementing per chapter: `<chapter_id>-aside-1`, `<chapter_id>-aside-2`, ...)
- [x] Draft wiki-like pages for topics (persons, places, events)

### Search & Discovery
- [x] Build FTS5 index in the Rust CLI alongside the main DB
- [x] Search page: query input, ranked results with context snippets, click-through to the matching passage
- [x] Highlight matched terms inside the reader when arriving from a search result

### General UI
- [x] Adopt an UI library to simplify pages (Shadcn seems to have a svelte integration)
- [x] Mobile-responsive layout
- [x] Fix all accessibility, a11y, and aria-* related issues, and ensure reader compatibility.
- [x] Expressive style, golden-crimson-white (light mode) and golden-royal blue-dark night blue (dark mode) palette. Should be reminiscent of medieval manuscripts but with a modern, readable interpretation. 
- [x] Italian and English machine translation
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
- [~] Deployment pipeline (Github Pages)

---

## Post v1.0.0

- [ ] **Side-by-side reader** for comparing parallel texts or translations
- [ ] **GitHub login + in-app contributions** (translations, corrections, annotation proposals)
- [ ] **Axum API backend** to support user auth, contribution submission, and moderation
- [ ] "Copy citation" action (copies a formatted reference to clipboard)
- [ ] Scripture references (`<ref>` tags) rendered as links to [bibbiaedu.it Nova Vulgata](https://www.bibbiaedu.it/NOVAVULGATA/nt/) (`/nt/<book>/<ch>/`)
- [ ] **Vulgata edition** added to the corpus
- [ ] **Fuller Wiki-like entity pages** (persons, places, events) with cross-referenced passages
- [ ] **Language-aware Bible links** (choose Bible edition based on the active corpus language; Nova Vulgata is hardcoded for v1)
- [ ] **Full manual review of latin sources**
- [ ] **Full manual review of translation**
- [ ] AI annotation pipeline, pass 2: cross-work parallels seeded from *Fontes Franciscani* concordances (requires review)
- [ ] Abstract all SQL queries into a primarily-data Rust library (compilable to WASM), reusable by both Rust APIs and the client