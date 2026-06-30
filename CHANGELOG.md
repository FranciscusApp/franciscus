# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).
This project also tries to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html),
although it not being a library and not exposing any APIs means the definitions for "major, minor, patch"
might be somewhat loose or subjective.


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
