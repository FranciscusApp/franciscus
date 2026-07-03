// Self-check for the prose reverse mapping. No framework:
//   node --experimental-strip-types src/lib/proseDiff.test.ts
import assert from 'node:assert/strict';
import {
	dbContentToSource,
	sourceToDisplay,
	applyProseEdits,
	validateProse
} from './proseDiff.ts';
import type { ProseEdit } from './edits.svelte';

const pe = (over: Partial<ProseEdit>): ProseEdit => ({
	book_id: '1Cel',
	lang: 'la',
	chapter_id: 'prolog',
	kind: 'paragraph',
	target_id: 'prolog-1',
	text: '',
	...over
});

// --- verse marker round-trip -------------------------------------------------
{
	const db = '<v id="prolog-1-1">1</v> Actus et vitam, <ref to="Acts 1:1">quia</ref> ...\n<v id="prolog-1-2">2</v> Sed utinam.';
	const src = dbContentToSource(db);
	assert.equal(src, '[1] Actus et vitam, <ref to="Acts 1:1">quia</ref> ...\n[2] Sed utinam.');
	// sourceToDisplay is the exact inverse (mirror of the Rust parser)
	assert.equal(sourceToDisplay(src, 'prolog-1'), db);
}

// content with no verse markers is unchanged both ways
{
	assert.equal(dbContentToSource('IN NOMINE DOMINI.'), 'IN NOMINE DOMINI.');
	assert.equal(sourceToDisplay('IN NOMINE DOMINI.', 'x'), 'IN NOMINE DOMINI.');
}

// --- source .md fixture ------------------------------------------------------
const md = `---
title: "T"
author: "A"
---

# TITLE

## PROLOGUS <a id="prolog"></a>

<aside>
IN NOMINE DOMINI. AMEN.
</aside>

<p id="prolog-1">
[1] Actus et vitam beatissimi patris.
[2] Sed utinam eius merear.
</p>

<aside>
EXPLICIT PROLOGUS.
</aside>

## Caput I <a id="op1-1"></a>

<aside>
OPUSCULUM PRIMUM
</aside>

<p id="1">
[1] Vir erat in civitate Assisi.
</p>
`;

// replace a paragraph body, preserving the <p> opening tag and every other line
{
	const out = applyProseEdits(md, '1Cel', 'la', [
		pe({ target_id: 'prolog-1', text: '[1] Actus et vita.\n[2] Sed utinam.' })
	]);
	assert.match(out, /<p id="prolog-1">\n\[1\] Actus et vita\.\n\[2\] Sed utinam\.\n<\/p>/);
	assert.match(out, /<p id="1">\n\[1\] Vir erat in civitate Assisi\.\n<\/p>/); // other para untouched
	assert.match(out, /IN NOMINE DOMINI\. AMEN\./); // asides untouched
}

// exact-id matching: id="1" must not hit id="prolog-1"
{
	const out = applyProseEdits(md, '1Cel', 'la', [pe({ target_id: '1', chapter_id: 'op1-1', text: '[1] Vir sanctus.' })]);
	assert.match(out, /<p id="1">\n\[1\] Vir sanctus\.\n<\/p>/);
	assert.match(out, /<p id="prolog-1">\n\[1\] Actus et vitam beatissimi patris\./); // prolog-1 intact
}

// aside edit: locate the Kth aside within its chapter
{
	// first aside of the prologue
	const out = applyProseEdits(md, '1Cel', 'la', [
		pe({ kind: 'aside', target_id: 'prolog-aside-1', chapter_id: 'prolog', text: 'IN NOMINE. AMEN.' })
	]);
	assert.match(out, /<aside>\nIN NOMINE\. AMEN\.\n<\/aside>/);
	assert.match(out, /<aside>\nEXPLICIT PROLOGUS\.\n<\/aside>/); // second prologue aside untouched
}

// aside numbering is per-chapter: op1-1-aside-1 is the chapter's own first aside
{
	const out = applyProseEdits(md, '1Cel', 'la', [
		pe({ kind: 'aside', target_id: 'op1-1-aside-1', chapter_id: 'op1-1', text: 'OPUS PRIMUM.' })
	]);
	assert.match(out, /<aside>\nOPUS PRIMUM\.\n<\/aside>/);
	assert.match(out, /<aside>\nIN NOMINE DOMINI\. AMEN\.\n<\/aside>/); // prologue's first aside untouched
}

// a second prologue aside is aside-2
{
	const out = applyProseEdits(md, '1Cel', 'la', [
		pe({ kind: 'aside', target_id: 'prolog-aside-2', chapter_id: 'prolog', text: 'EXPLICIT.' })
	]);
	assert.match(out, /<aside>\nEXPLICIT\.\n<\/aside>/);
	assert.match(out, /<aside>\nIN NOMINE DOMINI\. AMEN\.\n<\/aside>/); // first untouched
}

// edits for a different rendition/book are ignored
{
	assert.equal(applyProseEdits(md, '1Cel', 'it', [pe({ text: 'x' })]), md);
	assert.equal(applyProseEdits(md, '2Cel', 'la', [pe({ text: 'x' })]), md);
}

// a target that can't be located is a no-op (not a crash)
{
	assert.equal(applyProseEdits(md, '1Cel', 'la', [pe({ target_id: 'nope', text: 'x' })]), md);
}

// --- validation --------------------------------------------------------------
{
	assert.deepEqual(validateProse([pe({ text: '[1] fine text' })]), []);
	assert.deepEqual(validateProse([pe({ text: '[1] with <ref to="Acts 1:1">a ref</ref>.' })]), []);
	assert.deepEqual(validateProse([pe({ text: '   ' })]), ['Text for paragraph prolog-1 cannot be empty.']);
	assert.deepEqual(validateProse([pe({ text: '## heading' })]), ['Headings are not allowed in paragraph prolog-1.']);
	assert.deepEqual(validateProse([pe({ text: 'a <p id="x">nested</p>' })]), [
		'Block tags (<p>/<aside>) are not allowed inside paragraph prolog-1.'
	]);
	assert.deepEqual(validateProse([pe({ text: 'a <ref to="X">unbalanced' })]), [
		'Unbalanced <ref> tags in paragraph prolog-1.'
	]);
	assert.deepEqual(validateProse([pe({ text: 'a <ref>no target</ref>' })]), [
		'A <ref> is missing its "to" target in paragraph prolog-1.'
	]);
}

console.log('proseDiff: all checks passed');
