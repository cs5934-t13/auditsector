import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  hasMarkup,
  isRichTextEmpty,
  plainTextToRichText,
  richTextOrDefault,
  richTextToPlainText,
  sanitizeRichText,
} from '../src/utils/richtext.ts';

// --- sanitizeRichText ------------------------------------------------------

test('sanitizeRichText keeps the supported formatting tags', () => {
  const html = '<p><strong>Bold</strong> <em>italic</em> <u>under</u></p>';
  assert.equal(sanitizeRichText(html), html);
});

test('sanitizeRichText keeps lists and links with safe hrefs', () => {
  const html =
    '<ul><li>One</li><li><a href="https://example.gov">Two</a></li></ul>';
  assert.equal(sanitizeRichText(html), html);
});

test('sanitizeRichText allows mailto, anchor, and root-relative links', () => {
  for (const href of ['mailto:help@example.gov', '#help', '/settings']) {
    const output = sanitizeRichText(`<a href="${href}">x</a>`);
    assert.equal(output, `<a href="${href}">x</a>`, href);
  }
});

test('sanitizeRichText drops script tags but keeps their text escaped', () => {
  const output = sanitizeRichText('<p>Hi<script>alert("x")</script></p>');

  assert.notEqual(output, undefined);
  assert.ok(!/<script/i.test(output), output);
  // The literal characters survive as text, so nothing executes.
  assert.ok(output.includes('&quot;'), output);
});

test('sanitizeRichText drops event-handler attributes', () => {
  for (const html of [
    '<p onclick="alert(1)">x</p>',
    '<a href="https://ok.example" onmouseover="alert(1)">x</a>',
    '<p onload=alert(1)>x</p>',
  ]) {
    const output = sanitizeRichText(html);
    assert.ok(!/on(error|click|load|mouseover)\s*=/i.test(output), output);
  }
});

test('sanitizeRichText rejects javascript: and data: URLs', () => {
  for (const href of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'java\tscript:alert(1)',
  ]) {
    const output = sanitizeRichText(`<a href="${href}">x</a>`);
    assert.equal(output, '<a>x</a>', href);
  }
});

test('sanitizeRichText ignores unknown attributes but keeps href', () => {
  const output = sanitizeRichText(
    '<a href="https://ok.example" target="_blank" rel="noopener" style="color:red">x</a>',
  );
  assert.equal(output, '<a href="https://ok.example">x</a>');
});

test('sanitizeRichText removes unsupported tags but keeps their text', () => {
  assert.equal(sanitizeRichText('<h1>Title</h1>'), 'Title');
  assert.equal(sanitizeRichText('<div><span>x</span></div>'), 'x');
  assert.equal(sanitizeRichText('<img src=x onerror=alert(1)>'), '');
});

test('sanitizeRichText escapes text outside tags', () => {
  assert.equal(sanitizeRichText('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});

test('sanitizeRichText preserves existing entities without double-encoding', () => {
  assert.equal(sanitizeRichText('<p>a&nbsp;b</p>'), '<p>a&nbsp;b</p>');
  assert.equal(sanitizeRichText('<p>a&amp;b</p>'), '<p>a&amp;b</p>');
});

test('sanitizeRichText balances unclosed and stray tags', () => {
  assert.equal(sanitizeRichText('<p><strong>x'), '<p><strong>x</strong></p>');
  assert.equal(sanitizeRichText('</p>x'), 'x');
  assert.equal(sanitizeRichText('<p><em>a</p>'), '<p><em>a</em></p>');
});

test('sanitizeRichText handles quotes containing a closing bracket', () => {
  const output = sanitizeRichText('<a href="https://ok.example/?a=1&b=2">x</a>');
  assert.equal(output, '<a href="https://ok.example/?a=1&amp;b=2">x</a>');
});

test('sanitizeRichText returns empty string for non-strings', () => {
  assert.equal(sanitizeRichText(undefined), '');
  assert.equal(sanitizeRichText(null), '');
  assert.equal(sanitizeRichText(''), '');
});

// --- block structure -------------------------------------------------------

test('sanitizeRichText lifts a list out of the paragraph execCommand wraps it in', () => {
  // Chrome emits this for "bulleted list" applied to a paragraph's content.
  assert.equal(
    sanitizeRichText('<p><ul><li>one</li></ul></p>'),
    '<ul><li>one</li></ul>',
  );
});

test('sanitizeRichText splits a paragraph around a nested list', () => {
  assert.equal(
    sanitizeRichText('<p>before<ul><li>one</li></ul>after</p>'),
    '<p>before</p><ul><li>one</li></ul><p>after</p>',
  );
});

test('sanitizeRichText keeps sibling lists from consecutive toolbar clicks', () => {
  assert.equal(
    sanitizeRichText('<ul><li>a</li></ul><ul><li>b</li></ul>'),
    '<ul><li>a</li></ul><ul><li>b</li></ul>',
  );
});

test('sanitizeRichText turns paragraphs inside a list into list items', () => {
  assert.equal(
    sanitizeRichText('<ul><p>one</p><p>two</p></ul>'),
    '<ul><li>one</li><li>two</li></ul>',
  );
});

test('sanitizeRichText drops a break that sits directly inside a list', () => {
  assert.equal(sanitizeRichText('<ul><br><li>a</li></ul>'), '<ul><li>a</li></ul>');
});

test('sanitizeRichText preserves significant whitespace between inline tags', () => {
  assert.equal(
    sanitizeRichText('<p><strong>a</strong> <em>b</em></p>'),
    '<p><strong>a</strong> <em>b</em></p>',
  );
});

test('sanitizeRichText is idempotent', () => {
  for (const html of [
    '<p>a <strong>b</strong></p>',
    '<p><ul><li>x</li></ul></p>',
    '<ul><li>a</li><li>b</li></ul>',
    '<p>before<ul><li>one</li></ul>after</p>',
  ]) {
    const once = sanitizeRichText(html);
    assert.equal(sanitizeRichText(once), once, html);
  }
});

// --- plain text helpers ----------------------------------------------------

test('richTextToPlainText flattens blocks and entities', () => {
  assert.equal(
    richTextToPlainText('<p>one</p><p>two&nbsp;three</p>'),
    'one two three',
  );
  assert.equal(richTextToPlainText('<ul><li>a</li><li>b</li></ul>'), 'a b');
  assert.equal(richTextToPlainText('a<br>b'), 'a b');
});

test('isRichTextEmpty detects visually empty markup', () => {
  for (const value of ['', '   ', '<p></p>', '<p><br></p>', '<p>&nbsp;</p>', '<ul><li></li></ul>']) {
    assert.equal(isRichTextEmpty(value), true, JSON.stringify(value));
  }

  assert.equal(isRichTextEmpty('<p>x</p>'), false);
});

test('richTextOrDefault falls back for empty or non-string values', () => {
  const fallback = '<p>default</p>';
  for (const value of [undefined, null, 42, '', '<p><br></p>']) {
    assert.equal(richTextOrDefault(value, fallback), fallback, String(value));
  }

  assert.equal(richTextOrDefault('<p>set</p>', fallback), '<p>set</p>');
});

test('hasMarkup distinguishes HTML from plain text', () => {
  assert.equal(hasMarkup('<p>x</p>'), true);
  assert.equal(hasMarkup('plain text'), false);
  assert.equal(hasMarkup('a < b'), false);
});

test('plainTextToRichText preserves line breaks of legacy values', () => {
  assert.equal(plainTextToRichText('one line'), '<p>one line</p>');
  assert.equal(plainTextToRichText('a\nb'), '<p>a<br>b</p>');
  assert.equal(plainTextToRichText('a\n\nb'), '<p>a</p><p>b</p>');
  assert.equal(plainTextToRichText(''), '');
});

test('plainTextToRichText escapes legacy values that look like markup', () => {
  assert.equal(plainTextToRichText('a & <b'), '<p>a &amp; &lt;b</p>');
});

test('plainTextToRichText leaves existing HTML untouched', () => {
  const html = '<p>already <strong>rich</strong></p>';
  assert.equal(plainTextToRichText(html), html);
});

test('escapeHtml escapes the five text-node characters', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});
