# Scheduler (AW-98)

The existing services container runs `python -m services.scheduler` through uv.
It checks saved sources every 60 seconds, sequentially, and launches the matching
Scrapy spider in a child process. Supported collection pages are listed in
`services/sample_pages.csv`; each has a site-specific spider and download directory.
Unsupported collections report an error; this is not a generic website crawler.

- New sources with no next-run time run on the next pass. ARCHIVE never runs.
- HOURLY/DAILY/WEEKLY preserve their slots; missed slots produce one scan.
- MONTHLY advances calendar months, clamping the stored day at month end.
- Times are UTC. Run start, SUCCESS/ERROR, and next time are saved together.
- Failed scans retry after five minutes. A MySQL lock prevents overlapping passes.
- A source no spider supports is **parked**, not retried: `scan_status` becomes
  `UNSUPPORTED`, `last_run_status` records `ERROR`, and the worker never picks it
  up again. Retrying a permanently unsupported URL only floods the log. Clear it
  with `DELETE /schedules/<id>` (admin) or by registering a supported URL.
- Reports use the real schedule ID. A receipt is committed with each saved report;
  failed downloads/processing remain retryable. Repeated scans skip saved URLs.
- Scrapy errors and pipeline errors make the child process fail, not just print logs.

Before running against an older database, back it up and stop the worker. Run
`data/migrations/scheduler_fetcher.py` to inspect the upgrade, then use `--apply`.
It preserves IDs/records, refuses orphan reports, duplicate receipts, or unresolved
legacy download records, and seeds
missing predefined tags. MySQL DDL is not transactional: keep the backup.

Build: `podman build -f services/Containerfile -t services .`. The worker needs MYSQL_ROOT_PASSWORD,
LLM_API_URL, and LLM_API_KEY from the existing Podman secrets configuration.
`--once` runs one pass; `--poll-seconds` changes polling, not saved frequencies.
Run unit tests in the image with `uv run --no-sync python -m unittest discover
-s /services/scheduler -p 'test_*.py'`. Integration tests use a disposable database.

Existing pipeline limitations remain: only the current spider selectors are
supported. Report titles, publication dates, and risk levels are now derived from
the PDF by the fetcher (`fetcher/ai/`); see its README for the fallback chains and
the backfill script for repairing older rows.
