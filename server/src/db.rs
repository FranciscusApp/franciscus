use rusqlite::{Connection, params};
use regex::Regex;
use std::collections::BTreeMap;
use crate::models::*;

/// Shape version of the DB the app expects. Bump whenever the table layout
/// changes; mirrored into `PRAGMA user_version` and a `meta` row so the app
/// can detect an incompatible build. Stored but not gated on yet.
pub const SCHEMA_VERSION: u32 = 3;

pub fn open_or_create(path: &str) -> Connection {
    let conn = Connection::open(path).expect("Failed to open database");
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .expect("Failed to set pragmas");
    conn
}

pub fn create_tables(conn: &Connection) {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS books (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            author          TEXT NOT NULL,
            date            TEXT,
            ref_edition     TEXT,
            description_short TEXT
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id              TEXT NOT NULL,
            book_id         TEXT NOT NULL REFERENCES books(id),
            position        INTEGER NOT NULL,
            title           TEXT NOT NULL,
            PRIMARY KEY (book_id, id)
        );

        CREATE TABLE IF NOT EXISTS paragraphs (
            id              TEXT NOT NULL,
            book_id         TEXT NOT NULL,
            chapter_id      TEXT NOT NULL,
            position        INTEGER NOT NULL,
            content         TEXT NOT NULL,
            label           TEXT,
            PRIMARY KEY (book_id, id),
            FOREIGN KEY (book_id, chapter_id) REFERENCES chapters(book_id, id)
        );

        CREATE TABLE IF NOT EXISTS asides (
            id              TEXT NOT NULL,
            book_id         TEXT NOT NULL,
            chapter_id      TEXT NOT NULL,
            position        INTEGER NOT NULL,
            content         TEXT NOT NULL,
            PRIMARY KEY (book_id, id),
            FOREIGN KEY (book_id, chapter_id) REFERENCES chapters(book_id, id)
        );

        CREATE TABLE IF NOT EXISTS annotations (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id         TEXT NOT NULL,
            paragraph_id    TEXT NOT NULL,
            paragraph_to_id TEXT,
            topic_type       TEXT NOT NULL,
            topic_value      TEXT NOT NULL,
            by_whom         TEXT NOT NULL DEFAULT 'ai',
            provenance      TEXT NOT NULL DEFAULT 'ai',
            comment         TEXT,
            FOREIGN KEY (book_id, paragraph_id) REFERENCES paragraphs(book_id, id)
        );

        CREATE TABLE IF NOT EXISTS topic_pages (
            topic_type       TEXT NOT NULL,
            topic_value      TEXT NOT NULL,
            description      TEXT NOT NULL,
            content          TEXT NOT NULL,
            PRIMARY KEY (topic_type, topic_value)
        );

        CREATE TABLE IF NOT EXISTS relations (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            source_book_id      TEXT NOT NULL,
            source_paragraph_id TEXT NOT NULL,
            target_book_id      TEXT NOT NULL,
            target_paragraph_id TEXT NOT NULL,
            relation_type       TEXT NOT NULL,
            by_whom             TEXT NOT NULL DEFAULT 'ai',
            provenance          TEXT NOT NULL DEFAULT 'ai',
            comment             TEXT,
            -- ponytail: no FK on target; cross-work parallels may point at any book
            FOREIGN KEY (source_book_id, source_paragraph_id) REFERENCES paragraphs(book_id, id)
        );

        CREATE TABLE IF NOT EXISTS paragraph_translations (
            book_id         TEXT NOT NULL,
            paragraph_id    TEXT NOT NULL,
            lang            TEXT NOT NULL,
            content         TEXT NOT NULL,
            provenance      TEXT,
            by_whom         TEXT,
            PRIMARY KEY (book_id, paragraph_id, lang),
            FOREIGN KEY (book_id, paragraph_id) REFERENCES paragraphs(book_id, id)
        );

        CREATE TABLE IF NOT EXISTS aside_translations (
            book_id         TEXT NOT NULL,
            aside_id        TEXT NOT NULL,
            lang            TEXT NOT NULL,
            content         TEXT NOT NULL,
            PRIMARY KEY (book_id, aside_id, lang),
            FOREIGN KEY (book_id, aside_id) REFERENCES asides(book_id, id)
        );

        CREATE TABLE IF NOT EXISTS book_translations (
            book_id  TEXT NOT NULL,
            lang     TEXT NOT NULL,
            title    TEXT NOT NULL,
            description_short TEXT,
            PRIMARY KEY (book_id, lang),
            FOREIGN KEY (book_id) REFERENCES books(id)
        );

        CREATE TABLE IF NOT EXISTS chapter_translations (
            book_id     TEXT NOT NULL,
            chapter_id  TEXT NOT NULL,
            lang        TEXT NOT NULL,
            title       TEXT NOT NULL,
            PRIMARY KEY (book_id, chapter_id, lang),
            FOREIGN KEY (book_id, chapter_id) REFERENCES chapters(book_id, id)
        );

        CREATE TABLE IF NOT EXISTS topic_page_translations (
            topic_type   TEXT NOT NULL,
            topic_value  TEXT NOT NULL,
            lang         TEXT NOT NULL,
            description  TEXT NOT NULL,
            content      TEXT NOT NULL,
            PRIMARY KEY (topic_type, topic_value, lang),
            FOREIGN KEY (topic_type, topic_value) REFERENCES topic_pages(topic_type, topic_value)
        );

        -- Build provenance + corpus stats, surfaced by the app (footer/About).
        -- One writer (this CLI), travels with the .db asset.
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )
    .expect("Failed to create tables");
}

/// Stamp build provenance and corpus stats into the `meta` table. Git commit
/// and build time come from the environment (the Makefile computes them); they
/// degrade to empty strings when unset (e.g. `npm run db:build`, or a non-git
/// `DATA_DIR` tarball). Stats are read back from the just-populated tables.
pub fn write_meta(conn: &Connection) {
    let data_commit = std::env::var("FRANCISCUS_DATA_COMMIT").unwrap_or_default();
    let data_commit_date = std::env::var("FRANCISCUS_DATA_COMMIT_DATE").unwrap_or_default();
    let built_at = std::env::var("FRANCISCUS_BUILD_TIME").unwrap_or_default();

    let book_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
        .unwrap_or(0);
    let languages: String = conn
        .query_row(
            "SELECT COALESCE(GROUP_CONCAT(lang), '')
             FROM (SELECT DISTINCT lang FROM book_translations ORDER BY lang)",
            [],
            |r| r.get(0),
        )
        .unwrap_or_default();
    let annotation_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM annotations", [], |r| r.get(0))
        .unwrap_or(0);

    conn.pragma_update(None, "user_version", SCHEMA_VERSION)
        .expect("Failed to set user_version");

    let rows: [(&str, String); 7] = [
        ("schema_version", SCHEMA_VERSION.to_string()),
        ("data_commit", data_commit),
        ("data_commit_date", data_commit_date),
        ("built_at", built_at),
        ("book_count", book_count.to_string()),
        ("languages", languages),
        ("annotation_count", annotation_count.to_string()),
    ];
    for (k, v) in &rows {
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
            params![k, v],
        )
        .expect("Failed to write meta row");
    }
}

/// Build the hub-page manifest from the just-populated DB. Mirrors the stats in
/// `write_meta` but shaped for the app's `load()` (see `models::Manifest`).
/// Provenance comes from the same environment the Makefile sets.
pub fn build_manifest(conn: &Connection) -> Manifest {
    let data_commit = std::env::var("FRANCISCUS_DATA_COMMIT").unwrap_or_default();
    let data_commit_date = std::env::var("FRANCISCUS_DATA_COMMIT_DATE").unwrap_or_default();
    let built_at = std::env::var("FRANCISCUS_BUILD_TIME").unwrap_or_default();

    let book_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM books", [], |r| r.get(0))
        .unwrap_or(0);

    let languages: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT DISTINCT lang FROM book_translations ORDER BY lang")
            .expect("prepare languages");
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .expect("query languages");
        rows.filter_map(|r| r.ok()).collect()
    };

    // Translations grouped by book, so each book carries its own language list.
    let mut translations_by_book: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT book_id, lang FROM book_translations ORDER BY book_id, lang")
            .expect("prepare book translations");
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .expect("query book translations");
        for row in rows.filter_map(|r| r.ok()) {
            translations_by_book.entry(row.0).or_default().push(row.1);
        }
    }

    let books: Vec<ManifestBook> = {
        let mut stmt = conn
            .prepare("SELECT id, title, author, date, description_short FROM books ORDER BY id")
            .expect("prepare books");
        let rows = stmt
            .query_map([], |r| {
                Ok(ManifestBook {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    author: r.get(2)?,
                    date: r.get(3)?,
                    description_short: r.get(4)?,
                    translations: Vec::new(),
                })
            })
            .expect("query books");
        rows.filter_map(|r| r.ok())
            .map(|mut b| {
                b.translations = translations_by_book.remove(&b.id).unwrap_or_default();
                b
            })
            .collect()
    };

    // Base (source-language) topic labels, keyed by (type, value).
    let mut base_desc: std::collections::HashMap<(String, String), String> =
        std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT topic_type, topic_value, description FROM topic_pages")
            .expect("prepare topic descriptions");
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
            })
            .expect("query topic descriptions");
        for (topic_type, topic_value, desc) in rows.filter_map(|r| r.ok()) {
            base_desc.insert((topic_type, topic_value), desc);
        }
    }

    // Localized topic labels, keyed by (type, value) -> {lang: description}.
    let mut localized_desc: std::collections::HashMap<(String, String), BTreeMap<String, String>> =
        std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT topic_type, topic_value, lang, description FROM topic_page_translations")
            .expect("prepare topic translations");
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .expect("query topic translations");
        for (topic_type, topic_value, lang, desc) in rows.filter_map(|r| r.ok()) {
            localized_desc
                .entry((topic_type, topic_value))
                .or_default()
                .insert(lang, desc);
        }
    }

    let topics: Vec<ManifestTopic> = {
        let mut stmt = conn
            .prepare(
                "SELECT topic_type, topic_value, COUNT(*) AS count
                 FROM annotations
                 GROUP BY topic_type, topic_value
                 ORDER BY topic_type, topic_value",
            )
            .expect("prepare topics");
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })
            .expect("query topics");
        rows.filter_map(|r| r.ok())
            .map(|(topic_type, value, count)| {
                let key = (topic_type.clone(), value.clone());
                // Fall back to the slug-as-words when no topic page exists.
                let description = base_desc
                    .remove(&key)
                    .unwrap_or_else(|| value.replace('_', " "));
                let descriptions = localized_desc.remove(&key).unwrap_or_default();
                ManifestTopic {
                    topic_type,
                    value,
                    count: count as u32,
                    description,
                    descriptions,
                }
            })
            .collect()
    };

    Manifest {
        schema: MANIFEST_SCHEMA,
        corpus: ManifestCorpus {
            data_commit,
            data_commit_date,
            built_at,
            book_count: book_count as u32,
            languages,
        },
        books,
        topics,
    }
}

pub fn insert_book(conn: &Connection, book: &ParsedBook) {
    let m = &book.meta;
    conn.execute(
        "INSERT OR REPLACE INTO books (id, title, author, date, ref_edition, description_short)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![m.id, m.title, m.author, m.date, m.reference_edition, m.description_short],
    )
    .expect("Failed to insert book");

    for ch in &book.chapters {
        conn.execute(
            "INSERT OR REPLACE INTO chapters (id, book_id, position, title)
             VALUES (?1, ?2, ?3, ?4)",
            params![ch.id, m.id, ch.position, ch.title],
        )
        .expect("Failed to insert chapter");

        for block in &ch.blocks {
            match block {
                Block::Paragraph { id, label, content, position, .. } => {
                    conn.execute(
                        "INSERT OR REPLACE INTO paragraphs (id, book_id, chapter_id, position, content, label)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![id, m.id, ch.id, position, content, label],
                    )
                    .expect("Failed to insert paragraph");
                }
                Block::Aside { id, content, position } => {
                    conn.execute(
                        "INSERT OR REPLACE INTO asides (id, book_id, chapter_id, position, content)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![id, m.id, ch.id, position, content],
                    )
                    .expect("Failed to insert aside");
                }
            }
        }
    }
}

/// Insert the source (canonical) topic page. `topic_type` and `topic_value`
/// come from the path (`topics/<type>/<value>.md`), not the frontmatter.
pub fn insert_topic_page(
    conn: &Connection,
    topic_type: &str,
    topic_value: &str,
    page: &crate::models::TopicPage,
) {
    conn.execute(
        "INSERT OR REPLACE INTO topic_pages (topic_type, topic_value, description, content)
         VALUES (?1, ?2, ?3, ?4)",
        params![topic_type, topic_value, page.frontmatter.description, page.content],
    )
    .expect("Failed to insert topic page");
}

/// Insert a translated topic page (`topics/<type>/<value>.<lang>.md`).
/// `topic_type` and `topic_value` come from the path.
pub fn insert_topic_page_translation(
    conn: &Connection,
    topic_type: &str,
    topic_value: &str,
    lang: &str,
    page: &crate::models::TopicPage,
) {
    conn.execute(
        "INSERT OR REPLACE INTO topic_page_translations
            (topic_type, topic_value, lang, description, content)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![topic_type, topic_value, lang, page.frontmatter.description, page.content],
    )
    .expect("Failed to insert topic page translation");
}

pub fn insert_translations(conn: &Connection, book: &ParsedBook, lang: &str) {
    let book_id = &book.meta.id;

    // Book and chapter titles from the translation file's own frontmatter /
    // ## headings. The source book row already exists (translation files are
    // ingested after sources), so the FK is satisfied.
    conn.execute(
        "INSERT OR REPLACE INTO book_translations (book_id, lang, title, description_short)
         VALUES (?1, ?2, ?3, ?4)",
        params![book_id, lang, book.meta.title, book.meta.description_short],
    )
    .expect("Failed to insert book translation");

    for ch in &book.chapters {
        conn.execute(
            "INSERT OR REPLACE INTO chapter_translations (book_id, chapter_id, lang, title)
             VALUES (?1, ?2, ?3, ?4)",
            params![book_id, ch.id, lang, ch.title],
        )
        .expect("Failed to insert chapter translation");

        for block in &ch.blocks {
            match block {
                Block::Paragraph { id, content, provenance, by, .. } => {
                    conn.execute(
                        "INSERT OR REPLACE INTO paragraph_translations (book_id, paragraph_id, lang, content, provenance, by_whom)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![book_id, id, lang, content, provenance, by],
                    )
                    .expect("Failed to insert paragraph translation");
                }
                Block::Aside { id, content, .. } => {
                    conn.execute(
                        "INSERT OR REPLACE INTO aside_translations (book_id, aside_id, lang, content)
                         VALUES (?1, ?2, ?3, ?4)",
                        params![book_id, id, lang, content],
                    )
                    .expect("Failed to insert aside translation");
                }
            }
        }
    }
}

pub fn create_fts_index(conn: &Connection) {
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
            book_id UNINDEXED,
            chapter_id UNINDEXED,
            paragraph_id UNINDEXED,
            lang UNINDEXED,
            content,
            tokenize='unicode61'
        );"
    ).expect("Failed to create FTS5 virtual table");

    let re = Regex::new(r"<[^>]+>").unwrap();

    {
        let mut stmt = conn.prepare(
            "SELECT book_id, chapter_id, id, content FROM paragraphs"
        ).unwrap();
        let rows: Vec<(String, String, String, String)> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        }).unwrap().filter_map(|r| r.ok()).collect();
        drop(stmt);

        for (book_id, chapter_id, id, content) in &rows {
            let clean = re.replace_all(content, "");
            conn.execute(
                "INSERT INTO search_index (book_id, chapter_id, paragraph_id, lang, content)
                 VALUES (?1, ?2, ?3, 'la', ?4)",
                params![book_id, chapter_id, id, clean.as_ref()],
            ).expect("Failed to insert into FTS index");
        }
    }

    {
        let mut stmt = conn.prepare(
            "SELECT pt.book_id, p.chapter_id, pt.paragraph_id, pt.lang, pt.content
             FROM paragraph_translations pt
             JOIN paragraphs p ON pt.book_id = p.book_id AND pt.paragraph_id = p.id"
        ).unwrap();
        let rows: Vec<(String, String, String, String, String)> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        }).unwrap().filter_map(|r| r.ok()).collect();
        drop(stmt);

        for (book_id, chapter_id, paragraph_id, lang, content) in &rows {
            let clean = re.replace_all(content, "");
            conn.execute(
                "INSERT INTO search_index (book_id, chapter_id, paragraph_id, lang, content)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![book_id, chapter_id, paragraph_id, lang, clean.as_ref()],
            ).expect("Failed to insert translation into FTS index");
        }
    }

    conn.execute_batch("INSERT INTO search_index(search_index) VALUES('optimize');")
        .expect("Failed to optimize FTS index");
}

/// Insert a book's annotation sidecar (FORMAT.md §10). Each `type:value` pair in
/// an entry's `topics` becomes an annotation row; each `reltype:target` pair
/// in `relations` becomes a relation row. Returns (topic rows, relation rows).
pub fn insert_annotations(conn: &Connection, book_id: &str, annotations: &[Annotation]) -> (usize, usize) {
    let mut topic_rows = 0;
    let mut rel_rows = 0;
    for a in annotations {
        for pair in csv_pairs(a.topics.as_deref()) {
            let Some((topic_type, topic_value)) = pair.split_once(':') else {
                eprintln!("  warning: skipping malformed topic '{pair}' in {book_id}/{}", a.paragraph);
                continue;
            };
            conn.execute(
                "INSERT INTO annotations (book_id, paragraph_id, paragraph_to_id, topic_type, topic_value, by_whom, provenance, comment)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![book_id, a.paragraph, a.paragraph_to, topic_type.trim(), topic_value.trim(), a.by, a.provenance, a.comment],
            )
            .expect("Failed to insert annotation");
            topic_rows += 1;
        }

        for pair in csv_pairs(a.relations.as_deref()) {
            let Some((rel_type, target)) = pair.split_once(':') else {
                eprintln!("  warning: skipping malformed relation '{pair}' in {book_id}/{}", a.paragraph);
                continue;
            };
            // ponytail: target key is `<book_id>-<paragraph_id>`; book ids contain no '-'
            let Some((target_book, target_par)) = target.trim().split_once('-') else {
                eprintln!("  warning: skipping relation target '{}' (expected <book>-<paragraph>) in {book_id}/{}", target.trim(), a.paragraph);
                continue;
            };
            conn.execute(
                "INSERT INTO relations (source_book_id, source_paragraph_id, target_book_id, target_paragraph_id, relation_type, by_whom, provenance, comment)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![book_id, a.paragraph, target_book, target_par, rel_type.trim(), a.by, a.provenance, a.comment],
            )
            .expect("Failed to insert relation");
            rel_rows += 1;
        }
    }
    (topic_rows, rel_rows)
}

/// Split a CSV-of-pairs string into trimmed, non-empty items.
fn csv_pairs(s: Option<&str>) -> impl Iterator<Item = &str> {
    s.unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|p| !p.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Annotation;

    #[test]
    fn expands_topics_and_relations() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=OFF;").unwrap();
        create_tables(&conn);

        let a = Annotation {
            paragraph: "p1".into(),
            paragraph_to: None,
            topics: Some("person:st_francis, place:assisi".into()),
            relations: Some("same_episode:LMj-mir10-6, related_to:2Cel-121".into()),
            by: "Tester".into(),
            provenance: "human".into(),
            comment: Some("note".into()),
        };
        let (topic_rows, rel_rows) = insert_annotations(&conn, "1Cel", &[a]);
        assert_eq!((topic_rows, rel_rows), (2, 2));

        // first hyphen separates book id from (hyphenated) paragraph id
        let (tb, tp): (String, String) = conn
            .query_row(
                "SELECT target_book_id, target_paragraph_id FROM relations WHERE relation_type = 'same_episode'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((tb.as_str(), tp.as_str()), ("LMj", "mir10-6"));
    }
}
