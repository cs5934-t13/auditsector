"""Launch existing, explicitly supported Scrapy spiders in separate processes.

Which URLs are supported lives in ``supported_sources.py`` at the repository root,
shared with the web tier so the UI cannot drift from what the worker can scan.
"""

import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

import supported_sources

FETCHER_ROOT = Path(__file__).resolve().parents[1] / "fetcher"

#: Prefix the crawler writes to stderr when it fails. Keep in step with
#: ``fetcher/crawl.py``.
FAILURE_PREFIX = "SCAN_FAILURE: "

#: How long one crawl may run. A large archive (200+ PDFs, each needing two AI
#: calls at ~8s) legitimately takes tens of minutes; at 900s the crawl was killed
#: before its processing phase, so the source could never finish. Progress is
#: resumable now, and this ceiling is generous enough for one full archive.
SCAN_TIMEOUT_SECONDS = 60 * 60

#: Failure codes. A code lets the UI explain the problem in its own words, while
#: the message carries the detail an administrator needs.
CODE_UNSUPPORTED = "UNSUPPORTED_SOURCE"
CODE_UNREADABLE = "SOURCE_UNREADABLE"
CODE_TIMEOUT = "SCAN_TIMEOUT"
CODE_FAILED = "SCAN_FAILED"


class ScanFailure(ValueError):
    """A scan failure with a code the UI can translate and a message it can show.

    `code` is stable and safe to switch on; `message` is human-readable detail.
    `retryable` says whether trying again could plausibly help: a timeout might,
    an unsupported URL never will.
    """

    def __init__(self, code, message, retryable=True):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


class UnsupportedSource(ScanFailure):
    """The source URL cannot be handled by any spider.

    Permanent: the URL will never become supported by being retried, so the
    scheduler parks the schedule instead of rescheduling it. Subclasses
    `ScanFailure` and `ValueError`, so existing callers catching either work.
    """

    def __init__(self, message="No spider supports this collection URL yet"):
        super().__init__(CODE_UNSUPPORTED, message, retryable=False)


def spider_for_url(source_url):
    """The spider for `source_url`. Raises `UnsupportedSource` when there is none.

    Distinguishes "not a URL at all" from "a URL no spider covers", because the
    two want different advice: fix the address, or use a supported source. The
    registry returns `None` for both, so the shape is checked here.
    """
    try:
        parsed = urlsplit(str(source_url or ""))
        usable = parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except (TypeError, ValueError):
        usable = False

    if not usable:
        raise UnsupportedSource("This address could not be read as a URL")

    spider = supported_sources.spider_for_url(source_url)
    if spider is None:
        raise UnsupportedSource()
    return spider


def _failure_reason(stderr):
    """The crawler's own reason from the child's stderr, or a generic fallback.

    Prefers the structured ``SCAN_FAILURE:`` line. The fallback deliberately
    describes the outcome, not the subprocess: the old message named the
    interpreter path and argv, which is internals, not a reason.
    """
    for line in reversed((stderr or "").splitlines()):
        stripped = line.strip()
        if stripped.startswith(FAILURE_PREFIX):
            return stripped[len(FAILURE_PREFIX):].strip() or None
    return None


def scan(schedule):
    """Run the spider for `schedule` in a child process."""
    spider = spider_for_url(schedule.source_link)
    # No shell; a new process also avoids restarting Scrapy's Twisted reactor.
    try:
        result = subprocess.run(
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
            capture_output=True,
            text=True,
            check=False,
            timeout=SCAN_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as expired:
        raise ScanFailure(
            CODE_TIMEOUT,
            "The scan took too long and was stopped. It will try again.",
        ) from expired

    if result.returncode == 0:
        return

    reason = _failure_reason(result.stderr)
    if reason:
        raise ScanFailure(CODE_UNREADABLE, reason)
    raise ScanFailure(
        CODE_FAILED,
        "The scan failed without reporting a reason. It will try again.",
    )
