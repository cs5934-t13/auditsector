"""Backfill readable titles for audit rows stored under hashed filenames.

Scrapy names each download after ``sha1(url)``, and older rows stored that hash
in ``audit_headers.title``. This finds the downloaded PDF for each unreadable
title, runs the same title chain the fetcher now uses, and updates the row.

Only titles that fail the usability check are touched, so re-running is safe and
a hand-edited or already-correct title is left alone.

Run inside the services container, which has the downloads mounted:

    PYTHONPATH=/services/fetcher MYSQL_ROOT_PASSWORD=... \\
        python /services/fetcher/scripts/backfill_titles.py [--dry-run]

The store defaults to ``/services/fetcher/files``; override with ``FILES_STORE``.
"""

import argparse
import hashlib
import os
import pathlib
import sys

import pymupdf

from fetcher.ai.title import _is_usable, derive_title
from fetcher.storage import connect_db

DEFAULT_STORE = "/services/fetcher/files"


def candidate_paths(store, spider_id, audit_url):
    """Where Scrapy may have stored the PDF for `audit_url`.

    ``FilesPipeline`` writes ``<FILES_STORE>/full/<sha1>``, the spider's
    ``custom_settings`` may move ``FILES_STORE`` under a per-spider folder, and
    the original name is kept only for some storage backends, so every shape is
    tried before giving up.
    """
    digest = hashlib.sha1(audit_url.encode()).hexdigest()
    name = pathlib.PurePosixPath(audit_url.split("?", 1)[0]).name
    for folder in (store, store / spider_id, store / spider_id / "full", store / "full"):
        for filename in (digest, f"{digest}.pdf", name):
            path = folder / filename
            if path.is_file():
                return path
    return None


def resolve_title(row, store):
    """The readable title for one row, or `None` when its PDF is missing."""
    path = candidate_paths(store, row["muni"] or "", row["audit_url"])
    if path is None:
        return None

    with pymupdf.open(path) as doc:
        metadata_title = (doc.metadata or {}).get("title")
        first_page_text = doc[0].get_text() if len(doc) else ""

    return derive_title(
        metadata_title=metadata_title,
        first_page_text=first_page_text,
        audit_url=row["audit_url"],
        file_name=path.name,
    )


def backfill(dry_run=False, store=DEFAULT_STORE, force=False):
    """Updates unreadable titles and reports how many rows changed.

    With `force`, every row is re-derived instead of only the unusable ones.
    That refreshes titles produced by an older rule set, such as hashes or
    headings with a trailing page marker.
    """
    store = pathlib.Path(store)
    updated = skipped = missing = 0

    with connect_db() as conn, conn.cursor() as cur:
        # `muni` holds the spider id for rows written by this fetcher.
        cur.execute(
            """
            SELECT audit_id, title, audit_url, muni
            FROM audit_headers
            WHERE audit_url IS NOT NULL AND audit_url <> ''
            """
        )
        rows = cur.fetchall()

        for row in rows:
            title = row["title"] or ""
            if not force and _is_usable(title):
                skipped += 1
                continue

            new_title = resolve_title(row, store)
            if new_title is None:
                missing += 1
                print(f"  no file for {row['audit_id']}: {row['audit_url']}")
                continue

            if new_title == title:
                skipped += 1
                continue

            if not dry_run:
                cur.execute(
                    "UPDATE audit_headers SET title = %s WHERE audit_id = %s",
                    (new_title, row["audit_id"]),
                )
            updated += 1
            print(f"  {title[:20]!r} -> {new_title[:70]!r}")

        if not dry_run:
            conn.commit()

    print(
        f"rows={len(rows)} updated={updated} already_ok={skipped} "
        f"no_file={missing} dry_run={dry_run} force={force}"
    )
    return 0 if missing == 0 else 1


def main(argv=None):
    """Command-line entry point."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report the new titles without writing them",
    )
    parser.add_argument(
        "--store",
        default=os.environ.get("FILES_STORE", DEFAULT_STORE),
        help=f"Scrapy download root (default {DEFAULT_STORE})",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-derive every title, not only the unusable ones",
    )
    args = parser.parse_args(argv)
    return backfill(dry_run=args.dry_run, store=args.store, force=args.force)


if __name__ == "__main__":
    sys.exit(main())
