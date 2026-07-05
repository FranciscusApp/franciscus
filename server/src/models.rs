use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

// Deserialized straight from the YAML frontmatter via serde_yaml, so block
// scalars (`description: >`), quoting, and bare `key:` → null all work. `id`
// and any absent optional come from `#[serde(default)]`; `id` is then set from
// the filename by the parser.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookMeta {
    /// Derived from the filename, not the frontmatter.
    #[serde(default)]
    pub id: String,
    pub title: String,
    pub author: String,
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub reference_edition: Option<String>,
    /// Where the source-language (Latin) text was obtained, on base `<id>.md`
    /// files. Feeds the book page's editorial note for the source rendition,
    /// the counterpart of `translation_source` for translations.
    #[serde(default)]
    pub source: Option<String>,
    // Editorial descriptions live in the per-book sidecar (`books/<id>.yaml`,
    // keyed by UI language); they describe the work, not any one rendition.
    // See `BookSidecar`.
    // Translation-only frontmatter; None on source `<id>.md` files. These carry
    // the rendition's provenance, from which the book page's editorial note is
    // generated client-side (per UI language).
    #[serde(default)]
    pub translator: Option<String>,
    #[serde(default)]
    pub provenance: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub translation_source: Option<String>,
}

// --- Parsed structures (from markdown, before DB insertion) ---

#[derive(Debug, Clone)]
pub enum Block {
    Paragraph {
        id: String,
        label: Option<String>,
        content: String,
        position: u32,
        // Per-paragraph translation provenance; inherits frontmatter defaults.
        // Always None on source `<id>.md` paragraphs.
        provenance: Option<String>,
        by: Option<String>,
    },
    Aside {
        id: String,
        content: String,
        position: u32,
    },
}

#[derive(Debug, Clone)]
pub struct ParsedChapter {
    pub id: String,
    pub title: String,
    pub position: u32,
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone)]
pub struct ParsedBook {
    pub meta: BookMeta,
    pub chapters: Vec<ParsedChapter>,
}

// --- Per-book YAML sidecar (spec/annotations.md) ---
// File is `books/<book_id>.yaml`; book_id comes from the filename. It carries
// book-level "cover" properties (editorial descriptions, keyed by UI language)
// at the top, and the paragraph annotations nested under `annotations`.

/// DB `by_whom` for AI-authored items (no `by`). Must match the handle-less
/// default the app/scripts assume; see spec/annotations.md.
pub const CLAUDE_BY: &str = "Claude <noreply@anthropic.com>";

/// The whole sidecar. Both sections are optional so a book may have only
/// annotations, only cover descriptions, or both. `description_short` /
/// `description` map a UI language code (`en`, `it`, …) to its text; the long
/// `description` value is authored as Markdown and rendered to HTML at ingest.
/// `annotations` is the paragraph-grouped map: paragraph id → items.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct BookSidecar {
    #[serde(default)]
    pub description_short: BTreeMap<String, String>,
    #[serde(default)]
    pub description: BTreeMap<String, String>,
    #[serde(default)]
    pub annotations: BTreeMap<String, Vec<AnnotationItem>>,
}

/// One annotation item under a paragraph key. A bare scalar (`person:x` or
/// `same_episode:LMj-1`) is AI-authored with no comment; the map form carries
/// overrides. Exactly one of `topic`/`relation` is set in the map form.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum AnnotationItem {
    Bare(String),
    Detailed {
        #[serde(default)]
        topic: Option<String>,
        #[serde(default)]
        relation: Option<String>,
        /// Contributor handle; presence marks the item human-authored.
        #[serde(default)]
        by: Option<String>,
        /// Last paragraph id when the annotation spans a range (topics only).
        #[serde(default)]
        to: Option<String>,
        #[serde(default)]
        comment: Option<String>,
    },
}

/// Human contributor registry (`franciscus-data/contributors.yaml`), keyed by
/// GitHub login (an email-only contributor uses a plain handle). Claude is never
/// listed — it is the default author.
pub type Contributors = BTreeMap<String, Contributor>;

#[derive(Debug, Clone, Deserialize)]
pub struct Contributor {
    pub name: String,
    #[serde(default)]
    pub email: Option<String>,
    /// GitHub login; equals the map key when present (marks a GitHub contributor).
    #[serde(default)]
    #[allow(dead_code)] // commit/PR attribution.
    pub github: Option<String>,
}

impl Contributor {
    /// DB `by_whom` form: `Name <email>` when an email is present, else `Name`.
    pub fn by_whom(&self) -> String {
        match &self.email {
            Some(e) => format!("{} <{}>", self.name, e),
            None => self.name.clone(),
        }
    }
}

/// Topic-page YAML frontmatter. Both `topic_type` and `topic_value` are NOT
/// carried here — they are derived from the path (`topics/<type>/<value>[.<lang>].md`).
#[derive(Debug, Clone, Deserialize)]
pub struct TopicPageFrontmatter {
    pub description: String,
}

#[derive(Debug, Clone)]
pub struct TopicPage {
    pub frontmatter: TopicPageFrontmatter,
    pub content: String,
}

// --- Build-time manifest (app/static/db-manifest.json) ---
//
// A tiny projection of the DB the hub pages need so they can render (and
// prerender) without the 12 MB sql.js database: corpus meta, the book list,
// and the annotated-topic list. Emitted by the CLI next to `franciscus.db` in
// the same build, so the two cannot drift. The app mirrors these shapes in
// `app/src/lib/types.ts`; keep them in sync manually (no codegen).

/// Bump when the manifest layout changes incompatibly (the app may gate on it).
pub const MANIFEST_SCHEMA: u32 = 3;

#[derive(Debug, Clone, Serialize)]
pub struct Manifest {
    pub schema: u32,
    pub corpus: ManifestCorpus,
    pub books: Vec<ManifestBook>,
    pub topics: Vec<ManifestTopic>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ManifestCorpus {
    pub data_commit: String,
    pub data_commit_date: String,
    pub built_at: String,
    pub book_count: u32,
    /// Uncompressed size of `franciscus.db` in bytes. The client uses it as the
    /// download total for a determinate progress bar: the byte stream is always
    /// decompressed, so this matches even when the transfer is gzip/chunked and
    /// carries no usable `Content-Length`.
    pub db_bytes: u64,
    /// Corpus translation languages (e.g. `["it"]`); the canonical Latin source
    /// is always present and not listed here.
    pub languages: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ManifestBook {
    pub id: String,
    pub title: String,
    pub author: String,
    pub date: Option<String>,
    pub reference_edition: Option<String>,
    /// Base descriptions (English default; see `BookMeta`). Localized variants
    /// come from the DB once it loads; the manifest carries the base for
    /// prerender. The book page's editorial note is generated from rendition
    /// provenance (DB-only), so it is not carried here.
    pub description_short: Option<String>,
    pub description: Option<String>,
    /// Source-language chapter list, in reading order, so `/book/<id>` can
    /// prerender its table of contents without the sql.js DB.
    pub chapters: Vec<ManifestChapter>,
    /// Languages this book has a translation in.
    pub translations: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ManifestChapter {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ManifestTopic {
    #[serde(rename = "type")]
    pub topic_type: String,
    pub value: String,
    pub count: u32,
    /// Source-language label (the base topic-page description).
    pub description: String,
    /// Localized label per UI language. Includes every language with a topic
    /// translation, so the client can switch UI language without the DB.
    pub descriptions: BTreeMap<String, String>,
}
