<div align="center">

# Franciscus

**A digital portal for the Franciscan source texts.**

The early biographies of Francis of Assisi — in the original medieval Latin,
with translations, full-text search, and thematic cross-references — as a fast,
offline-capable web app.

[**▶ Open the app — franciscus.app**](https://franciscus.app)
 
[![Live](https://img.shields.io/badge/live-franciscus.app-green)](https://franciscus.app)
[![App license: AGPL-3.0](https://img.shields.io/badge/app-AGPL--3.0-blue)](LICENSE)
[![Corpus license: CC0](https://img.shields.io/badge/corpus-CC0--1.0-lightgrey)](https://github.com/FranciscusApp/franciscus-data)
[![Built with SvelteKit](https://img.shields.io/badge/SvelteKit-5-ff3e00?logo=svelte&logoColor=white)](https://kit.svelte.dev)
[![Pipeline: Rust](https://img.shields.io/badge/pipeline-Rust-dea584?logo=rust&logoColor=black)](server/)

</div>

---

<!-- Drop screenshots into docs/ and uncomment:
<div align="center">
  <img src="docs/reader.png"  alt="Reader view" width="48%">
  <img src="docs/search.png"  alt="Search view" width="48%">
</div>
-->

## What it is

Franciscus collects the **early sources for the life of Francis of Assisi** and
makes them genuinely readable on the web — searchable, deep-linkable, and
annotated, without losing the original Latin.

### The corpus

| Source | Title | Author |
|---|---|---|
| **1Cel** | Vita Prima | Thomas of Celano |
| **2Cel** | Vita Secunda | Thomas of Celano |
| **LMj**  | Legenda Maior | Bonaventure |
| **3Soc** | Legenda Trium Sociorum | The Three Companions |
| **Testamentum** | Testamentum Sancti Francisci | Francis of Assisi |
| **Opuscula** | Opuscula Omnia (the writings of Francis) | Francis of Assisi |
| **Adm** | Admonitiones | Francis of Assisi |
| **OffPass** | Officium Passionis Domini | Francis of Assisi |
| **RegB** | Regula bullata | Francis of Assisi |
| **RegNB** | Regula non bullata | Francis of Assisi |

### What you can do

- 📖 **Read** each work chapter by chapter, in the original **Latin**, in **Italian**, or in **English**, with a reading interface in **English or Italian**.
- 🔎 **Search** the whole corpus full-text and jump straight to the matching
  passage, with the matched terms highlighted in the reader.
- 🏷️ **Follow themes** — virtues, persons, places and events get their own
  topic pages that gather every relevant passage across all the works.
- 🆚 **Compare accounts** — the study view opens any two chapters side by
  side, each pane pairable with a corpus-wide search.
- 🔗 **Link deeply** — every paragraph and verse has a stable, shareable URL
  (e.g. `/book/1Cel/c1#prolog-1`).
- 📑 **View scriptural citations** — biblical quotations highlit, straight from the reference editions.
- 📱 **Install it / go offline** — it's a PWA: the database is cached after the
  first visit, so it works without a connection and installs like an app.
- ♿ **Read it any way you like** — mobile-responsive, accessible, with a
  light/dark medieval-manuscript palette.

## How it works (the short version)

Franciscus is a **fully static site with no backend on the read path**. A Rust
CLI compiles the Markdown corpus into a single SQLite database (with an FTS5
search index); the SvelteKit app ships that `.db` as a static asset and queries
it **directly in the browser** via `sql.js` (SQLite compiled to WebAssembly).

```
franciscus-data/        server/ (Rust CLI)        app/ (SvelteKit SPA)
  books/*.md       →   parse + import   →   franciscus.db  →  sql.js (WASM)
  books/*.yaml                              (static asset)     in the browser
```

That's the whole architecture: free to host, fast to read, offline by default.

The same build step also emits a small `db-manifest.json` (a KB-scale projection
of the DB — corpus meta, book list, topic list) and a `sitemap.xml` next to the
`.db`. The hub routes (`/`, `/about`, `/contribute`, `/topics`) read the manifest
via a SvelteKit `load()`, so they are prerendered to real, crawlable HTML and
render without downloading the database.

| Component | Technology |
|---|---|
| Frontend | SvelteKit 2 / Svelte 5 (SPA, `adapter-static`) |
| Styling | Tailwind CSS 4 + shadcn-svelte |
| Client DB | `sql.js` (SQLite + FTS5 in WASM) |
| Data pipeline | Rust (`rusqlite`, `clap`, `serde`, `regex`) |
| Hosting | GitHub Pages (static) |

The source texts and annotations live in a **separate repository**,
[`franciscus-data`](https://github.com/FranciscusApp/franciscus-data)
(CC0). This repo holds only the application code.

## Run it locally

```bash
# from a parent dir holding both ./franciscus and ./franciscus-data side by side
cd franciscus
make dev        # builds the .db from ../franciscus-data and starts the dev server
```

Then open <http://localhost:5173>. Requires **Rust** (stable) and **Node.js 22+**.

For a production build (`app/build/` — a self-contained static site), run
`make app`. More detail, and how the GitHub Pages deploy works, is in
[CONTRIBUTING.md](CONTRIBUTING.md).

Already shipped since 1.0: a **parallel side-by-side reader**, a **study view**
comparing any two chapters, **English translations**, the **Opuscula**
(Francis's own writings, with the *Admonitiones*, *Officium Passionis*, and the
two Rules as standalone books), redesigned reader-based **topic pages**,
**advanced search** with book and topic filters, **passage relations** in the
reader, **book collections** on the home page, a **wide layout** for large
screens, and **in-app GitHub contributions** (login, edit, and open a pull
request — fork/commit/PR run client-side against your own token, with an OAuth
Worker as the only backend). See the [CHANGELOG](CHANGELOG.md).

Still ahead:

- 🧭 **Fuller wiki-like pages** for persons, places, and events, with
  cross-referenced passages.
- 🔎 **Human review** of the machine transcriptions, translations, and
  annotations.

See [ROADMAP.md](ROADMAP.md) for the full list.

## Contributing

Corrections to the texts, translations, annotations, and code are all welcome —
see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## A note on AI

Much of the corpus is **machine-generated and not yet fully reviewed by a
human** — transcriptions, translations, and annotations alike — so expect
occasional errors. Treat Franciscus as a reading and discovery tool, **not** a
critical edition. Details are in the
[corpus repo's README](https://github.com/FranciscusApp/franciscus-data);
reporting mistakes helps — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

- **Application code** (this repo): [AGPL-3.0-or-later](LICENSE).
- **Corpus** ([`franciscus-data`](https://github.com/FranciscusApp/franciscus-data)):
  CC0-1.0 (public domain).

## Get in touch

<div align="center">

<a href="https://verbumcaro.it"><img src="https://raw.githubusercontent.com/FranciscusApp/franciscus/refs/heads/master/app/static/vc-inline-dark.png" alt="Verbum Caro" width="240"></a>

</div>

A **Verbum Caro** project. Questions, corrections, or collaboration —
reach us at [info@verbumcaro.it](mailto:info@verbumcaro.it).
