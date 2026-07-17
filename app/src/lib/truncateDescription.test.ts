// Self-check for the cover-description preview split. No framework:
//   node --experimental-strip-types src/lib/truncateDescription.test.ts
import assert from 'node:assert/strict';
import { splitDescription } from './truncateDescription.ts';

const p = (n: number, word = 'word'): string => `<p>${Array(n).fill(word).join(' ')}</p>`;

// Short text (<= 80 words) is never truncated.
{
	const html = p(80);
	const s = splitDescription(html);
	assert.equal(s.truncated, false);
	assert.equal(s.preview, html);
	assert.equal(s.rest, '');
}

// Long text keeps whole paragraphs until the 50-word budget, then hides the rest.
{
	const html = p(40) + '\n' + p(40) + '\n' + p(40);
	const s = splitDescription(html);
	assert.equal(s.truncated, true);
	// First paragraph (40) is under 50; the second crosses the budget and is
	// kept whole; the third is hidden.
	assert.equal(s.preview, p(40) + '\n' + p(40));
	assert.equal(s.rest, p(40));
}

// A single long paragraph has no interior newline to round to — show it whole.
{
	const s = splitDescription(p(120));
	assert.equal(s.truncated, false);
}

// Bold/italic markup and entities don't inflate the word count.
{
	const html = `<p>${Array(85).fill('<strong>x</strong>').join(' ')}</p>` + '\n' + p(10);
	const s = splitDescription(html);
	assert.equal(s.truncated, true);
}

console.log('truncateDescription: all assertions passed');
