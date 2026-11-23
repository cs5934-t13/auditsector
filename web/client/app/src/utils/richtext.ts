/**
 * Minimal rich-text handling for the administrator-editable settings.
 *
 * The settings fields ("Password Help", "General Help", "Contact") are stored as
 * a small, sanitized subset of HTML so an administrator can apply bold, italic,
 * underline, lists, and links without opening the app up to script injection.
 *
 * Security model: the stored value is never trusted. It is re-parsed and
 * re-serialized on the way out, keeping only whitelisted tags and attributes
 * and escaping everything else as text. Anything that is not recognised is
 * dropped, so the output cannot contain an event handler, a `script` tag, or a
 * `javascript:` URL even if it was written straight to the database.
 *
 * This module is dependency-free and DOM-free so it can be unit-tested with
 * `node --test`.
 */

/** Tags a rich-text setting may contain. Anything else is dropped. */
export const RICH_TEXT_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'a',
] as const;

/** Tags that hold no content. */
const VOID_TAGS = new Set(['br']);

/** Per-tag attributes that survive sanitizing. */
const ALLOWED_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  a: new Set(['href']),
};

/** URL schemes a link may use. Anything else (`javascript:`, `data:`) is removed. */
const SAFE_URL = /^(?:https?:\/\/|mailto:|#|\/)/i;

const TAGS = new Set<string>(RICH_TEXT_TAGS);

/**
 * Matches a comment, a closing tag, or an opening tag with its attributes.
 *
 * Attributes are matched as a run of double-quoted, single-quoted, or
 * unquoted-and-not-`>` spans, so a `>` inside an attribute value does not end
 * the tag early.
 */
const TAG_PATTERN =
  /<!--[\s\S]*?-->|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/** One attribute name with an optional value in any of the three quote styles. */
const ATTRIBUTE_PATTERN =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

/**
 * `&` that does *not* start a character reference.
 *
 * The editor's `innerHTML` legitimately contains `&nbsp;` and `&amp;`, so a
 * blanket escape would double-encode them. Named references only ever decode to
 * characters (never markup), so preserving them is safe.
 */
const BARE_AMPERSAND = /&(?!#\d+;|#[xX][0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const ENTITY_PATTERN = /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/** Escapes text for use in an HTML text node. */
export function escapeHtml(value: string): string {
  return value
    .replace(BARE_AMPERSAND, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Decodes the character references this module emits, plus numeric ones. */
function decodeEntities(value: string): string {
  return value.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body[0] !== '#') {
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    }

    const code = body[1] === 'x' || body[1] === 'X'
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);

    // Reject out-of-range values rather than producing a lone surrogate.
    if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) {
      return match;
    }

    try {
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });
}

/** Returns the safe `href`, or `null` when the attribute must be dropped. */
function safeHref(rawValue: string): string | null {
  // Strip control characters and surrounding whitespace before looking at the
  // scheme: `java\tscript:` is a real bypass in naive filters.
  const value = stripControlCharacters(rawValue).trim();

  if (!value) {
    return null;
  }

  return SAFE_URL.test(value) ? value : null;
}

interface ParsedAttributes {
  [name: string]: string;
}

/** Keeps only whitelisted attributes with safe values. */
function parseAttributes(tag: string, raw: string): ParsedAttributes {
  const allowed = ALLOWED_ATTRIBUTES[tag];
  const attributes: ParsedAttributes = {};

  if (!allowed) {
    return attributes;
  }

  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ATTRIBUTE_PATTERN.exec(raw)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';

    // Case-sensitivity: HTML attribute names are case-insensitive, so `HREF`
    // must be treated like `href` and then normalized.
    if (!allowed.has(name)) {
      continue;
    }

    if (name === 'href') {
      const href = safeHref(value);
      if (href) {
        attributes.href = href;
      }
    }
  }

  return attributes;
}

/** List containers, whose only valid child is `li`. */
const LIST_TAGS = new Set(['ul', 'ol']);

/** A parsed node: text, or a whitelisted element with sanitized attributes. */
type RichTextNode =
  | { type: 'text'; value: string }
  | {
      type: 'element';
      tag: string;
      attributes: ParsedAttributes;
      children: RichTextNode[];
    };

/** A whitelisted element while it is being built by `tokenize`. */
interface OpenElement {
  tag: string;
  attributes: ParsedAttributes;
  children: RichTextNode[];
}

/**
 * Splits HTML into text runs and whitelisted elements.
 *
 * Unknown tags disappear here (their inner text is kept as text nodes), and
 * attributes are filtered at the same time, so the tree builder only ever sees
 * safe elements. A stack nests the elements, and also closes any tag the source
 * left open.
 */
function tokenize(input: string): RichTextNode[] {
  const root: RichTextNode[] = [];
  const stack: OpenElement[] = [];
  let container = root;
  let cursor = 0;

  const appendText = (text: string) => {
    if (text) {
      container.push({ type: 'text', value: text });
    }
  };

  /** Pops one element off the stack and appends it to its parent. */
  const closeTop = () => {
    const { tag, attributes, children } = stack.pop()!;
    container = stack.length > 0
      ? stack[stack.length - 1].children
      : root;
    container.push({ type: 'element', tag, attributes, children });
  };

  /** Closes every open element down to and including `tag`. */
  const closeTo = (tag: string) => {
    const index = stack.map((element) => element.tag).lastIndexOf(tag);
    if (index === -1) {
      // A stray closing tag: nothing to close.
      return;
    }

    while (stack.length > index) {
      closeTop();
    }
  };

  TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_PATTERN.exec(input)) !== null) {
    appendText(input.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    // Comments and unknown constructs are dropped entirely.
    if (match[0].startsWith('<!--')) {
      continue;
    }

    const closing = match[1] !== undefined;
    const tag = (closing ? match[1] : match[2]).toLowerCase();

    if (!TAGS.has(tag)) {
      continue;
    }

    if (closing) {
      closeTo(tag);
      continue;
    }

    if (VOID_TAGS.has(tag)) {
      container.push({ type: 'element', tag, attributes: {}, children: [] });
      continue;
    }

    const element: OpenElement = {
      tag,
      attributes: parseAttributes(tag, match[3] ?? ''),
      children: [],
    };
    stack.push(element);
    container = element.children;
  }

  appendText(input.slice(cursor));

  while (stack.length > 0) {
    closeTop();
  }

  return root;
}

/** True when the node list has anything renderable in it. */
function hasContent(nodes: RichTextNode[]): boolean {
  return nodes.some((node) =>
    node.type === 'element' ? true : node.value.trim().length > 0,
  );
}

/** Serializes a node list back to HTML. */
function serializeNodes(nodes: RichTextNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') {
        return escapeHtml(node.value);
      }

      const attributes = Object.entries(node.attributes)
        .map(([name, value]) => ` ${name}="${escapeHtml(decodeEntities(value))}"`)
        .join('');

      return `<${node.tag}${attributes}>${serializeNodes(node.children)}</${node.tag}>`;
    })
    .join('');
}

/** Builds an element node with no attributes. */
function block(tag: string, children: RichTextNode[]): RichTextNode {
  return { type: 'element', tag, attributes: {}, children };
}

/**
 * Repairs the block structure.
 *
 * `execCommand('insertUnorderedList')` inside an empty paragraph produces
 * `<p><ul><li>…</li></ul></p>`. Browsers render that by implicitly closing the
 * paragraph, so storing it verbatim would make the markup disagree with what
 * the user saw. Every list is therefore moved out of any paragraph it sits in,
 * and a list whose only child is a paragraph is flattened back.
 */
function normalizeBlocks(nodes: RichTextNode[]): RichTextNode[] {
  const result: RichTextNode[] = [];

  const push = (node: RichTextNode) => {
    // Consecutive text nodes are merged so the output is stable and diffable.
    const previous = result[result.length - 1];
    if (node.type === 'text' && previous?.type === 'text') {
      previous.value += node.value;
      return;
    }

    result.push(node);
  };

  for (const node of nodes) {
    if (node.type === 'text') {
      push(node);
      continue;
    }

    const { tag } = node;

    // A paragraph stays a paragraph, but its children are normalized first.
    if (tag === 'p') {
      const children = normalizeBlocks(node.children);
      const lists = children.filter(
        (child) => child.type === 'element' && LIST_TAGS.has(child.tag),
      );

      // Common case: no list inside the paragraph.
      if (lists.length === 0) {
        push({ ...node, children: dedupeWhitespace(children) });
        continue;
      }

      // Split the paragraph: inline content before/after each list becomes its
      // own paragraph, and the lists sit between them.
      let inline: RichTextNode[] = [];

      const flushInline = () => {
        const kept = dedupeWhitespace(inline);
        if (hasContent(kept)) {
          push(block('p', kept));
        }
        inline = [];
      };

      for (const child of children) {
        if (child.type === 'element' && LIST_TAGS.has(child.tag)) {
          flushInline();
          push(child);
          continue;
        }

        inline.push(child);
      }

      flushInline();
      continue;
    }

    // A list whose children are paragraphs (list styling applied to body copy)
    // becomes `li`s, which is what it renders as.
    if (LIST_TAGS.has(tag)) {
      const items = normalizeBlocks(node.children).flatMap((child) => {
        // A `br` directly inside a list is invalid and carries no text.
        if (child.type === 'element' && child.tag === 'br') {
          return [];
        }

        if (child.type === 'element' && child.tag === 'p') {
          return child.children.length > 0 ? [block('li', child.children)] : [];
        }

        if (child.type === 'element' && child.tag === 'li') {
          return [child];
        }

        // Loose text or inline markup directly in a list still needs an item.
        const kept = dedupeWhitespace([child]);
        return hasContent(kept) ? [block('li', kept)] : [];
      });

      if (items.length > 0) {
        push({ ...node, children: items });
      }
      continue;
    }

    // `li`, and the inline tags, keep their shape.
    push({ ...node, children: normalizeBlocks(node.children) });
  }

  return result;
}

/**
 * Trims whitespace-only text nodes at the edges of a block.
 *
 * Whitespace *between* inline elements is meaningful
 * (`<strong>a</strong> <em>b</em>`), so only the edges are trimmed: they are
 * where the browser adds newlines for readability.
 */
function dedupeWhitespace(nodes: RichTextNode[]): RichTextNode[] {
  const kept = nodes.filter(
    (node, index) =>
      node.type === 'element'
      || node.value.trim().length > 0
      || (index > 0 && index < nodes.length - 1),
  );

  if (kept.length === 0) {
    return kept;
  }

  // Trim a partial whitespace run at each end (e.g. a newline inside a
  // paragraph), then drop a node that became empty.
  const trimmed = kept.map((node, index) => {
    if (node.type !== 'text') {
      return node;
    }

    const atStart = index === 0;
    const atEnd = index === kept.length - 1;
    if (!atStart && !atEnd) {
      return node;
    }

    let value = node.value;
    if (atStart) value = value.replace(/^\s+/, '');
    if (atEnd) value = value.replace(/\s+$/, '');
    return { type: 'text' as const, value };
  });

  return trimmed.filter(
    (node) => node.type === 'element' || node.value.length > 0,
  );
}

/**
 * Re-serializes arbitrary HTML into the whitelisted subset.
 *
 * Unknown tags are dropped (their text content is kept and escaped), unknown
 * attributes are dropped, unclosed tags are closed, and invalid nesting such as
 * a list inside a paragraph is repaired. The result is balanced, canonical, and
 * safe to render: every tag is from `RICH_TEXT_TAGS`, the only attribute is a
 * scheme-checked `href`, and all other text is escaped.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }

  const tree = tokenize(input);
  const normalized = normalizeBlocks(tree);
  return serializeNodes(normalized);
}

/**
 * Extracts readable text from rich text.
 *
 * Used for "is this effectively empty?" checks and anywhere the value has to be
 * announced or measured as text rather than markup.
 */
export function richTextToPlainText(input: string | null | undefined): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }

  const withoutTags = input
    // Block boundaries read as spaces, so "<p>a</p><p>b</p>" is "a b".
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|li|ul|ol)>/gi, ' ')
    .replace(/<[^>]*>/g, '');

  return decodeEntities(withoutTags)
    // `&nbsp;` arrives as U+00A0; treat it (and any other space) as whitespace.
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the value has no readable text, e.g. `""` or `<p><br></p>`. */
export function isRichTextEmpty(input: string | null | undefined): boolean {
  return richTextToPlainText(input).length === 0;
}

/**
 * Control characters, which must be removed before a link scheme is inspected:
 * `java\tscript:` is a real bypass in naive filters.
 *
 * Handled as a codepoint check rather than a regex literal: the range is
 * invisible in source, and `no-control-regex` exists precisely to stop it being
 * written that way.
 */
function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join('');
}

/**
 * Picks the stored value, falling back when it is missing or visually empty.
 *
 * Mirrors `pickString` in `src/api/settings.ts`, but for HTML: a value like
 * `<p></p>` is a non-empty string yet has nothing to show, so it counts as
 * absent.
 */
export function richTextOrDefault(value: unknown, fallback: string): string {
  if (typeof value === 'string' && !isRichTextEmpty(value)) {
    return value;
  }

  return fallback;
}

/** True when the value contains any markup at all. */
export function hasMarkup(value: string): boolean {
  return /<\/?[a-zA-Z][^>]*>/.test(value);
}

/**
 * Converts plain text (the built-in defaults, or a legacy value saved before
 * rich text existed) to the HTML the renderer expects.
 *
 * Existing values are plain strings with no tags, so they need their line
 * breaks preserved rather than being collapsed into one paragraph.
 */
export function plainTextToRichText(value: string): string {
  if (hasMarkup(value)) {
    return value;
  }

  const paragraphs = value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return '';
  }

  return paragraphs
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
