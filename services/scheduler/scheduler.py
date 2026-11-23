"""UTC timing for registered audit-source scans."""

import calendar
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

#: Values of `schedules.scan_status`. Only `ACTIVE` schedules are scanned.
STATUS_ACTIVE = "ACTIVE"
STATUS_UNSUPPORTED = "UNSUPPORTED"
STATUS_DISABLED = "DISABLED"


@dataclass
class Schedule:
    schedule_id: int
    source_link: str
    scan_frequency: str
    next_run_at: datetime | None
    # Defaulted so existing constructions with four positional arguments (and
    # the scheduler tests) keep working. A schedule whose source no spider can
    # handle is parked as `UNSUPPORTED` rather than retried forever.
    scan_status: str = STATUS_ACTIVE


def is_due(next_run_at: datetime | None, now: datetime) -> bool:
    # A schedule with no first-run time has never been scheduled: scan it on the
    # next worker pass. A *parked* schedule is excluded by `get_due_schedules`
    # through `scan_status`, not through this timestamp.
    return next_run_at is None or next_run_at <= now


def get_due_schedules(schedules: list[Schedule], now: datetime) -> list[Schedule]:
    return [
        s
        for s in schedules
        if s.scan_status == STATUS_ACTIVE
        and s.scan_frequency != "ARCHIVE"
        and is_due(s.next_run_at, now)
    ]


def _parked_next_run(schedule: Schedule, now: datetime) -> datetime:
    """A future `next_run_at` for a parked schedule.

    The column is `NOT NULL` in the deployed schema, so parking cannot write
    NULL. Pushing the timestamp out by a year keeps the row valid and keeps any
    external reader from showing it as overdue; re-enabling recomputes the real
    time.
    """
    return now + timedelta(days=365)


def calculate_next_run(
    next_run_at: datetime, now: datetime, frequency: str
) -> datetime:
    """Skip missed slots; monthly means calendar months, clamped at month end."""
    intervals = {
        "HOURLY": timedelta(hours=1),
        "DAILY": timedelta(days=1),
        "WEEKLY": timedelta(weeks=1),
    }
    if frequency not in (*intervals, "MONTHLY"):
        raise ValueError(f"Unsupported frequency: {frequency}")
    if next_run_at > now:
        return next_run_at
    if frequency != "MONTHLY":
        interval = intervals[frequency]
        return next_run_at + ((now - next_run_at) // interval + 1) * interval
    months = max(1, (now.year - next_run_at.year) * 12 + now.month - next_run_at.month)
    while True:
        year, month0 = divmod(
            next_run_at.year * 12 + next_run_at.month - 1 + months, 12
        )
        candidate = next_run_at.replace(
            year=year,
            month=month0 + 1,
            day=min(next_run_at.day, calendar.monthrange(year, month0 + 1)[1]),
        )
        if candidate > now:
            return candidate
        months += 1


def trigger_due_scans(
    schedules: list[Schedule],
    now: datetime,
    trigger_scan: Callable[[Schedule], None],
    save_next_run: Callable[[int, datetime], None] | None = None,
    save_result: Callable[[int, datetime, str, datetime], None] | None = None,
    clock: Callable[[], datetime] | None = None,
    is_unsupported: Callable[[Exception], bool] | None = None,
) -> int:
    """Runs every due scan once, and returns how many failed.

    A transient failure (network, crash, rate limit) is retried in five minutes
    so the source is not abandoned. An *unsupported* source is terminal: no
    spider can ever handle that URL, so retrying it forever only floods the log
    and keeps a 5-minute timer running. Those are parked instead, by setting
    `next_run_at` to NULL, which `get_due_schedules` treats as not due.

    `is_unsupported` lets the scheduler recognise the terminal failure without
    importing the fetcher (and its Scrapy dependency) into this module.
    """
    failures = 0
    for schedule in get_due_schedules(schedules, now):
        started_at = clock() if clock else now
        try:
            next_run = calculate_next_run(
                schedule.next_run_at or started_at, started_at, schedule.scan_frequency
            )
            trigger_scan(schedule)
            next_run = calculate_next_run(
                schedule.next_run_at or started_at,
                clock() if clock else now,
                schedule.scan_frequency,
            )
        except Exception as error:  # pylint: disable=broad-except
            failures += 1
            logger.exception("Failed to process schedule %s", schedule.schedule_id)

            if is_unsupported and is_unsupported(error):
                # Terminal: park the schedule so it is never retried. The
                # `scan_status` flag is what excludes it, because a NULL
                # `next_run_at` means "never scheduled" and would otherwise look
                # perpetually due.
                logger.error(
                    "Disabling schedule %s: its source is not supported",
                    schedule.schedule_id,
                )
                if save_result:
                    save_result(
                        schedule.schedule_id,
                        started_at,
                        STATUS_UNSUPPORTED,
                        _parked_next_run(schedule, started_at),
                    )
                schedule.scan_status = STATUS_UNSUPPORTED
                continue

            # Transient: retry shortly rather than marking the crawl successful.
            if save_result:
                retry_at = (clock() if clock else now) + timedelta(minutes=5)
                save_result(schedule.schedule_id, started_at, "ERROR", retry_at)
                schedule.next_run_at = retry_at
            continue
        # Persistence failures must stop this pass rather than silently repeat work.
        if save_result:
            save_result(schedule.schedule_id, started_at, "SUCCESS", next_run)
        if save_next_run:
            save_next_run(schedule.schedule_id, next_run)
        schedule.next_run_at = next_run
    return failures
