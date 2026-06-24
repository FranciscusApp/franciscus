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
    let body = after_first[end + 3..].trim().to_string();
    let frontmatter: models::TopicPageFrontmatter =
        serde_yaml::from_str(yaml_str).map_err(|e| format!("YAML parse error: {e}"))?;
    Ok(models::TopicPage { frontmatter, content: body })
}

/// Decompose a topic-page filename stem into `(topic_type, topic_value, lang)`.
/// Stems look like `person:st_clare_of_assisi` (source) or
/// `person:st_clare_of_assisi.it` (translation). The `:` always precedes any
/// `.<lang>` suffix.
fn parse_topic_filename(stem: &str) -> Result<(String, String, Option<String>), String> {
    let (topic_type, rest) = stem
        .split_once(':')
        .ok_or_else(|| format!("topic filename missing ':' separator: {stem}"))?;
    let (topic_value, lang) = match rest.split_once('.') {
        Some((value, lang)) => (value, Some(lang.to_string())),
        None => (rest, None),
    };
    if topic_type.is_empty() || topic_value.is_empty() {
        return Err(format!("topic filename has empty type or value: {stem}"));
    }
    Ok((topic_type.to_string(), topic_value.to_string(), lang))
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
                        match parser::parse_book(&text) {
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
                Some("json") => annotation_files.push(path),
                _ => {}
            }
        }
    }

    for path in &translation_files {
        let stem = path.file_stem().unwrap().to_string_lossy();
        let dot_pos = stem.find('.').unwrap();
        let lang = &stem[dot_pos + 1..];
        let text = std::fs::read_to_string(path).expect("Cannot read translation file");
        match parser::parse_book(&text) {
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
        let text = std::fs::read_to_string(path).expect("Cannot read annotation file");
        match serde_json::from_str::<Vec<models::Annotation>>(&text) {
            Ok(annotations) => {
                let (topic_rows, rel_rows) = db::insert_annotations(&conn, &book_id, &annotations);
                println!("  annotations: {book_id} ({} entries, {topic_rows} topic + {rel_rows} relation rows)", annotations.len());
                annotation_count += (topic_rows + rel_rows) as u32;
            }
            Err(e) => {
                eprintln!("  error parsing {}: {e}", path.display());
            }
        }
    }

    let topics_dir = data_dir.join("topics");
    let mut topic_translation_files: Vec<PathBuf> = Vec::new();
    let mut topic_page_translation_count = 0u32;

    if topics_dir.is_dir() {
        // First pass: ingest source (canonical) topic pages so the FK on the
        // translations table is satisfied. Defer translations to a second pass.
        for entry in std::fs::read_dir(&topics_dir).expect("Cannot read topics dir") {
            let entry = entry.expect("Cannot read entry");
            let path = entry.path();
            if !path.extension().is_some_and(|e| e == "md") {
                continue;
            }
            let stem = path.file_stem().unwrap().to_string_lossy();
            let (topic_type, topic_value, lang) = match parse_topic_filename(&stem) {
                Ok(parts) => parts,
                Err(e) => {
                    eprintln!("  error parsing topic filename {}: {e}", path.display());
                    continue;
                }
            };
            if lang.is_some() {
                topic_translation_files.push(path);
                continue;
            }
            let text = std::fs::read_to_string(&path).expect("Cannot read topic file");
            match parse_topic_page(&text) {
                Ok(page) => {
                    if page.frontmatter.topic_type != topic_type {
                        eprintln!(
                            "  warning: topic {} / {}: frontmatter type '{}' disagrees with filename prefix '{}'; using filename",
                            topic_type, topic_value, page.frontmatter.topic_type, topic_type
                        );
                    }
                    if page.frontmatter.lang_slug.is_some() {
                        eprintln!(
                            "  warning: topic {} / {}: 'lang_slug' is only valid in translation files; ignoring",
                            topic_type, topic_value
                        );
                    }
                    println!("  topic: {} / {}", topic_type, topic_value);
                    db::insert_topic_page(&conn, &topic_value, &page);
                    topic_page_count += 1;
                }
                Err(e) => {
                    eprintln!("  error parsing {}: {e}", path.display());
                }
            }
        }

        for path in &topic_translation_files {
            let stem = path.file_stem().unwrap().to_string_lossy();
            let (topic_type, topic_value, lang) = parse_topic_filename(&stem)
                .expect("topic filename validated in first pass");
            let lang = lang.expect("translation files always carry a lang");
            let text = std::fs::read_to_string(path).expect("Cannot read topic translation");
            match parse_topic_page(&text) {
                Ok(page) => {
                    if page.frontmatter.topic_type != topic_type {
                        eprintln!(
                            "  warning: topic {} / {} [{}]: frontmatter type '{}' disagrees with filename prefix '{}'; using filename",
                            topic_type, topic_value, lang, page.frontmatter.topic_type, topic_type
                        );
                    }
                    println!("  topic translation: {} / {} [{}]", topic_type, topic_value, lang);
                    db::insert_topic_page_translation(&conn, &topic_value, &lang, &page);
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
