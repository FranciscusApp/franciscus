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

fn parse_attribute_page(text: &str) -> Result<models::AttributePage, String> {
    let text = text.trim();
    if !text.starts_with("---") {
        return Err("Missing YAML frontmatter".to_string());
    }
    let after_first = &text[3..];
    let end = after_first.find("---").ok_or("Missing closing --- in frontmatter")?;
    let yaml_str = &after_first[..end];
    let body = after_first[end + 3..].trim().to_string();
    let meta: models::AttributePageMeta =
        serde_yaml::from_str(yaml_str).map_err(|e| format!("YAML parse error: {e}"))?;
    Ok(models::AttributePage { meta, content: body })
}

fn run_build(data_dir: &PathBuf, output: &PathBuf) {
    let output_str = output.to_str().expect("Invalid output path");

    if output.exists() {
        std::fs::remove_file(output).expect("Failed to remove existing database");
    }

    let conn = db::open_or_create(output_str);
    db::create_tables(&conn);

    let mut book_count = 0u32;
    let mut annotation_count = 0u32;
    let mut attr_page_count = 0u32;

    let books_dir = data_dir.join("books");
    if books_dir.is_dir() {
        for entry in std::fs::read_dir(&books_dir).expect("Cannot read books directory") {
            let entry = entry.expect("Cannot read entry");
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "md") {
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
    }

    let annotations_dir = data_dir.join("annotations");
    if annotations_dir.is_dir() {
        for entry in std::fs::read_dir(&annotations_dir).expect("Cannot read annotations dir") {
            let entry = entry.expect("Cannot read entry");
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "json") {
                let text = std::fs::read_to_string(&path).expect("Cannot read annotation file");
                match serde_json::from_str::<models::AnnotationFile>(&text) {
                    Ok(af) => {
                        let count = af.annotations.len() + af.relations.len();
                        println!("  annotations: {} ({} entries)", path.file_name().unwrap().to_string_lossy(), count);
                        db::insert_annotations(&conn, &af);
                        annotation_count += count as u32;
                    }
                    Err(e) => {
                        eprintln!("  error parsing {}: {e}", path.display());
                    }
                }
            }
        }
    }

    let attributes_dir = data_dir.join("attributes");
    if attributes_dir.is_dir() {
        for entry in std::fs::read_dir(&attributes_dir).expect("Cannot read attributes dir") {
            let entry = entry.expect("Cannot read entry");
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "md") {
                let text = std::fs::read_to_string(&path).expect("Cannot read attribute file");
                match parse_attribute_page(&text) {
                    Ok(page) => {
                        println!("  attribute: {} / {}", page.meta.attr_type, page.meta.attr_value);
                        db::insert_attribute_page(&conn, &page);
                        attr_page_count += 1;
                    }
                    Err(e) => {
                        eprintln!("  error parsing {}: {e}", path.display());
                    }
                }
            }
        }
    }

    println!(
        "Build complete: {} book(s), {} annotation(s)/relation(s), {} attribute page(s) -> {}",
        book_count,
        annotation_count,
        attr_page_count,
        output.display()
    );
}
