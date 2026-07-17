// Cover descriptions are authored as Markdown and stored as rendered HTML
// (see server render_markdown). Long ones get a preview + [read more]:
// short descriptions render whole, long ones show only the leading paragraphs
// up to a word budget. The unit of truncation is the paragraph — the rendered
// Markdown block — so the "next newline" a reader would see is a <p> boundary.

/** Show a preview only when the full text exceeds this many words. */
const THRESHOLD_WORDS = 80;
/** Preview target: keep whole paragraphs until this budget is reached. */
const PREVIEW_WORDS = 50;

export interface DescriptionSplit {
	/** HTML always shown (whole paragraphs, up to the word budget). */
	preview: string;
	/** The remaining paragraphs, hidden behind [read more] (empty if none). */
	rest: string;
	/** True when the text was long enough to hide a tail behind [read more]. */
	truncated: boolean;
}

/** Rough word count of an HTML fragment (tags and entities dropped). */
function countWords(html: string): number {
	const text = html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&[#a-z0-9]+;/gi, ' ')
		.trim();
	return text ? text.split(/\s+/).length : 0;
}

/**
 * Split a rendered-Markdown description into a collapsed preview and decide
 * whether a [read more] toggle is warranted. Falls back to "not truncated"
 * (show everything) whenever the input is short or isn't the expected series
 * of <p> blocks, so callers can render `preview` unconditionally when collapsed.
 */
export function splitDescription(html: string): DescriptionSplit {
	if (countWords(html) <= THRESHOLD_WORDS) {
		return { preview: html, rest: '', truncated: false };
	}

	const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi);
	if (!paragraphs || paragraphs.length <= 1) {
		return { preview: html, rest: '', truncated: false };
	}

	let words = 0;
	let cut = 0;
	for (; cut < paragraphs.length; cut++) {
		words += countWords(paragraphs[cut]);
		if (words >= PREVIEW_WORDS) {
			cut++; // keep the paragraph that crossed the budget
			break;
		}
	}

	// Everything fit within the budget — nothing to hide.
	if (cut >= paragraphs.length) {
		return { preview: html, rest: '', truncated: false };
	}

	return {
		preview: paragraphs.slice(0, cut).join('\n'),
		rest: paragraphs.slice(cut).join('\n'),
		truncated: true
	};
}
