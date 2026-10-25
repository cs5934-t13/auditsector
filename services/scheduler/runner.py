"""Connect scheduler timing logic to database storage."""

from collections.abc import Callable
from datetime import datetime

from services.scheduler.repository import load_schedules, save_next_run
from services.scheduler.scheduler import Schedule, trigger_due_scans


def run_once(
    connection,
    now: datetime,
    trigger_scan: Callable[[Schedule], None],
) -> None:
    """Load schedules and process those that are due."""
    schedules = load_schedules(connection)

    def persist_next_run(schedule_id: int, next_run_at: datetime):
        save_next_run(connection, schedule_id, next_run_at)

    trigger_due_scans(
        schedules,
        now,
        trigger_scan,
        persist_next_run,
    )