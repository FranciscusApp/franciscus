# Roadmap

A digital portal for the Franciscan source texts.
The app ships as a static SvelteKit SPA with client-side SQLite (sql.js);
a Rust CLI builds the `.db` from the markdown corpus at editorial pace.

Status legend: `[ ]` planned | `[~]` in progress | `[x]` done

---

## v1.0.0

### Content

- [ ] Complete **2Cel** (Vita Seconda) transcription
- [ ] Complete **LMj** (Legenda Maior) transcription
- [x] Parse verse markers `[N]` during ingestion into `<v id="<paragraph-id>-N">N</v>` so verses are individually styleable and addressable client-side
- [ ] Assign positional IDs to `<aside>` elements during ingestion (auto-incrementing per chapter: `<chapter_id>-aside-1`, `<chapter_id>-aside-2`, ...)

### Search & Discovery

- [ ] Build FTS5 index in the Rust CLI alongside the main DB
- [ ] Search page: query input, ranked results with context snippets, click-through to the matching passage
- [ ] Highlight matched terms inside the reader when arriving from a search result

### Reader UI

- [ ] Full, first-class breadcrumbs (Home > Book > Chapter)
- [ ] Scripture references (`<ref>` tags) rendered as links to [bibbiaedu.it Nova Vulgata](https://www.bibbiaedu.it/NOVAVULGATA/nt/) (`/nt/<book>/<ch>/`)
- [x] Verse-level styling and interaction via the generated `<v>` elements
- [ ] Navigable links from relation and annotation badges to their target passages
- [ ] Deep linking: stable, shareable URLs down to paragraph and verse (`/book/1Cel/c1#prolog-1`)
- [ ] "Copy citation" action (copies a formatted reference to clipboard)
- [ ] Mobile-responsive layout (long Latin paragraphs, comfortable reading on small screens)

### Annotations & Attributes

- [ ] Annotation data model in the DB (paragraph-keyed, typed attributes, provenance field)
- [ ] Attribute page ingestion in the Rust CLI (parse frontmatter + markdown, insert into DB, load translations)
- [ ] Attribute page rendering: curated intro + auto-generated passage list for each virtue / topic / person / place
- [ ] AI annotation pipeline, pass 1: segmentation, themes, biblical allusions (high confidence)
- [ ] AI annotation pipeline, pass 2: cross-work parallels seeded from *Fontes Franciscani* concordances (requires review)

### Internationalization

- [ ] Implement content translation ingestion in the Rust CLI (walk `books/<id>.<lang>.md`, parse, insert into translation tables)
- [ ] Add `paragraph_translations` and `aside_translations` tables to the DB schema
- [ ] App UI i18n setup (JSON key files, language switcher component)
- [ ] UI for selecting corpus language and UI language independently (default: Latin corpus, English UI)

### Infrastructure

- [ ] DB download with progress indicator after the app shell loads
- [ ] Client-side caching strategy (Service Worker and/or IndexedDB) so repeat visits skip the download
- [ ] PWA manifest + service worker for offline and installable mobile support
- [ ] Deployment pipeline (hosting provider TBD; the site is fully static)

---

## Post v1.0.0

- [ ] **Side-by-side reader** for comparing parallel texts or translations
- [ ] **GitHub login + in-app contributions** (translations, corrections, annotation proposals)
- [ ] **Axum API backend** to support user auth, contribution submission, and moderation
- [ ] **Vulgata edition** added to the corpus
- [ ] **Wiki-like entity pages** (persons, places, events) with cross-referenced passages
- [ ] **Language-aware Bible links** (choose Bible edition based on the active corpus language; Nova Vulgata is hardcoded for v1)
