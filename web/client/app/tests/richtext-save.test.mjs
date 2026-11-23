import test from 'node:test';
import assert from 'node:assert/strict';
import { isRichTextEmpty, sanitizeRichText } from '../src/utils/richtext.ts';

/**
 * The settings form's HTML view lets an administrator type raw source, so the
 * value reaching `PUT /settings` is sanitized at save time. These cases pin that
 * contract without mounting React: they mirror the form's save step.
 */

/** Mirrors the save step in `AdminSettingsForm.handleSubmit`. */
const saveStep = (raw) => sanitizeRichText(raw);

test('save keeps supported formatting typed as source', () => {
  assert.equal(
    saveStep('<p>Call <strong>ext. 4100</strong></p>'),
    '<p>Call <strong>ext. 4100</strong></p>',
  );
});

test('save removes a script tag typed as source', () => {
  const out = saveStep('<p>Hi</p><script>alert(1)</script>');
  assert.ok(!/<script/i.test(out), out);
  assert.equal(out, '<p>Hi</p>alert(1)');
});

test('save removes an event handler typed as source', () => {
  const out = saveStep('<p onclick="alert(1)">Hi</p>');
  assert.equal(out, '<p>Hi</p>');
});

test('save removes a javascript: link typed as source', () => {
  const out = saveStep('<a href="javascript:alert(1)">click</a>');
  assert.equal(out, '<a>click</a>');
});

test('save repairs a list nested in a paragraph typed as source', () => {
  assert.equal(
    saveStep('<p><ul><li>one</li></ul></p>'),
    '<ul><li>one</li></ul>',
  );
});

test('save leaves bare text as text, which the API wraps on the next read', () => {
  // `sanitizeRichText` does not invent block structure; `pickRichText` in
  // `api/settings.ts` wraps a tag-free value when it is read back, so a value
  // typed without tags round-trips into paragraphs.
  assert.equal(saveStep('plain words'), 'plain words');
});

test('save on a cleared source yields an empty value the form rejects', () => {
  assert.equal(saveStep(''), '');
  assert.equal(isRichTextEmpty(saveStep('   ')), true);
  assert.equal(isRichTextEmpty(saveStep('<p><br></p>')), true);
});

test('save is idempotent, so re-saving does not churn the stored value', () => {
  const source =
    '<p>a <strong>b</strong></p><ul><li>c</li></ul>'
    + '<p><a href="mailto:help@example.gov">mail</a></p>';
  const once = saveStep(source);
  assert.equal(saveStep(once), once);
});
