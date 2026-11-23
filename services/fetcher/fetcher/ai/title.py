"""Derive a human-readable report title from the best available source.

Scrapy stores downloads under content-hashed filenames
(``files/<spider>/full/<sha1>.pdf``), so ``Path(pdf_path).name`` is a hash, never
a report name. The write path calls :func:`derive_title` to pick a label from,
in order:

1. The PDF's embedded ``title`` metadata, cleaned of Office save-dialog
   prefixes such as ``Microsoft Word - ``.
2. The masthead at the top of page 1.
3. The filename inside the report's source URL.

Each step is a pure function, so the chain can be tested without a PDF. A
candidate is only accepted when it passes :func:`_is_usable`; otherwise the next
source is tried, and a hash is never returned when anything else is available.
"""

import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

MIN_TITLE_LENGTH = 12
MAX_TITLE_LENGTH = 200

_WHITESPACE_RE = re.compile(r"\s+")

# File extensions stripped from metadata titles and URL filenames alike.
_EXTENSION_RE = re.compile(
    r"\.(?:pdf|docx?|pptx?|xlsx?|indd|qxd|pub|rtf|txt|html?)$", re.IGNORECASE
)

# Office applications write "<App> - <name>" (Word) or "<App> - <name>" into the
# title metadata. Remove the wrapper but keep the name that follows it.
_OFFICE_PREFIX_RE = re.compile(
    r"^(?:microsoft\s+(?:word|powerpoint|excel|publisher|office))\s*[-–—]\s*",
    re.IGNORECASE,
)

# Splits ``CommunityResistance`` into ``Community Resistance`` for URL
# filenames, which are the last resort and the only source that needs it.
_CAMEL_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")

# A content hash, or a fragment of one, is never a title.
_HEX_HASH_RE = re.compile(r"[0-9a-f]{16,}", re.IGNORECASE)

# Placeholder titles that some PDF generators emit when nothing was set.
_JUNK_TITLES = frozenset(
    {
        "untitled",
        "untitled document",
        "untitled report",
        "document",
        "document1",
        "microsoft word",
        "no title",
        "slide 1",
        "presentation",
        "contents",
        "table of contents",
        "an equal opportunity employer",
        "equal opportunity employer",
    }
)

#: Phrases that mark a line as boilerplate even when more text follows, such as
#: a footer that runs into an address block.
_JUNK_PREFIXES = (
    "an equal opportunity employer",
    "equal opportunity employer",
    "table of contents",
)

# Letterhead runs address parts together with pipes, as in
# "Suite 2410 | PO Box 94729, Seattle | Washington 98124-4729".
_ADDRESS_SEPARATOR_RE = re.compile(r"\|.*\d{5}", re.IGNORECASE)

# A title is a label, not a sentence: a trailing full stop, or a body-length
# run of prose, means the candidate came from the report's opening paragraph.
_SENTENCE_RE = re.compile(r"\.\s*$")
_PROSE_LENGTH = 140

# Splits a heading run exported from a CMS into its sentences.
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")

# Text extraction appends running page markers to a heading, as in
# "INTERIM REPORT ... | Page 1 of 5 |". They are not part of the title.
_TRAILING_PAGE_MARK_RE = re.compile(
    r"(?:\s*[|\u00b7\u2022\-\u2013\u2014]\s*)?"
    r"page\s*\d+(?:\s*(?:of|/)\s*\d+)?"
    r"(?:\s*[|\u00b7\u2022\-\u2013\u2014]\s*)?$",
    re.IGNORECASE,
)

# An organization name on its own names the publisher, not the document. Only
# rejected when the line carries no document-kind keyword, so real titles such
# as "Seattle Office for Civil Rights Enforcement Audit" survive.
_ORGANIZATION_RE = re.compile(
    r"\b(?:center|centre|department|university|institute|school|college|"
    r"commission|bureau|agency|foundation|associates|consulting|llc)\b",
    re.IGNORECASE,
)

# Masthead lines that name a person and their title, as in "Jane Doe, City
# Auditor", or an addressee. The comma is required so a report title that
# merely mentions an auditor ("Office of City Auditor Recommendations") is not
# discarded; a bare office name is handled by ``_BRANDING_RE`` instead.
_ROLE_LINE_RE = re.compile(
    r"^(?:the\s+)?honorable\b"
    r"|,\s*(?:acting\s+|interim\s+|deputy\s+)?(?:city\s+|county\s+)?"
    r"(?:auditor|director|clerk|president|councilmember|council\s+member|"
    r"mayor|chief|manager|administrator|chair|chairperson|co-?chair)\b",
    re.IGNORECASE,
)

# Lines that carry no title information: bare numbers, dates, page furniture.
_DATE_OR_NUMBER_RE = re.compile(r"^[\d\s/\-–—.,:]+$")

#: Masthead-level site branding. Reports repeat the auditor's own office name
#: in a sidebar or header, which is not the document's title.
_BRANDING_RE = re.compile(
    r"^(?:.*\b(?:office\s+of\s+(?:the\s+)?(?:city\s+)?auditor|city\s+auditor|"
    r"inspector\s+general)\b|\b(?:audit\s+services|auditor'?s\s+office)\b.*)$",
    re.IGNORECASE,
)

_MONTHS = (
    r"(?:january|february|march|april|may|june|july|august|september|"
    r"october|november|december)"
)

# Page furniture that appears on every page and never names the document.
# Anchored to the whole line: a real title may *start* with a date, as in
# "March 31, 2023 2022 Annual Report", so prefix matches are not enough.
_FURNITURE_RE = re.compile(
    r"^(?:"
    r"page\s*\d+(?:\s*(?:of|/)\s*\d+)?"
    r"|\d+\s*(?:of|/)\s*\d+"
    r"|appendix\s+[a-z](?:\s*[.:)\u2014-]|\s|$).*"
    rf"|\d{{1,2}}\s+{_MONTHS}\s+\d{{4}}"
    rf"|{_MONTHS}\s+\d{{1,2}},\s+\d{{4}}"
    rf"|{_MONTHS}\s+\d{{4}}"
    r"|date\s*:.*"
    r"|re\s*:.*"
    r"|memo\b.*"
    r"|to\s*:.*"
    r"|from\s*:.*"
    r"|councilmember\b.*"
    r"|table\s+of\s+contents.*"
    r"|contents"
    r"|introduction"
    r")$",
    re.IGNORECASE,
)

# ``First / second`` in a two-word line is an explicit title line break, which
# PDF text extraction turns into a newline. Other lines are separate blocks.
_EXPLICIT_BREAK_RE = re.compile(r"\s+/\s+")

# A title cut by a page or text-extraction boundary is not a title. A trailing
# function word, a dangling colon or dash, or a possessive all mark a cut.
_TRUNCATED_TITLE_RE = re.compile(
    r"(?:\b(?:of|and|the|for|in|on|to|with|from|by|at|an|a|is|are|was|were)\s*$"
    r"|[:;,\-\u2013\u2014]\s*$|['\u2019]s\s*$)",
    re.IGNORECASE,
)

# Leading marks left by PDF text extraction on a heading line.
_LEADING_MARK_RE = re.compile(r"^[\s^•\u2022\u00b7|>→»\-–—]+\s*")

# Contact details and URLs are page furniture.
_URLISH_RE = re.compile(r"(?:https?://|www\.|@)", re.IGNORECASE)

# Letterhead blocks repeat the publisher's phone, street address, PO box, and
# city/state/ZIP above the report name, especially on memoranda.
_LETTERHEAD_RE = re.compile(
    r"^(?:\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}"
    r"|p\.?\s*o\.?\s+box\b.*"
    r"|\d+\s+[A-Z][\w.]*(?:\s+[A-Z][\w.]*)*\s+"
    r"(?:avenue|ave|street|st|boulevard|blvd|road|rd|drive|dr|way|place|pl|"
    r"suite|ste|floor|fl)\b.*"
    r"|[A-Z][\w.]+(?:\s+[A-Z][\w.]+)*,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)"
    r"\s+\d{5}(?:-\d{4})?"
    r"|m\s*e\s*m\s*o\s*r\s*a\s*n\s*d\s*u\s*m"
    r"|memorandum)",
    re.IGNORECASE,
)

# Words that mark a line as the document's own name.
_TITLE_KEYWORD_RE = re.compile(
    r"\b(?:audit|report|evaluation|review|findings|assessment|examination|"
    r"inspection|study|analysis|follow[- ]?up)\b",
    re.IGNORECASE,
)


def _normalize(text):
    """Collapses whitespace so candidates compare and store predictably."""
    return _WHITESPACE_RE.sub(" ", text or "").strip()


def _clip(text):
    """Truncates on a word boundary, leaving an ellipsis when it cuts."""
    text = _TRAILING_PAGE_MARK_RE.sub("", _normalize(text)).strip(" |·•-–—")
    if len(text) <= MAX_TITLE_LENGTH:
        return text
    clipped = text[: MAX_TITLE_LENGTH - 1]
    if " " in clipped:
        clipped = clipped[: clipped.rindex(" ")]
    return clipped.rstrip(" ,;:-–—") + "…"


def _is_usable(title):
    """True when `title` reads as a name rather than a hash or placeholder."""
    if not title:
        return False

    title = _normalize(title)
    words = title.split()

    rejected = (
        not MIN_TITLE_LENGTH <= len(title) <= MAX_TITLE_LENGTH,
        title.lower() in _JUNK_TITLES,
        title.lower().startswith(_JUNK_PREFIXES),
        bool(_HEX_HASH_RE.search(title)),
        bool(_FURNITURE_RE.match(title)),
        bool(_LETTERHEAD_RE.match(title)),
        bool(_ADDRESS_SEPARATOR_RE.search(title)),
        bool(_TRUNCATED_TITLE_RE.search(title)),
        # A sentence is prose from the opening paragraph, not a heading.
        bool(_SENTENCE_RE.search(title)) and len(title) > _PROSE_LENGTH,
        # Publisher names are only rejected when they stand alone. A longer
        # line that mentions the publisher is a real title, e.g. "Status Report
        # on Implementation of Office of City Auditor Recommendations".
        bool(_BRANDING_RE.match(title)) and len(words) <= 6,
        # An organization name alone names the publisher, not the document.
        len(words) <= 8
        and bool(_ORGANIZATION_RE.search(title))
        and not _TITLE_KEYWORD_RE.search(title),
        # Require enough letters that a code, date, or numeric ID is rejected
        # while real titles containing digits still pass.
        sum(character.isalpha() for character in title) < 6,
    )
    return not any(rejected)


def _clean_metadata_title(metadata_title):
    """Strips Office wrappers and extensions from an embedded PDF title."""
    title = _normalize(metadata_title)
    if not title:
        return None

    previous = None
    while previous != title:
        previous = title
        title = _OFFICE_PREFIX_RE.sub("", title)
        title = _EXTENSION_RE.sub("", title)
        title = title.strip(" -–—:")

    return _normalize(title) or None


def _masthead_lines(first_page_text, limit=12):
    """The first few substantive lines of page 1, with furniture removed.

    The limit is generous because a memorandum's letterhead can occupy the top
    half of the page before the document's own name appears.
    """
    lines = []
    for raw in (first_page_text or "").splitlines():
        line = _normalize(_LEADING_MARK_RE.sub("", raw))
        if len(line) < 3:
            continue
        if _DATE_OR_NUMBER_RE.match(line):
            continue
        if _URLISH_RE.search(line):
            continue
        if _ROLE_LINE_RE.search(line):
            continue
        if _FURNITURE_RE.match(line):
            continue
        if _LETTERHEAD_RE.match(line):
            continue
        lines.append(line)
        if len(lines) >= limit:
            break
    return lines


def _collapse_heading(line):
    """Shortens an HTML heading run to the sentence that names the document.

    Reports exported from a CMS sometimes emit the whole page heading block,
    with section titles and recommendations run together. The first sentence is
    the report's own name; the rest belongs in the body.
    """
    if len(line.split()) <= 14:
        return line

    sentences = _SENTENCE_SPLIT_RE.split(line)
    if len(sentences) > 1:
        first = _normalize(sentences[0]).rstrip(".")
        if len(first.split()) >= 4:
            return first
    return line


def _looks_like_heading(line):
    """True when `line` names a document rather than a publisher or chapter."""
    return bool(_TITLE_KEYWORD_RE.search(line)) or not _ORGANIZATION_RE.search(line)


def _merge_wrapped_title(lines):
    """Joins a title line with following lines until it stops looking cut.

    Sets the title over several lines, so the first line often ends mid-phrase
    ("Status Report on Implementation of"). Appending the continuation lines
    restores the whole title; each line is checked so unrelated blocks are not
    swallowed.
    """
    title = lines[0]
    for follow in lines[1:4]:
        if not _TRUNCATED_TITLE_RE.search(title):
            break
        if not _looks_like_heading(follow):
            break
        if len(f"{title} {follow}") > MAX_TITLE_LENGTH:
            break
        title = f"{title} {follow}"
    return title


def title_from_page_text(first_page_text):
    """Best-effort title from the masthead at the top of page 1.

    A line naming the document kind ("... Audit Report") wins on its own. When
    the first line names the subject and the next line continues it, they are
    joined, because reports commonly set the title over several lines and PDF
    text extraction splits it.

    Publisher branding such as "Seattle Office of City Auditor" is skipped when
    looking for the title, but a continuation line may still mention it, so it
    is not removed from the masthead outright. Returns `None` when nothing on
    the page reads as a title.
    """
    lines = _masthead_lines(first_page_text)
    if not lines:
        return None

    start = next(
        (index for index, line in enumerate(lines) if not _BRANDING_RE.match(line)),
        None,
    )
    if start is None:
        return None

    first = lines[start]
    rest = lines[start + 1:]

    if _TITLE_KEYWORD_RE.search(first) and not _TRUNCATED_TITLE_RE.search(first):
        title = _collapse_heading(first)
    else:
        merged = _merge_wrapped_title([first, *rest])
        title = _collapse_heading(merged) if merged != first else None

        for follow in rest[:2]:
            if title is not None:
                break
            combined = f"{first} {follow}"
            if len(combined) > MAX_TITLE_LENGTH:
                continue
            if _TITLE_KEYWORD_RE.search(follow) or (
                _looks_like_heading(first) and _looks_like_heading(follow)
            ):
                title = _collapse_heading(combined)

        if title is None:
            title = _collapse_heading(first)

    title = _clip(title)
    return title if _is_usable(title) else None


def _prettify_filename(name):
    """Turns a filename into a readable label; used only as a last resort."""
    name = _EXTENSION_RE.sub("", name or "")
    name = _EXPLICIT_BREAK_RE.sub(" ", name)
    name = _normalize(name.replace("_", " ").replace("-", " "))
    name = _normalize(_CAMEL_RE.sub(" ", name))
    return name or None


def title_from_url(audit_url):
    """Title from the PDF's filename inside its source URL."""
    if not audit_url:
        return None
    return _prettify_filename(unquote(Path(urlsplit(audit_url).path).name))


def title_from_file_name(file_name):
    """Title from a local filename, for callers with no source URL."""
    if not file_name:
        return None
    return _prettify_filename(Path(file_name).name)


def derive_title(
    metadata_title=None,
    first_page_text=None,
    audit_url=None,
    file_name=None,
):
    """Applies the metadata -> page text -> URL filename chain.

    Returns the first candidate that passes :func:`_is_usable`. When none does,
    the source URL's filename is preferred as the least-bad label, since it at
    least identifies the specific report; a report is never stored under a
    content hash when anything else is available.
    """
    page_title = title_from_page_text(first_page_text)
    url_title = title_from_url(audit_url) or title_from_file_name(file_name)

    for candidate in (
        _clean_metadata_title(metadata_title),
        page_title,
        url_title,
    ):
        if _is_usable(candidate):
            return candidate

    # Last resort: prefer a label that still identifies the report, but never
    # the content hash Scrapy used as the download filename.
    for fallback in (url_title, page_title, _clean_metadata_title(metadata_title)):
        if fallback and not _HEX_HASH_RE.search(fallback):
            return _clip(fallback)

    return "Untitled report"
