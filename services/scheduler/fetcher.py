"""Launch existing, explicitly supported Scrapy spiders in separate processes."""

import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

FETCHER_ROOT = Path(__file__).resolve().parents[1] / "fetcher"


class UnsupportedSource(ValueError):
    """The source URL cannot be handled by any spider.

    This is a permanent condition: the URL will never become supported by being
    retried, so the scheduler disables the schedule instead of rescheduling it.
    It subclasses `ValueError` so existing callers that catch that still work.
    """


def spider_for_url(source_url):
    try:
        url = urlsplit(source_url)
    except (TypeError, ValueError):
        raise UnsupportedSource("Source URL could not be parsed") from None

    if url.scheme not in ("http", "https") or url.username or url.password:
        raise UnsupportedSource("Unsupported collection URL")
    host = (url.hostname or "").lower()
    if (
        host in ("www.seattle.gov", "seattle.gov")
        and url.path.rstrip("/") == "/city-auditor/reports"
    ):
        return "seattle_wa"
    if host == "efiles.portlandoregon.gov" and (
        url.path == "/record" or url.path.startswith("/record/")
    ):
        return "portland_or"
    raise UnsupportedSource("No spider supports this collection URL yet")


def scan(schedule):
    spider = spider_for_url(schedule.source_link)
    # No shell; a new process also avoids restarting Scrapy's Twisted reactor.
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fetcher.crawl",
            "--spider",
            spider,
            "--source",
            schedule.source_link,
            "--schedule-id",
            str(schedule.schedule_id),
        ],
        cwd=FETCHER_ROOT,
        check=True,
        timeout=900,
    )
