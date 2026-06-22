# Franciscus

Web portal for exploring Franciscan sources: texts by Celano, Bonaventure and others, with thematic annotations and cross-work parallels.

## Architecture

The app is a **client-side rendered SPA** that ships a pre-built SQLite database to the browser. There is no application server for the read path — the entire site is static files.

```
franciscus/
  server/       Rust CLI — parses franciscus-data sources into a .db file
  app/          SvelteKit SPA — loads the .db client-side via sql.js
```

Source texts and annotations live in a separate repo ([franciscus-data](../franciscus-data), CC0 licensed). This repo contains only the application code (AGPL-3.0).

### Data flow

```
franciscus-data/          server/                  app/
  books/*.md        →   parse + import    →   franciscus.db
  annotations/*.json      (Rust CLI)          (static asset)
                                                   ↓
                                              sql.js (WASM)
                                                   ↓
                                              SvelteKit SPA
                                              (client-side queries)
```

### Language conventions

The app distinguishes two language layers:

- **Application language (English):** All UI text (labels, navigation, error messages), annotation evidence strings, and attribute page descriptions are written in English. The HTML document declares `<html lang="en">`.
- **Source language (Latin):** The source texts under `franciscus-data/books/` are in medieval Latin. Attribute values (e.g. `paupertas`, `conversio`) and relation types (e.g. `dipende_da`) use Latin/domain identifiers — these are machine keys, not user-facing labels.

### Design decisions

- **No server for reads.** The corpus is small (<1GB), static, and changes only at editorial pace. The .db file is shipped as a static asset and queried client-side via sql.js (SQLite compiled to WASM). This enables free static hosting and offline capability.
- **Rust for the data pipeline.** The server crate parses a custom Markdown format (see franciscus-data FORMAT.md) and JSON annotations into SQLite. It is a build tool, not a web server (though Axum API endpoints will be added here when user auth/contributions are needed).
- **SvelteKit for the frontend.** Chosen over Leptos SSR for contributor accessibility — mainstream JS framework with a gentler learning curve. Configured as a pure SPA (adapter-static, no SSR).
- **Tailwind CSS.** Utility-first styling, no component library. The app is primarily a reading interface — typography, layout, annotation badges.
- **Paragraph content rendered as raw HTML.** The source Markdown already contains inline `<ref to="...">text</ref>` tags and `[n]` verse markers. The app injects this via `{@html}` and styles `<ref>` elements with CSS (dotted underline, tooltip showing the reference on hover). No client-side parser port needed.
- **SQLite, not NoSQL.** The data is relational (books → chapters → paragraphs, annotations keyed to paragraphs, relations linking paragraph pairs across works). SQLite is the right fit and doubles as the client distribution format.
- **No ORM.** Six tables, hand-written SQL on both sides. The Rust side only writes; the TypeScript side only reads.
- **No shared type generation.** The type interfaces are simple enough (6 types) that manual synchronization is preferable to a codegen pipeline.
- **FTS5 for full-text search.** The Rust CLI builds an FTS5 index alongside the main database. Search runs client-side like all other queries.
- **Verse and aside IDs assigned during ingestion.** The CLI transforms `[N]` verse markers into `<v id="<paragraph-id>-N">` elements and assigns positional IDs to `<aside>` blocks (`<chapter_id>-aside-1`, `<chapter_id>-aside-2`, …). Source files stay clean; addressable elements are a build artifact.
- **Scripture references link to Nova Vulgata.** `<ref>` tags are rendered as links to [bibbiaedu.it](https://www.bibbiaedu.it/NOVAVULGATA/nt/) (`/nt/<book>/<ch>/`). Post-v1: language-aware Bible edition selection.
- **Deep linking to paragraph and verse.** Stable, shareable URLs: `/book/<book_id>/<chapter_id>#<paragraph_id>` (e.g. `/book/1Cel/c1#prolog-1`).
- **Content translations in separate DB tables.** Latin stays in the main `paragraphs` and `asides` tables. Translations go to `paragraph_translations(paragraph_id, lang, content)` and `aside_translations(aside_id, lang, content)`.
- **App UI i18n via JSON keys.** The UI string count is small; PO/gettext tooling would be overkill. JSON key files with a library like Paraglide or svelte-i18n.
- **Offline-first via Service Worker.** The database is downloaded with a progress indicator after the app shell loads. Service Worker and/or IndexedDB caching ensures repeat visits skip the download. PWA manifest enables installable mobile support.

### Future plans

- Axum API in `server/` for authenticated user contributions
- Vulgata edition for biblical reference lookup
- Wiki-like entity pages (places, people, virtues)
- Parallel text viewer (synoptic reading across works)

## Requirements

- Rust 1.75+ (edition 2021)
- Node.js 18+
- The [franciscus-data](../franciscus-data) repo at `../franciscus-data`

## Quick start

```bash
# Build the database from source texts
cargo run --manifest-path server/Cargo.toml -- build \
  --data-dir ../franciscus-data \
  --output app/static/franciscus.db

# Copy sql.js WASM file (first time only)
cp app/node_modules/sql.js/dist/sql-wasm.wasm app/static/

# Install frontend dependencies and start dev server
cd app && npm install && npm run dev
```

The app will be available at `http://localhost:5173`.

### Full production build

```bash
# Or use the Makefile: make all
cargo run --manifest-path server/Cargo.toml -- build \
  --data-dir ../franciscus-data \
  --output app/static/franciscus.db
cd app && npm run build
```

The output in `app/build/` is a self-contained static site deployable to any host.

## Stack

| Component   | Technology                             |
|-------------|----------------------------------------|
| Data pipeline | Rust (rusqlite, regex, serde, clap)  |
| Frontend    | SvelteKit 2 (SPA mode, adapter-static) |
| Styling     | Tailwind CSS 4                         |
| Client DB   | sql.js (SQLite compiled to WASM)       |
| Database    | SQLite                                 |

## Structure

```
server/src/
  main.rs        CLI entry point (build command)
  parser.rs      Parser for the source Markdown format
  db.rs          SQLite schema creation and data insertion
  models.rs      Rust data structures (BookMeta, ParsedChapter, Block, AnnotationFile)

app/src/
  lib/
    db.ts        sql.js wrapper and query functions
    types.ts     TypeScript interfaces (BookMeta, Chapter, Paragraph, Annotation, ...)
    index.ts     Public API re-exports
  routes/
    +layout.svelte        Root layout — initializes sql.js, loading state
    +layout.ts            SPA configuration (ssr=false, prerender=false)
    +page.svelte          Home — list of works
    book/[book_id]/
      +page.svelte        Book detail — metadata and chapter list
      [chapter_id]/
        +page.svelte      Chapter reading view — paragraphs, asides, annotations, navigation
  app.css                 Tailwind import + <ref> element styling
```

## Routes

| Path                            | Page                 |
|---------------------------------|----------------------|
| `/`                             | List of works        |
| `/book/:book_id`                | Chapters of a work   |
| `/book/:book_id/:chapter_id`    | Chapter reading view |

## License

[AGPL-3.0-or-later](LICENSE) — see the LICENSE file for the full text.
