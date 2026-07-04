// Self-check for the annotation reverse mapping. No framework:
//   node --experimental-strip-types src/lib/annotationDiff.test.ts
import assert from 'node:assert/strict';
import { applyAnnotationEdits, parseTopicsVocab, validateAdds } from './annotationDiff.ts';
import type { Edit } from './edits.svelte';

const e = (op: Edit['op'], para: string, type: string, value: string, extra: Partial<Edit> = {}): Edit => ({
	book_id: '1Cel',
	paragraph_id: para,
	topic_type: type,
	topic_value: value,
	op,
	...extra
});

const base = `description_short:
  en: A book.
annotations:
  prolog-1:
  - person:st_francis_of_assisi
  - same_episode:LMj-prol-1
  '40':
  - theme:prayer
  - virtue:fortitude
`;

// add a topic to an existing paragraph: attributed to the contributor by default
{
	const out = applyAnnotationEdits(base, '1Cel', [e('add', '40', 'place', 'assisi')], 'me');
	assert.match(out, /  '40':\n  - theme:prayer\n  - virtue:fortitude\n  - topic: place:assisi\n    by: me\n/);
}

// remove a scalar
{
	const out = applyAnnotationEdits(base, '1Cel', [e('remove', '40', 'theme', 'prayer')], 'me');
	assert.match(out, /  '40':\n  - virtue:fortitude\n/);
	assert.doesNotMatch(out, /theme:prayer/);
}

// verify: scalar -> map with by
{
	const out = applyAnnotationEdits(base, '1Cel', [e('verify', '40', 'theme', 'prayer', { verified: true })], 'alfredo');
	assert.match(out, /  - topic: theme:prayer\n    by: alfredo\n/);
}

// comment: scalar -> map with JSON-encoded comment
{
	const out = applyAnnotationEdits(base, '1Cel', [e('comment', '40', 'virtue', 'fortitude', { comment: 'courage: fits better' })], 'me');
	assert.match(out, /  - topic: virtue:fortitude\n    comment: "courage: fits better"\n/);
}

// verify + comment on the same item -> one map with both fields
{
	const out = applyAnnotationEdits(
		base,
		'1Cel',
		[e('verify', '40', 'theme', 'prayer'), e('comment', '40', 'theme', 'prayer', { comment: 'ok' })],
		'al'
	);
	assert.match(out, /  - topic: theme:prayer\n    by: al\n    comment: "ok"\n/);
}

// removing the last item drops the paragraph key entirely
{
	const out = applyAnnotationEdits(
		base,
		'1Cel',
		[e('remove', 'prolog-1', 'person', 'st_francis_of_assisi'), e('remove', 'prolog-1', 'same_episode', 'LMj-prol-1')],
		'me'
	);
	assert.doesNotMatch(out, /prolog-1/);
	assert.match(out, /  '40':/); // other paragraph untouched
}

// add to a brand-new paragraph appends a new key block, attributed to the author
{
	const out = applyAnnotationEdits(base, '1Cel', [e('add', '99', 'theme', 'miracle')], 'me');
	assert.match(out, /  '99':\n  - topic: theme:miracle\n    by: me\n/);
}

// relation add is attributed to the author and is not vocab-checked
{
	const out = applyAnnotationEdits(base, '1Cel', [e('add', '40', 'same_episode', 'LMj-9-1')], 'me');
	assert.match(out, /  - relation: same_episode:LMj-9-1\n    by: me\n/);
}

// edits for a different book are ignored
{
	const out = applyAnnotationEdits(base, '1Cel', [e('add', '40', 'place', 'rome', { book_id: '2Cel' })], 'me');
	assert.equal(out, base);
}

// no annotations section: create one
{
	const out = applyAnnotationEdits('description_short:\n  en: X\n', '1Cel', [e('add', '1', 'theme', 'prayer')], 'me');
	assert.match(out, /\nannotations:\n  '1':\n  - topic: theme:prayer\n    by: me\n$/);
}

// editing a paragraph that already holds a human map item with a BARE comment
// (spec-legal, not our JSON emit) must not crash, and preserves the item
{
	const human = `annotations:
  '7':
  - topic: virtue:fortitude
    by: alfredo
    comment: courage: fits better
  - theme:prayer
`;
	const out = applyAnnotationEdits(human, '1Cel', [e('add', '7', 'place', 'assisi')], 'me');
	assert.match(out, /  - topic: virtue:fortitude\n    by: alfredo\n    comment: "courage: fits better"\n/);
	assert.match(out, /  - topic: place:assisi\n    by: me\n/);
}

// validation against the closed vocabulary
{
	const vocab = parseTopicsVocab(`# comment
theme:
- prayer
- miracle
place:
- assisi
`);
	assert.deepEqual(validateAdds([e('add', '40', 'theme', 'prayer')], vocab), []);
	assert.deepEqual(validateAdds([e('add', '40', 'theme', 'nope')], vocab), [
		'Unknown topic "theme:nope" (not in topics.yaml)'
	]);
	// relations skip the vocab check
	assert.deepEqual(validateAdds([e('add', '40', 'same_episode', 'LMj-1-1')], vocab), []);
	// non-add ops are not validated
	assert.deepEqual(validateAdds([e('verify', '40', 'theme', 'nope')], vocab), []);
}

console.log('annotationDiff: all checks passed');
