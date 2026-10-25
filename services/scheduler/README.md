# Scheduler — AW-98

## Purpose
Trigger scans of registered audit sources when their schedules are due,
and record when each scan is triggered.


## Behavior

- Checks schedules every 60 seconds after each processing pass.
- Supports HOURLY, DAILY, and WEEKLY frequencies.
- Triggers overdue schedules once and advances to the next future slot.
- Reads and writes schedule times using a proposed UTC convention.
- Logs failures and continues processing other schedules.

Fetcher integration and run-time recording are pending coordination.
MONTHLY and ARCHIVE behavior is not implemented.

