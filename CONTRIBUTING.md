# Contributing to Franciscus

Thanks for wanting to help. There are two kinds of contribution, and they live
in two different repos:

- **Content** — texts, translations, annotations, topic pages → the
  [`franciscus-data`](https://github.com/snowstorm-alfredosalata/franciscus-data)
  repo (CC0).
- **Code** — the app and the data pipeline → **this** repo (AGPL-3.0).

When in doubt, [open an issue](https://github.com/snowstorm-alfredosalata/franciscus/issues)
first and we'll point you the right way.

---

## Contributing content

The corpus is machine-transcribed, machine-translated, and machine-annotated, so
**spotting errors is genuinely useful** — wrong words, bad line breaks,
mistranslations, or annotations that point at the wrong passage.

All of this lives in the
**[`franciscus-data`](https://github.com/snowstorm-alfredosalata/franciscus-data)**
repo, which has its own README and CONTRIBUTING covering the source format,
the annotation vocabulary, and the editing workflow.

- **Found a small error while reading?** The fastest path is an
  [issue](https://github.com/snowstorm-alfredosalata/franciscus-data/issues) on
  the data repo. Include the URL of the passage (it deep-links down to the verse)
  and what's wrong.
- **Want to fix it yourself?** Head to
  [`franciscus-data`](https://github.com/snowstorm-alfredosalata/franciscus-data)
  and follow its CONTRIBUTING.

## Contributing code

1. Get it running locally (below).
2. Branch, make your change, run `make check` (Svelte type-check) in `app/`.
3. Open a PR against this repo.

Development is currently driven by the in-repo [ROADMAP.md](ROADMAP.md) rather
than the issue tracker. If you'd like to pick something up or propose work,
[get in touch](https://github.com/snowstorm-alfredosalata/franciscus/issues) —
we'll open and use issues to coordinate from there.

---

## Technical heads-up

### Local setup

Check out **both** repos side by side — the build defaults to
`DATA_DIR ?= ../franciscus-data`:

```
parent/
├── franciscus/        ← this repo (app + server)
└── franciscus-data/   ← corpus repo
```

Requirements: **Rust** (stable, edition 2021 — `rusqlite` is `bundled`, so no
system SQLite needed) and **Node.js 22+** (Vite 8 / Svelte 5 need a current LTS).

```bash
cd franciscus
make dev      # = make install + make db + npm run dev
```

Makefile targets: `install` (npm + WASM copy), `db` (Rust build → `.db`),
`app` (full production build), `dev`, `check`, `clean`.

> ⚠️ **The WASM file must come from `fts5-sql-bundle`, not stock `sql.js`.**
> `make install` copies it for you. The two builds' glue and binary are not
> interchangeable — using the wrong `sql-wasm.wasm` causes a
> `WebAssembly.instantiate` LinkError at runtime, and stock `sql.js` has no FTS5
> search anyway.

### Architecture & key decisions

A static SPA that ships a prebuilt SQLite DB queried client-side via `sql.js`.
The Rust crate in `server/` is a **build tool, not a web server**.

- **No server for reads.** The corpus is small and changes at editorial pace, so
  the `.db` is a static asset. Free static hosting, offline capability.
- **Rust for the pipeline.** Parses the custom `FORMAT.md` Markdown + JSON
  annotations into SQLite. Writes only.
- **SvelteKit, SPA mode.** `adapter-static`, no SSR (`ssr=false`,
  `prerender=false` in `+layout.ts`). Chosen over a Rust SSR stack for
  contributor accessibility.
- **Tailwind 4 + shadcn-svelte** for UI; the app is primarily a reading
  interface — typography, layout, annotation badges.
- **Paragraph content is raw HTML.** Source Markdown already carries inline
  `<ref to="...">` tags and `[n]` verse markers; the app injects it with
  `{@html}` and styles `<ref>` with CSS. No client-side parser port.
- **SQLite, hand-written SQL, no ORM.** Rust side writes, TS side reads. Types
  are synced manually (`server/src/models.rs` ↔ `app/src/lib/types.ts`).
- **FTS5** index built alongside the main DB; search runs client-side like
  everything else.
- **Verse / aside IDs assigned at ingestion.** `[N]` → `<v id="<para>-N">`;
  `<aside>` blocks get positional IDs. Source files stay clean.
- **Translations in separate tables** (`paragraph_translations`,
  `aside_translations`); Latin stays in the base tables. UI i18n is JSON key
  files.
- **Offline-first.** DB downloaded with a progress indicator after the shell
  loads; Service Worker + PWA manifest make it cacheable and installable.

### Layout

```
server/src/        main.rs (CLI) · parser.rs · db.rs (schema) · models.rs
app/src/lib/       db.ts (sql.js wrapper) · types.ts · index.ts
app/src/routes/    + home · book/[book_id]/[chapter_id] · topics/... ·
                   about · contact · contribute
```

### Deployment

The site is deployed to **GitHub Pages** at <https://franciscus.app> via
`.github/workflows/deploy.yml`. The workflow checks out both repos side by side,
runs `make app`, and publishes `app/build/` using the official Pages "Actions"
source (no `gh-pages` branch, no build output in git).

Triggers: push to `master`, manual `workflow_dispatch`, and a
`repository_dispatch` (`corpus-updated`) the data repo can fire so corpus edits
redeploy automatically.

> 📌 **Root-path constraint.** [`app/src/lib/db.ts`](app/src/lib/db.ts) fetches
> `/franciscus.db` and `/sql-wasm.wasm` as **absolute** paths, and there is no
> SvelteKit `base` configured — so the site must be served from a **domain
> root** (hence the custom domain + `CNAME`), not a subpath. To serve from a
> subpath instead, set `kit.paths.base` and prefix those asset paths with it.

To exercise the production build locally, serve from a root path:

```bash
make app && npx serve app/build    # then visit the printed URL
```
