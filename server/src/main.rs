mod models;
mod parser;
mod db;

use std::path::PathBuf;
use clap::Parser;

#[derive(Parser)]
#[command(name = "franciscus-server")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(clap::Subcommand)]
enum Command {
    Build {
        #[arg(long)]
        data_dir: PathBuf,
        #[arg(long, default_value = "franciscus.db")]
        output: PathBuf,
    },
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Command::Build { data_dir, output } => run_build(&data_dir, &output),
    }
}

fn parse_topic_page(text: &str) -> Result<models::TopicPage, String> {
    let text = text.trim();
    if !text.starts_with("---") {
        return Err("Missing YAML frontmatter".to_string());
    }
    let after_first = &text[3..];
    let end = after_first.find("---").ok_or("Missing closing --- in frontmatter")?;
    let yaml_str = &after_first[..end];
    let body = after_first[end + 3..].trim();
    let frontmatter: models::TopicPageFrontmatter =
        serde_yaml::from_str(yaml_str).map_err(|e| format!("YAML parse error: {e}"))?;
    Ok(models::TopicPage { frontmatter, content: render_markdown(body) })
}

/// Render authored Markdown to HTML at build time (topic bodies, book
/// descriptions), since the app injects the result via {@html}. `unsafe_` keeps
/// the raw inline HTML the trusted sources rely on instead of escaping it.
pub(crate) fn render_markdown(body: &str) -> String {
    let mut options = comrak::Options::default();
    options.render.r#unsafe = true;
    comrak::markdown_to_html(body, &options).trim().to_string()
}

/// Decompose a topic-page filename stem into `(topic_value, lang)`. The topic
/// type comes from the parent directory (`topics/<type>/<value>[.<lang>].md`),
/// not the filename. Stems look like `st_clare_of_assisi` (source) or
/// `st_clare_of_assisi.it` (translation).
fn parse_topic_filename(stem: &str) -> Result<(String, Option<String>), String> {
    let (topic_value, lang) = match stem.split_once('.') {
        Some((value, lang)) => (value, Some(lang.to_string())),
        None => (stem, None),
    };
    if topic_value.is_empty() {
        return Err(format!("topic filename has empty value: {stem}"));
    }
    Ok((topic_value.to_string(), lang))
}

/// Build the sitemap for the prerendered routes: the static hubs plus each
/// `/book/<id>` index (now prerendered from the manifest). Chapter and
/// topic-detail routes stay out — they render client-side from sql.js.
fn build_sitemap(book_ids: &[String]) -> String {
    const BASE: &str = "https://franciscus.app";
    // (path, changefreq, priority)
    let mut routes: Vec<(String, &str, &str)> = vec![
        ("/".into(), "weekly", "1.0"),
        ("/topics".into(), "weekly", "0.8"),
        ("/about".into(), "monthly", "0.5"),
        ("/contribute".into(), "monthly", "0.5"),
    ];
    for id in book_ids {
        routes.push((format!("/book/{id}"), "weekly", "0.7"));
    }
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for (path, changefreq, priority) in &routes {
        xml.push_str(&format!(
            "\t<url>\n\t\t<loc>{BASE}{path}</loc>\n\t\t<changefreq>{changefreq}</changefreq>\n\t\t<priority>{priority}</priority>\n\t</url>\n"
        ));
    }
    xml.push_str("</urlset>\n");
    xml
}

fn run_build(data_dir: &PathBuf, output: &PathBuf) {
    let output_str = output.to_str().expect("Invalid output path");

    if output.exists() {
        std::fs::remove_file(output).expect("Failed to remove existing database");
    }

    let conn = db::open_or_create(output_str);
    db::create_tables(&conn);

    let mut book_count = 0u32;
    let mut translation_count = 0u32;
    let mut annotation_count = 0u32;
    let mut topic_page_count = 0u32;

    // Human contributor registry (optional); resolves annotation `by:` handles.
    let contributors: models::Contributors = {
        let path = data_dir.join("contributors.yaml");
        match std::fs::read_to_string(&path) {
            Ok(text) => serde_yaml::from_str(&text)
                .unwrap_or_else(|e| panic!("Invalid contributors.yaml: {e}")),
            Err(_) => models::Contributors::new(),
        }
    };

    let books_dir = data_dir.join("books");
    let mut translation_files: Vec<PathBuf> = Vec::new();
    let mut annotation_files: Vec<PathBuf> = Vec::new();

    if books_dir.is_dir() {
        for entry in std::fs::read_dir(&books_dir).expect("Cannot read books directory") {
            let entry = entry.expect("Cannot read entry");
            let path = entry.path();
            match path.extension().and_then(|e| e.to_str()) {
                Some("md") => {
                    let stem = path.file_stem().unwrap().to_string_lossy();
                    if stem.contains('.') {
                        translation_files.push(path);
                    } else {
                        let text = std::fs::read_to_string(&path).expect("Cannot read file");
                        match parser::parse_book(&text, &stem) {
                            Ok(book) => {
                                println!("  book: {} ({})", book.meta.title, book.meta.id);
                                db::insert_book(&conn, &book);
                                book_count += 1;
                            }
                            Err(e) => {
                                eprintln!("  error parsing {}: {e}", path.display());
                            }
                        }
                    }
                }
                // Annotation sidecar; deferred so its paragraphs exist first (FK).
                Some("yaml") | Some("yml") => annotation_files.push(path),
                _ => {}
            }
        }
    }

    for path in &translation_files {
        let stem = path.file_stem().unwrap().to_string_lossy();
        let dot_pos = stem.find('.').unwrap();
        let lang = &stem[dot_pos + 1..];
        let book_id = &stem[..dot_pos];
        let text = std::fs::read_to_string(path).expect("Cannot read translation file");
        match parser::parse_book(&text, book_id) {
            Ok(book) => {
                println!("  translation: {} [{}]", book.meta.id, lang);
                db::insert_translations(&conn, &book, lang);
                translation_count += 1;
            }
            Err(e) => {
                eprintln!("  error parsing translation {}: {e}", path.display());
            }
        }
    }

    for path in &annotation_files {
        let book_id = path.file_stem().unwrap().to_string_lossy();
        let text = std::fs::read_to_string(path).expect("Cannot read sidecar file");
        match serde_yaml::from_str::<models::BookSidecar>(&text) {
            Ok(sidecar) => {
                // Cover descriptions, keyed by UI language. The long description
                // is authored as Markdown and injected via {@html}, so render it
                // to HTML now.
                let long_html: std::collections::BTreeMap<String, String> = sidecar
                    .description
                    .iter()
                    .map(|(lang, md)| (lang.clone(), render_markdown(md)))
                    .collect();
                db::insert_book_descriptions(
                    &conn,
                    &book_id,
                    &sidecar.description_short,
                    &long_html,
                );

                let (topic_rows, rel_rows) =
                    db::insert_annotations(&conn, &book_id, &sidecar.annotations, &contributors);
                println!(
                    "  sidecar: {book_id} ({} paragraphs, {} desc langs, {topic_rows} topic + {rel_rows} relation rows)",
                    sidecar.annotations.len(),
                    long_html.len().max(sidecar.description_short.len())
                );
                annotation_count += (topic_rows + rel_rows) as u32;
            }
            Err(e) => {
                eprintln!("  error parsing {}: {e}", path.display());
            }
        }
    }

    let topics_dir = data_dir.join("topics");
    let mut topic_translation_files: Vec<(String, PathBuf)> = Vec::new();
    let mut topic_page_translation_count = 0u32;

    if topics_dir.is_dir() {
        // Topic type is the subdirectory name (`topics/<type>/<value>[.<lang>].md`).
        // First pass: ingest source (canonical) topic pages so the FK on the
        // translations table is satisfied. Defer translations to a second pass.
        for type_entry in std::fs::read_dir(&topics_dir).expect("Cannot read topics dir") {
            let type_dir = type_entry.expect("Cannot read entry").path();
            if !type_dir.is_dir() {
                continue;
            }
            let topic_type = type_dir.file_name().unwrap().to_string_lossy().to_string();
            for entry in std::fs::read_dir(&type_dir).expect("Cannot read topic type dir") {
                let path = entry.expect("Cannot read entry").path();
                if !path.extension().is_some_and(|e| e == "md") {
                    continue;
                }
                let stem = path.file_stem().unwrap().to_string_lossy();
                let (topic_value, lang) = match parse_topic_filename(&stem) {
                    Ok(parts) => parts,
                    Err(e) => {
                        eprintln!("  error parsing topic filename {}: {e}", path.display());
                        continue;
                    }
                };
                if lang.is_some() {
                    topic_translation_files.push((topic_type.clone(), path));
                    continue;
                }
                let text = std::fs::read_to_string(&path).expect("Cannot read topic file");
                match parse_topic_page(&text) {
                    Ok(page) => {
                        println!("  topic: {} / {}", topic_type, topic_value);
                        db::insert_topic_page(&conn, &topic_type, &topic_value, &page);
                        topic_page_count += 1;
                    }
                    Err(e) => {
                        eprintln!("  error parsing {}: {e}", path.display());
                    }
                }
            }
        }

        for (topic_type, path) in &topic_translation_files {
            let stem = path.file_stem().unwrap().to_string_lossy();
            let (topic_value, lang) = parse_topic_filename(&stem)
                .expect("topic filename validated in first pass");
            let lang = lang.expect("translation files always carry a lang");
            let text = std::fs::read_to_string(path).expect("Cannot read topic translation");
            match parse_topic_page(&text) {
                Ok(page) => {
                    println!("  topic translation: {} / {} [{}]", topic_type, topic_value, lang);
                    db::insert_topic_page_translation(&conn, topic_type, &topic_value, &lang, &page);
                    topic_page_translation_count += 1;
                }
                Err(e) => {
                    eprintln!("  error parsing translation {}: {e}", path.display());
                }
            }
        }
    }

    db::create_fts_index(&conn);
    println!("  fts5 search index built");

    db::write_meta(&conn);
    println!("  meta written (schema v{})", db::SCHEMA_VERSION);

    // Hub-page manifest + sitemap, written next to the DB asset so the static
    // hub routes can render/prerender without sql.js. Same build => no drift.
    let asset_dir = output.parent().unwrap_or_else(|| std::path::Path::new("."));

    // Fold the WAL back into the main db file so its on-disk size is final before
    // we stat it. That byte count is what the client downloads (the stream is
    // always decompressed), so the app can show a determinate progress bar even
    // when the transfer is gzip/chunked and sends no usable Content-Length.
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .expect("Failed to checkpoint WAL before sizing db");
    let db_bytes = std::fs::metadata(&output)
        .expect("Failed to stat database file")
        .len();

    let manifest = db::build_manifest(&conn, db_bytes);
    // `db-manifest.json` (not `manifest.json`) to avoid confusion with the PWA
    // `manifest.webmanifest` that already ships in static/.
    let manifest_path = asset_dir.join("db-manifest.json");
    let manifest_json =
        serde_json::to_string_pretty(&manifest).expect("Failed to serialize manifest");
    std::fs::write(&manifest_path, manifest_json).expect("Failed to write manifest.json");
    println!(
        "  manifest written: {} book(s), {} topic(s) -> {}",
        manifest.books.len(),
        manifest.topics.len(),
        manifest_path.display()
    );

    let book_ids: Vec<String> = manifest.books.iter().map(|b| b.id.clone()).collect();
    let sitemap_path = asset_dir.join("sitemap.xml");
    std::fs::write(&sitemap_path, build_sitemap(&book_ids)).expect("Failed to write sitemap.xml");
    println!("  sitemap written -> {}", sitemap_path.display());

    println!(
        "Build complete: {} book(s), {} translation(s), {} annotation(s), {} topic page(s), {} topic translation(s) -> {}",
        book_count,
        translation_count,
        annotation_count,
        topic_page_count,
        topic_page_translation_count,
        output.display()
    );
}
