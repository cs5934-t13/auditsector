"""Backfill readable titles and publication dates for existing audit rows.

Scrapy names each download after ``sha1(url)``, and older rows stored that hash
in ``audit_headers.title``. The fetcher also wrote the crawl time into
``audit_headers.audit_date``, so it carried no publication information.

This finds the downloaded PDF for each row and re-derives both values with the
same helpers the fetcher uses. Titles are only rewritten when unusable (see
``--force`` to rewrite all), and dates only when they still equal
``created_at``, which is the signature of the old behaviour.

Run inside the services container, which has the downloads mounted::

    PYTHONPATH=/services/fetcher MYSQL_ROOT_PASSWORD=... \\
        python /services/fetcher/scripts/backfill_titles.py [--dry-run] [--force]

The store defaults to ``/services/fetcher/files``; override with ``FILES_STORE``.
"""

import argparse
import hashlib
import os
import pathlib
import sys

import pymupdf

from fetcher.ai.publish_date import derive_publish_date
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


def resolve(row, store):
    """The readable title and publication date for one row.

    Returns `(title, publish_date)`, with either element `None` when the PDF is
    missing or does not state a date.
    """
    path = candidate_paths(store, row["muni"] or "", row["audit_url"])
    if path is None:
        return None, None

    with pymupdf.open(path) as doc:
        metadata = doc.metadata or {}
        first_page_text = doc[0].get_text() if len(doc) else ""

    title = derive_title(
        metadata_title=metadata.get("title"),
        first_page_text=first_page_text,
        audit_url=row["audit_url"],
        file_name=path.name,
    )
    publish_date = derive_publish_date(
        first_page_text=first_page_text,
        metadata_creation_date=metadata.get("creationDate"),
    )
    return title, publish_date


def _date_is_crawl_time(row):
    """True when `audit_date` still holds the crawl time, not a publication date.

    The old insert wrote `UTC_TIMESTAMP()` to both columns, so a zero difference
    means the row predates the publication-date fix and is safe to correct.
    """
    audit_date = row.get("audit_date")
    created_at = row.get("created_at")
    if audit_date is None or created_at is None:
        return False
    return audit_date == created_at


def _plan_updates(row, store, force):
    """The column updates for one row, or `(None, error)` when its PDF is gone.

    Returns `({}, None)` when the row is already correct, and `(None, message)`
    when the download is missing, so the caller can report either case.
    """
    title = row["title"] or ""
    needs_title = force or not _is_usable(title)
    needs_date = force or _date_is_crawl_time(row)

    if not needs_title and not needs_date:
        return {}, None

    new_title, new_date = resolve(row, store)
    if new_title is None:
        return None, f"no file for {row['audit_id']}: {row['audit_url']}"

    updates = {}
    if needs_title and new_title != title:
        updates["title"] = new_title
        print(f"  title {title[:18]!r} -> {new_title[:60]!r}")
    if needs_date and new_date is not None and new_date != row["audit_date"].date():
        updates["audit_date"] = new_date
        print(f"  date  {row['audit_date'].date()} -> {new_date} ({new_title[:50]!r})")
    return updates, None


def backfill(dry_run=False, store=DEFAULT_STORE, force=False):
    """Repairs titles and publication dates, and reports how many changed.

    Titles are re-derived when unusable, or for every row with `force`.
    Publication dates are re-derived when they still equal `created_at`, so an
    already-correct date is never overwritten by a worse guess.
    """
    store = pathlib.Path(store)
    changed = {"title": 0, "audit_date": 0}
    skipped = missing = 0

    with connect_db() as conn, conn.cursor() as cur:
        # `muni` holds the spider id for rows written by this fetcher.
        cur.execute(
            """
            SELECT audit_id, title, audit_date, created_at, audit_url, muni
            FROM audit_headers
            WHERE audit_url IS NOT NULL AND audit_url <> ''
            """
        )
        rows = cur.fetchall()

        for row in rows:
            updates, error = _plan_updates(row, store, force)
            if error:
                missing += 1
                print(f"  {error}")
                continue
            if not updates:
                skipped += 1
                continue

            for column in updates:
                changed[column] += 1

            if not dry_run:
                assignments = ", ".join(f"{column} = %s" for column in updates)
                cur.execute(
                    f"UPDATE audit_headers SET {assignments} WHERE audit_id = %s",
                    (*updates.values(), row["audit_id"]),
                )

        if not dry_run:
            conn.commit()

    print(
        f"rows={len(rows)} titles_updated={changed['title']} "
        f"dates_updated={changed['audit_date']} unchanged={skipped} "
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
