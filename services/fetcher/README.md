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

## Risk levels

`audit_headers.risk_level` is
`ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NULL`. The fetcher used to
hardcode `INFO`, so the homepage chart had one series and the chip on every row
was identical.

`fetcher/ai/classify.py` now assigns the level in the same request that writes
the summary, so classification costs no extra model call. It is told to judge
the **most serious finding the report substantiates**, not the number of
findings or the sensitivity of the subject — a report on a sensitive topic that
found nothing wrong is `INFO`. The reply is validated against the enum;
anything unparseable becomes `NULL` ("Not rated") rather than being coerced to a
level the report did not earn.

## Scan progress and resumability

A crawl reports progress to `schedules` so the UI can show it while the run is
in flight (`fetcher/progress.py`): the total once the index is parsed, then a
running count of downloads and of committed reports. A progress write never
fails a scan.

`fetches.status` distinguishes `DOWNLOADED` from `PROCESSED`. Only `PROCESSED`
suppresses a re-download, so a crawl killed mid-processing resumes: finished
reports are skipped, unfinished ones keep their file (Scrapy's `FILES_STORE`
cache) and are processed on the next pass instead of being silently dropped.

A batch is processed per report, not per download set. If one PDF out of two
hundred fails to download, the other 199 are still processed and the shortfall is
logged with the failed URLs. Previously a single failure discarded the whole
batch. The crawl still exits non-zero on download failures, so the run is
reported as failed and retried; the failed URLs have no `PROCESSED` receipt, so
`new_files()` re-queues exactly those.

## Backfilling existing titles

Rows written before these fixes hold the download hash in `audit_headers.title`,
the crawl time in `audit_headers.audit_date`, and a hardcoded `INFO` in
`audit_headers.risk_level`. `scripts/backfill_titles.py` repairs them all:
titles that fail the usability check, dates that still equal `created_at`, and
risk levels when `--risk` is passed.

```sh
# preview, without writing
uv run python scripts/backfill_titles.py --dry-run

# repair unusable titles and crawl-time dates
uv run python scripts/backfill_titles.py

# also re-classify risk levels (one model call per row, ~8s each)
uv run python scripts/backfill_titles.py --risk

# re-derive every row, e.g. after changing the rules
uv run python scripts/backfill_titles.py --force --risk
```

Classification is opt-in because it needs `LLM_API_URL`, `LLM_API_KEY`, and one
request per report — roughly 11 minutes for 84 rows.

It matches each row to its downloaded PDF using `sha1(audit_url)`, which is how
Scrapy names the file. Run it where the downloads and `MYSQL_ROOT_PASSWORD` are
available (inside the `services` container), and set `FILES_STORE` if the store
is not at `/services/fetcher/files`.
