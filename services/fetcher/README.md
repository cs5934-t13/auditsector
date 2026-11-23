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

## Backfilling existing titles

Rows written before the title chain existed hold the download hash in
`audit_headers.title`. `scripts/backfill_titles.py` re-derives them:

```sh
# preview, without writing
uv run python scripts/backfill_titles.py --dry-run

# only rows whose title is unusable
uv run python scripts/backfill_titles.py

# re-derive every row, e.g. after changing the rules
uv run python scripts/backfill_titles.py --force
```

It matches each row to its downloaded PDF using `sha1(audit_url)`, which is how
Scrapy names the file. Run it where the downloads and `MYSQL_ROOT_PASSWORD` are
available (inside the `services` container), and set `FILES_STORE` if the store
is not at `/services/fetcher/files`.
