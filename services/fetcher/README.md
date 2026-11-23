# Fetcher: Scrapy

This is the root folder for the scrapy.

## Report titles

Scrapy stores each download under a content-hashed filename
(`files/<spider>/full/<sha1>.pdf`), so the file on disk never carries the
report's name. `fetcher/ai/title.py` derives a readable title from the best
available source, in order:

1. The PDF's embedded `title` metadata, with Office save wrappers such as
   `Microsoft Word - ` removed.
2. The masthead at the top of page 1, skipping letterhead, dates, page
   furniture, addressee blocks, and the auditor's own office name.
3. The PDF's filename inside the report's source URL.

Candidates are validated before use: content hashes, placeholder titles
(`Untitled`, `Table of Contents`), publisher names standing alone, and titles
cut mid-phrase are rejected, so the next source is tried. A report is never
stored under a hash.

Tests:

```sh
cd services/fetcher
uv run python -m unittest discover -s tests -v
```

## Publication dates

`audit_headers.audit_date` holds the report's publication date, while
`created_at` holds the crawl time. The fetcher used to write `UTC_TIMESTAMP()`
to both, so every report looked published on the day it was scanned.

`fetcher/ai/publish_date.py` derives the real value:

1. A date on page 1, in any of `April 16, 2020`, `16 April 2020`,
   `2020-04-16`, `MARCH 2023`, or a month wrapped onto its own line followed by
   the year. A full date with a day is preferred over month-and-year.
2. The PDF's `CreationDate` metadata, which is file creation rather than
   publication and therefore only a fallback.
3. The crawl time, when the PDF states no date, so the `NOT NULL` column stays
   populated.

## Backfilling existing titles

Rows written before the title chain existed hold the download hash in
`audit_headers.title`, and rows written before the date fix hold the crawl time
in `audit_headers.audit_date`. `scripts/backfill_titles.py` repairs both:
titles that fail the usability check, and dates that still equal `created_at`.

```sh
# preview, without writing
uv run python scripts/backfill_titles.py --dry-run

# repair unusable titles and crawl-time dates
uv run python scripts/backfill_titles.py

# re-derive every row, e.g. after changing the rules
uv run python scripts/backfill_titles.py --force
```

It matches each row to its downloaded PDF using `sha1(audit_url)`, which is how
Scrapy names the file. Run it where the downloads and `MYSQL_ROOT_PASSWORD` are
available (inside the `services` container), and set `FILES_STORE` if the store
is not at `/services/fetcher/files`.
