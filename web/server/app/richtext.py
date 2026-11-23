"""Validation for the rich-text settings fields.

`password_reset_message`, `general_help`, and `contact` are stored as a small
subset of HTML so an administrator can apply bold, italic, underline, lists, and
links in the settings editor.

The browser sanitizes before saving (`web/client/app/src/utils/richtext.ts`), but
that is not a trust boundary: `PUT /settings` is a public HTTP endpoint and the
row can also be written by SQL. So the server *verifies* instead of rewriting --
markup outside the allowed set is rejected with `INVALID_SETTINGS` rather than
silently stripped. Verification is used because a partial rewriter is exactly
where sanitizer bypasses hide, and because stripping would quietly discard an
administrator's formatting.

Plain text is valid rich text: a value with no tags (every row saved before this
feature existed) passes unchanged.
"""

import html
import re

#: Tags a rich-text setting may contain. Mirrors `RICH_TEXT_TAGS` in
#: `web/client/app/src/utils/richtext.ts`.
RICH_TEXT_TAGS = frozenset(
    {"p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a"}
)

#: Attributes allowed per tag. `href` is only meaningful on a link.
ALLOWED_ATTRIBUTES = {"a": frozenset({"href"})}

#: Schemes a link may use; anything else (`javascript:`, `data:`) is rejected.
SAFE_URL = re.compile(r"^(?:https?://|mailto:|#|/)", re.IGNORECASE)

#: A closing tag, an opening tag with attributes, or an HTML comment. The
#: attribute run accepts quoted values containing `>`, so a URL with a `>` in it
#: cannot truncate the tag and smuggle markup past the check.
TAG_PATTERN = re.compile(
    r"<!--.*?-->"
    r"|</([a-zA-Z][a-zA-Z0-9-]*)\s*>"
    r"|<([a-zA-Z][a-zA-Z0-9-]*)((?:\"[^\"]*\"|'[^']*'|[^>\"'])*)>",
    re.DOTALL,
)

ATTRIBUTE_PATTERN = re.compile(
    r"([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'`=<>]+)))?"
)

#: Control characters, which would let `java\tscript:` dodge the scheme check.
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")

#: Block boundaries that separate words when the value is read as text.
BLOCK_BREAK = re.compile(r"</(?:p|li|ul|ol)>|<br\s*/?>", re.IGNORECASE)

ANY_TAG = re.compile(r"<[^>]*>")

WHITESPACE = re.compile(r"\s+")


def _attributes(raw):
    """Yields `(name, value)` pairs from the attribute run of an opening tag."""
    for match in ATTRIBUTE_PATTERN.finditer(raw):
        name = match.group(1).lower()
        value = match.group(2) or match.group(3) or match.group(4) or ""
        yield name, value


def _list_inside_paragraph(value):
    """True when a `<ul>`/`<ol>` opens before its enclosing `<p>` closes."""
    depth = 0

    for match in TAG_PATTERN.finditer(value):
        text = match.group(0)
        if text.startswith("<!--"):
            continue

        closing = match.group(1)
        tag = (closing or match.group(2)).lower()

        if tag == "p":
            depth = max(0, depth - 1) if closing else depth + 1
            continue

        if tag in {"ul", "ol"} and not closing and depth > 0:
            return True

    return False


def validate_rich_text(value):
    """Returns a human-readable problem, or `None` when the value is acceptable.

    The return value is meant for the `INVALID_SETTINGS` message, so it names the
    offending construct without echoing the whole value.
    """
    for match in TAG_PATTERN.finditer(value):
        text = match.group(0)

        if text.startswith("<!--"):
            return "HTML comments are not allowed."

        closing = match.group(1)
        tag = (closing or match.group(2)).lower()

        if tag not in RICH_TEXT_TAGS:
            return f"<{tag}> is not an allowed tag."

        if closing:
            continue

        allowed = ALLOWED_ATTRIBUTES.get(tag, frozenset())

        for name, attribute_value in _attributes(match.group(3) or ""):
            if name not in allowed:
                return f"the '{name}' attribute is not allowed on <{tag}>."

            if name == "href":
                cleaned = CONTROL_CHARACTERS.sub("", attribute_value).strip()
                if not SAFE_URL.match(cleaned):
                    return (
                        "links must use an http(s), mailto:, or relative address."
                    )

    if _list_inside_paragraph(value):
        return "a list must not be placed inside a paragraph."

    return None


def rich_text_to_plain_text(value):
    """The readable text of a rich-text value, for emptiness checks."""
    without_tags = ANY_TAG.sub(" ", BLOCK_BREAK.sub(" ", value))
    return WHITESPACE.sub(" ", html.unescape(without_tags)).strip()


def is_visually_empty(value):
    """True when the value has no readable text, e.g. `""` or `<p><br></p>`."""
    return rich_text_to_plain_text(value) == ""
