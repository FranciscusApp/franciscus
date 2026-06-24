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
            attr_type       TEXT NOT NULL,
            attr_value      TEXT NOT NULL,
            by_whom         TEXT NOT NULL DEFAULT 'ai',
            verified        INTEGER NOT NULL DEFAULT 0,
            evidence        TEXT,
            FOREIGN KEY (book_id, paragraph_id) REFERENCES paragraphs(book_id, id)
        );

        CREATE TABLE IF NOT EXISTS attribute_pages (
            attr_type       TEXT NOT NULL,
            attr_value      TEXT NOT NULL,
            title           TEXT NOT NULL,
            content         TEXT NOT NULL,
            PRIMARY KEY (attr_type, attr_value)
        );

        CREATE TABLE IF NOT EXISTS relations (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            source_book_id      TEXT NOT NULL,
            source_paragraph_id TEXT NOT NULL,
            target_book_id      TEXT NOT NULL,
            target_paragraph_id TEXT NOT NULL,
            relation_type       TEXT NOT NULL,
            by_whom             TEXT NOT NULL DEFAULT 'ai',
            verified            INTEGER NOT NULL DEFAULT 0,
            evidence            TEXT,
            FOREIGN KEY (source_book_id, source_paragraph_id) REFERENCES paragraphs(book_id, id),
            FOREIGN KEY (target_book_id, target_paragraph_id) REFERENCES paragraphs(book_id, id)
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

pub fn insert_attribute_page(conn: &Connection, page: &crate::models::AttributePage) {
    conn.execute(
        "INSERT OR REPLACE INTO attribute_pages (attr_type, attr_value, title, content)
         VALUES (?1, ?2, ?3, ?4)",
        params![page.meta.attr_type, page.meta.attr_value, page.meta.title, page.content],
    )
    .expect("Failed to insert attribute page");
}

pub fn insert_translations(conn: &Connection, book: &ParsedBook, lang: &str) {
    let book_id = &book.meta.id;
    for ch in &book.chapters {
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

pub fn insert_annotations(conn: &Connection, file: &AnnotationFile) {
    for a in &file.annotations {
        conn.execute(
            "INSERT INTO annotations (book_id, paragraph_id, attr_type, attr_value, by_whom, verified, evidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![a.book_id, a.paragraph_id, a.attr_type, a.attr_value, a.by, a.verified, a.evidence],
        )
        .expect("Failed to insert annotation");
    }
    for r in &file.relations {
        conn.execute(
            "INSERT INTO relations (source_book_id, source_paragraph_id, target_book_id, target_paragraph_id, relation_type, by_whom, verified, evidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                r.source_book_id, r.source_paragraph_id,
                r.target_book_id, r.target_paragraph_id,
                r.relation_type, r.by, r.verified, r.evidence
            ],
        )
        .expect("Failed to insert relation");
    }
}
