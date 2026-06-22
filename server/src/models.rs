use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookMeta {
    pub id: String,
    pub title: String,
    pub author: String,
    pub date: Option<String>,
    pub reference_edition: Option<String>,
    pub license: String,
}

// --- Parsed structures (from markdown, before DB insertion) ---

#[derive(Debug, Clone)]
pub enum Block {
    Paragraph {
        id: String,
        label: Option<String>,
        content: String,
        position: u32,
    },
    Aside {
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

// --- JSON annotation file structures ---

#[derive(Debug, Clone, Deserialize)]
pub struct AnnotationEntry {
    pub book_id: String,
    pub paragraph_id: String,
    pub attr_type: String,
    pub attr_value: String,
    pub by: String,
    pub verified: bool,
    #[serde(default)]
    pub evidence: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RelationEntry {
    pub source_book_id: String,
    pub source_paragraph_id: String,
    pub target_book_id: String,
    pub target_paragraph_id: String,
    pub relation_type: String,
    pub by: String,
    pub verified: bool,
    #[serde(default)]
    pub evidence: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AnnotationFile {
    pub annotations: Vec<AnnotationEntry>,
    #[serde(default)]
    pub relations: Vec<RelationEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AttributePageMeta {
    pub attr_type: String,
    pub attr_value: String,
    pub title: String,
}

#[derive(Debug, Clone)]
pub struct AttributePage {
    pub meta: AttributePageMeta,
    pub content: String,
}
