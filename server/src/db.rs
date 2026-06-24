use rusqlite::{Connection, params};
use regex::Regex;
use crate::models::*;

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
            license         TEXT NOT NULL DEFAULT 'CC0-1.0'
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
            by_type         TEXT NOT NULL DEFAULT 'ai',
            verified        INTEGER NOT NULL DEFAULT 0,
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
            by_type             TEXT NOT NULL DEFAULT 'ai',
            verified            INTEGER NOT NULL DEFAULT 0,
            comment             TEXT,
            -- ponytail: no FK on target; cross-work parallels may point at any book
            FOREIGN KEY (source_book_id, source_paragraph_id) REFERENCES paragraphs(book_id, id)
        );

        CREATE TABLE IF NOT EXISTS paragraph_translations (
            book_id         TEXT NOT NULL,
            paragraph_id    TEXT NOT NULL,
            lang            TEXT NOT NULL,
            content         TEXT NOT NULL,
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
            lang_slug    TEXT,
            description  TEXT NOT NULL,
            content      TEXT NOT NULL,
            PRIMARY KEY (topic_type, topic_value, lang),
            FOREIGN KEY (topic_type, topic_value) REFERENCES topic_pages(topic_type, topic_value)
        );

        CREATE INDEX IF NOT EXISTS idx_topic_lang_slug
            ON topic_page_translations(lang, lang_slug);
        ",
    )
    .expect("Failed to create tables");
}

pub fn insert_book(conn: &Connection, book: &ParsedBook) {
    let m = &book.meta;
    conn.execute(
        "INSERT OR REPLACE INTO books (id, title, author, date, ref_edition, license)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![m.id, m.title, m.author, m.date, m.reference_edition, m.license],
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
                Block::Paragraph { id, label, content, position } => {
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

/// Insert the source (canonical) topic page. `topic_value` is provided
/// separately because it comes from the filename, not the frontmatter.
pub fn insert_topic_page(conn: &Connection, topic_value: &str, page: &crate::models::TopicPage) {
    conn.execute(
        "INSERT OR REPLACE INTO topic_pages (topic_type, topic_value, description, content)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            page.frontmatter.topic_type,
            topic_value,
            page.frontmatter.description,
            page.content
        ],
    )
    .expect("Failed to insert topic page");
}

/// Insert a translated topic page (`<type>:<value>.<lang>.md`). `topic_value`
/// is the canonical id from the filename; `lang_slug` is the optional
/// localized URL slug from the frontmatter.
pub fn insert_topic_page_translation(
    conn: &Connection,
    topic_value: &str,
    lang: &str,
    page: &crate::models::TopicPage,
) {
    conn.execute(
        "INSERT OR REPLACE INTO topic_page_translations
            (topic_type, topic_value, lang, lang_slug, description, content)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            page.frontmatter.topic_type,
            topic_value,
            lang,
            page.frontmatter.lang_slug,
            page.frontmatter.description,
            page.content,
        ],
    )
    .expect("Failed to insert topic page translation");
}

pub fn insert_translations(conn: &Connection, book: &ParsedBook, lang: &str) {
    let book_id = &book.meta.id;

    // Book and chapter titles from the translation file's own frontmatter /
    // ## headings. The source book row already exists (translation files are
    // ingested after sources), so the FK is satisfied.
    conn.execute(
        "INSERT OR REPLACE INTO book_translations (book_id, lang, title)
         VALUES (?1, ?2, ?3)",
        params![book_id, lang, book.meta.title],
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
                Block::Paragraph { id, content, .. } => {
                    conn.execute(
                        "INSERT OR REPLACE INTO paragraph_translations (book_id, paragraph_id, lang, content)
                         VALUES (?1, ?2, ?3, ?4)",
                        params![book_id, id, lang, content],
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
                "INSERT INTO annotations (book_id, paragraph_id, paragraph_to_id, topic_type, topic_value, by_whom, by_type, verified, comment)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![book_id, a.paragraph, a.paragraph_to, topic_type.trim(), topic_value.trim(), a.by, a.by_type, a.verified, a.comment],
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
                "INSERT INTO relations (source_book_id, source_paragraph_id, target_book_id, target_paragraph_id, relation_type, by_whom, by_type, verified, comment)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![book_id, a.paragraph, target_book, target_par, rel_type.trim(), a.by, a.by_type, a.verified, a.comment],
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
            by_type: "human".into(),
            verified: true,
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
