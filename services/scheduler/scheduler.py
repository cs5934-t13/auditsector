"""Timing logic for scheduled audit-source scans."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from collections.abc import Callable


@dataclass
class Schedule:
    """An audit source and its scan schedule."""

    schedule_id: int
    source_link: str
    scan_frequency: str
    next_run_at: datetime | None


def is_due(next_run_at: datetime | None, now: datetime) -> bool:
    """Return whether a schedule with a known run time is due."""
    if next_run_at is None:
        return False

    return next_run_at <= now


def get_due_schedules(
    schedules: list[Schedule],
    now: datetime,
) -> list[Schedule]:
    """Return schedules whose next run time has arrived or passed."""
    return [
        schedule
        for schedule in schedules
        if is_due(schedule.next_run_at, now)
    ]

"""Timing logic for scheduled audit-source scans."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from collections.abc import Callable


@dataclass
class Schedule:
    """An audit source and its scan schedule."""

    schedule_id: int
    source_link: str
    scan_frequency: str
    next_run_at: datetime | None


def is_due(next_run_at: datetime | None, now: datetime) -> bool:
    """Return whether a schedule with a known run time is due."""
    if next_run_at is None:
        return False

    return next_run_at <= now


def get_due_schedules(
    schedules: list[Schedule],
    now: datetime,
) -> list[Schedule]:
    """Return schedules whose next run time has arrived or passed."""
    return [
        schedule
        for schedule in schedules
        if is_due(schedule.next_run_at, now)
    ]

def trigger_due_scans(
    schedules: list[Schedule],
    now: datetime,
    trigger_scan: Callable[[Schedule], None],
) -> None:
    """Trigger due scans and advance their schedules."""
    for schedule in get_due_schedules(schedules, now):
        next_run = calculate_next_run(
            schedule.next_run_at,
            now,
            schedule.scan_frequency,
        )

        trigger_scan(schedule)
        schedule.next_run_at = next_run

def calculate_next_run(
        next_run_at:datetime,
        now: datetime,
        frequency:str,   
) -> datetime:
    """Advance to the first future slot, preserving the original timing."""
    intervals ={
        "HOURLY": timedelta(hours=1),
        "DAILY": timedelta(days=1),
        "WEEKLY": timedelta(weeks=1),
    }
    if frequency not in intervals:
        raise ValueError(f"Unsupported frequency: {frequency}")

    interval = intervals[frequency]

    if next_run_at > now:
        return next_run_at

    # Skip missed intervals and move to the next future slot, keeping the original timing.
    slots_to_advance = (now - next_run_at) // interval + 1
    return next_run_at + slots_to_advance * interval






