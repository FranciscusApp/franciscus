use regex::Regex;
use crate::models::*;

pub fn parse_book(input: &str) -> Result<ParsedBook, String> {
    let (meta, body) = parse_frontmatter(input)?;
    let chapters = parse_body(body)?;
    Ok(ParsedBook { meta, chapters })
}

fn parse_frontmatter(input: &str) -> Result<(BookMeta, &str), String> {
    let trimmed = input.trim_start();
    if !trimmed.starts_with("---") {
        return Err("Missing frontmatter delimiter".into());
    }
    let after_first = &trimmed[3..];
    let end = after_first
        .find("\n---")
        .ok_or("Missing closing frontmatter delimiter")?;
    let yaml_block = &after_first[..end];
    let body = &after_first[end + 4..];

    let meta = parse_yaml_frontmatter(yaml_block)?;
    Ok((meta, body))
}

fn parse_yaml_frontmatter(yaml: &str) -> Result<BookMeta, String> {
    let mut id = None;
    let mut title = None;
    let mut author = None;
    let mut date = None;
    let mut reference_edition = None;
    let mut license = None;

    for line in yaml.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((key, val)) = line.split_once(':') {
            let key = key.trim();
            let val = val.trim().trim_matches('"');
            match key {
                "id" => id = Some(val.to_string()),
                "title" => title = Some(val.to_string()),
                "author" => author = Some(val.to_string()),
                "date" => date = Some(val.trim().to_string()),
                "reference_edition" => reference_edition = Some(val.to_string()),
                "license" => license = Some(val.to_string()),
                _ => {}
            }
        }
    }

    Ok(BookMeta {
        id: id.ok_or("Missing 'id' in frontmatter")?,
        title: title.ok_or("Missing 'title' in frontmatter")?,
        author: author.ok_or("Missing 'author' in frontmatter")?,
        date,
        reference_edition,
        license: license.unwrap_or_else(|| "CC0-1.0".to_string()),
    })
}

fn replace_verse_markers(content: &str, paragraph_id: &str) -> String {
    let re = Regex::new(r"\[(\d+)\]").unwrap();
    re.replace_all(content, |caps: &regex::Captures| {
        let n = &caps[1];
        format!(r#"<v id="{paragraph_id}-{n}">{n}</v>"#)
    })
    .into_owned()
}

fn parse_body(body: &str) -> Result<Vec<ParsedChapter>, String> {
    let re_chapter = Regex::new(r#"^##\s+(.+?)\s*<a\s+id="([^"]+)"\s*>\s*</a>\s*$"#).unwrap();
    let re_p_open = Regex::new(r#"^<p\s+id="([^"]+)"(?:\s+label="([^"]+)")?\s*>"#).unwrap();
    let re_p_close = Regex::new(r"^</p>\s*$").unwrap();
    let re_aside_open = Regex::new(r"^<aside>\s*$").unwrap();
    let re_aside_close = Regex::new(r"^</aside>\s*$").unwrap();

    let mut chapters: Vec<ParsedChapter> = Vec::new();
    let mut chapter_pos: u32 = 0;

    enum State {
        Idle,
        InParagraph { id: String, label: Option<String>, lines: Vec<String> },
        InAside { lines: Vec<String> },
    }

    let mut state = State::Idle;
    let mut block_pos: u32 = 0;
    let mut aside_pos: u32 = 0;

    for line in body.lines() {
        if let Some(caps) = re_chapter.captures(line) {
            if let State::Idle = &state {
            } else {
                return Err(format!("Unclosed block before chapter: {line}"));
            }
            let title = caps[1].to_string();
            let id = caps[2].to_string();
            chapter_pos += 1;
            block_pos = 0;
            aside_pos = 0;
            chapters.push(ParsedChapter {
                id,
                title,
                position: chapter_pos,
                blocks: Vec::new(),
            });
            continue;
        }

        match &mut state {
            State::Idle => {
                if re_p_open.is_match(line) {
                    let caps = re_p_open.captures(line).unwrap();
                    let id = caps[1].to_string();
                    let label = caps.get(2).map(|m| m.as_str().to_string());
                    let rest = re_p_open.replace(line, "").trim().to_string();
                    let mut lines = Vec::new();
                    if !rest.is_empty() && !re_p_close.is_match(&rest) {
                        lines.push(rest);
                    }
                    if re_p_close.is_match(line) {
                        block_pos += 1;
                        let raw = lines.join("\n").trim().to_string();
                        let content = replace_verse_markers(&raw, &id);
                        if let Some(ch) = chapters.last_mut() {
                            ch.blocks.push(Block::Paragraph {
                                id,
                                label,
                                content,
                                position: block_pos,
                            });
                        }
                    } else {
                        state = State::InParagraph { id, label, lines };
                    }
                } else if re_aside_open.is_match(line) {
                    state = State::InAside { lines: Vec::new() };
                }
            }
            State::InParagraph { id, label, lines } => {
                if re_p_close.is_match(line) {
                    block_pos += 1;
                    let raw = lines.join("\n").trim().to_string();
                    let content = replace_verse_markers(&raw, id);
                    if let Some(ch) = chapters.last_mut() {
                        ch.blocks.push(Block::Paragraph {
                            id: id.clone(),
                            label: label.clone(),
                            content,
                            position: block_pos,
                        });
                    }
                    state = State::Idle;
                } else {
                    lines.push(line.to_string());
                }
            }
            State::InAside { lines } => {
                if re_aside_close.is_match(line) {
                    block_pos += 1;
                    aside_pos += 1;
                    let content = lines.join("\n").trim().to_string();
                    if let Some(ch) = chapters.last_mut() {
                        let id = format!("{}-aside-{}", ch.id, aside_pos);
                        ch.blocks.push(Block::Aside {
                            id,
                            content,
                            position: block_pos,
                        });
                    }
                    state = State::Idle;
                } else {
                    lines.push(line.to_string());
                }
            }
        }
    }

    Ok(chapters)
}
