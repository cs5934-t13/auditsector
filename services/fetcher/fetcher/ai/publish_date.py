"""Derive a report's publication date from the PDF itself.

``audit_headers.audit_date`` is meant to be when the report was published, but
the fetcher used to store ``UTC_TIMESTAMP()`` there, making it identical to
``created_at`` (the crawl time). This module supplies the real value.

Page 1 almost always carries the publication date in its masthead, in one of a
few shapes::

    April 16, 2020
    16 April 2020
    MARCH 2023
    December
    2022

The masthead is read first because body text mentions *other* dates (evaluation
periods, earlier reports). A full date with a day is preferred over a
month-and-year, and within each shape the earliest match wins, because a cover
date precedes later references.

When page 1 has no date, the PDF's ``CreationDate`` metadata is used. That is
the file's creation time rather than the publication date, so it is a fallback
and not a preference. Callers pass their own fallback (crawl time) when nothing
is found, so the column's ``NOT NULL`` constraint always holds.
"""

import re
from datetime import date, datetime, timezone

#: Reports older than this predate the corpora these spiders collect; a match
#: outside the window is a misread (a page number, an ID) rather than a date.
MIN_YEAR = 1990

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

_MONTH_PATTERN = (
    r"(?P<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
    r"jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|"
    r"nov(?:ember)?|dec(?:ember)?)"
)

#: Year part. Numeric groups are referenced by index, so this is written out
#: rather than shared: `_MONTH_PATTERN` already owns the name `month`, and two
#: named groups with the same name in one pattern is not allowed.
_YEAR = r"((?:19|20)\d{2})"

# "April 16, 2020", "April 16th 2020"
_MONTH_DAY_YEAR_RE = re.compile(
    rf"\b{_MONTH_PATTERN}\.?\s+(?P<day>\d{{1,2}})(?:st|nd|rd|th)?,?\s+(?P<year>{_YEAR})\b",
    re.IGNORECASE,
)

# "16 April 2020"
_DAY_MONTH_YEAR_RE = re.compile(
    rf"\b(?P<day>\d{{1,2}})(?:st|nd|rd|th)?\s+{_MONTH_PATTERN}\.?,?\s+(?P<year>{_YEAR})\b",
    re.IGNORECASE,
)

# "2020-04-16"
_ISO_RE = re.compile(
    r"\b(?P<year>(?:19|20)\d{2})-(?P<month>\d{1,2})-(?P<day>\d{1,2})\b"
)

# "MARCH 2023"
_MONTH_YEAR_RE = re.compile(
    rf"\b{_MONTH_PATTERN}\.?\s+(?P<year>{_YEAR})\b", re.IGNORECASE
)

#: PDF metadata writes ``D:20200414125318-07'00'``.
_PDF_DATE_RE = re.compile(r"D:(\d{4})(\d{2})(\d{2})")

_WHITESPACE_RE = re.compile(r"\s+")

#: Masthead depth. The cover block is at the top; body prose follows.
_MASTHEAD_LINES = 15


def _normalize(text):
    """Collapses all whitespace, so "December\\n2022" reads as one phrase."""
    return _WHITESPACE_RE.sub(" ", text or "").strip()


def _month_number(name):
    """Month number for a full or abbreviated month name."""
    return _MONTHS[name[:3].lower()]


def _max_year():
    """One year beyond the current one, to tolerate release-date drift."""
    return datetime.now(timezone.utc).year + 1


def _candidate(year, month, day):
    """A validated `date`, or `None` when any part is out of range.

    Every parser funnels through here so a malformed match (31 February, a year
    read from a page number) is discarded instead of raising.
    """
    try:
        candidate = date(year=int(year), month=int(month), day=int(day))
    except (TypeError, ValueError):
        return None
    return candidate if MIN_YEAR <= candidate.year <= _max_year() else None


def _early(pattern, parts, text):
    """Earliest match of `pattern` in `text`, ordered by position.

    `parts` maps a match to ``(year, month, day)``. Position ordering is used
    because a cover date precedes later references to other dates in the
    masthead, and chronological ordering would pick the older reference.
    """
    found = []
    for match in pattern.finditer(text):
        candidate = _candidate(*parts(match))
        if candidate is not None:
            found.append((match.start(), candidate))
    if not found:
        return None
    return min(found, key=lambda item: item[0])[1]


def _month_day_year_parts(match):
    return match.group("year"), _month_number(match.group("month")), match.group("day")


def _month_year_parts(match):
    return match.group("year"), _month_number(match.group("month")), 1


def _earliest_full_date(text):
    """Earliest date carrying a day, across the supported shapes."""
    for pattern, parts in (
        (_ISO_RE, lambda m: (m.group("year"), m.group("month"), m.group("day"))),
        (_MONTH_DAY_YEAR_RE, _month_day_year_parts),
        (_DAY_MONTH_YEAR_RE, _month_day_year_parts),
    ):
        found = _early(pattern, parts, text)
        if found is not None:
            return found
    return None


def _earliest_month_year(text):
    """Earliest month-and-year, used when no day is stated."""
    return _early(_MONTH_YEAR_RE, _month_year_parts, text)


def _masthead_text(first_page_text):
    """The opening lines of page 1, joined so wrapped dates read as one phrase."""
    lines = [
        _normalize(line)
        for line in (first_page_text or "").splitlines()
        if line.strip()
    ]
    return " ".join(lines[:_MASTHEAD_LINES])


def publish_date_from_page_text(first_page_text):
    """Publication date found on page 1, or `None`."""
    page = _normalize(first_page_text)
    if not page:
        return None

    masthead = _masthead_text(first_page_text)
    for text in (masthead, page):
        found = _earliest_full_date(text) or _earliest_month_year(text)
        if found is not None:
            return found
    return None


def publish_date_from_metadata(metadata_creation_date):
    """Publication date from the PDF's `CreationDate`, or `None`.

    Offset and timezone segments are ignored: scanners and office suites set
    them inconsistently, and the column stores a timezone-free `DATETIME`.
    """
    match = _PDF_DATE_RE.search(metadata_creation_date or "")
    if not match:
        return None

    try:
        candidate = date(
            year=int(match.group(1)),
            month=int(match.group(2)),
            day=int(match.group(3)),
        )
    except ValueError:
        return None

    return candidate if MIN_YEAR <= candidate.year <= _max_year() else None


def derive_publish_date(
    first_page_text=None,
    metadata_creation_date=None,
    fallback=None,
):
    """The best publication date available, or `fallback` when none is found.

    Page 1 wins over file metadata because the masthead states the date the
    publisher chose, while `CreationDate` reflects when the file was produced.
    `fallback` is normally the crawl time, so a report is never stored with a
    null date.
    """
    return (
        publish_date_from_page_text(first_page_text)
        or publish_date_from_metadata(metadata_creation_date)
        or fallback
    )
