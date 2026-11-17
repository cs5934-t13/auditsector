from datetime import datetime, date

import pymysql
import pytest


USER = {
    "first_name":   "Test",
    "last_name":    "User",
    "email":        "testuser@vt.edu",
    "username":     "testuser",
    "password_hash":"not_a_real_hash",
}

SCHEDULE = {
    "source_link":      "www.example.com/reports",
    "scan_frequency":   "WEEKLY",
    "last_run_at":      datetime(2026, 11, 2, 13, 30),
    "last_run_status":  "SUCCESS",
    "next_run_at":      datetime(2026, 11, 9, 13, 30),
}


def insert_user(cur, **overrides):
    user = {**USER, **overrides}
    cols = ", ".join(user)
    placeholders = ", ".join(["%s"] * len(user))
    cur.execute(
        f"INSERT INTO users ({cols}) VALUES ({placeholders})",
        tuple(user.values()),
    )
    return cur.lastrowid


def insert_schedule(cur, created_by, **overrides):
    schedule = {"created_by": created_by, **SCHEDULE, **overrides}
    cols = ", ".join(schedule)
    placeholders = ", ".join(["%s"] * len(schedule))
    cur.execute(
        f"INSERT INTO schedules ({cols}) VALUES ({placeholders})",
        tuple(schedule.values()),
    )
    return cur.lastrowid


def get_user(cur, user_id):
    cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
    return cur.fetchone()

def get_schedule(cur, schedule_id):
    cur.execute("SELECT * FROM schedules WHERE schedule_id = %s", (schedule_id,))
    return cur.fetchone()

# ============================= #
#         STORING TESTS         #
# ============================= #

# Test a schedule can be properly inserted into DB
def test_insert_schedule_stores_fields(cur):
    user_id = insert_user(cur)
    schedule_id = insert_schedule(cur, user_id)
    row = get_schedule(cur, schedule_id)

    assert row is not None
    assert row["created_by"] == user_id
    for col, value in SCHEDULE.items():
        assert row[col] == value

# Test the defaults work properly if optional fields are left blank
def test_insert_schedule_defaults(cur):
    user_id = insert_user(cur)
    cur.execute(
        "INSERT INTO schedules (created_by, source_link) VALUES (%s, %s)",
        (user_id, SCHEDULE["source_link"]),
    )
    row = get_schedule(cur, cur.lastrowid)

    assert row["scan_frequency"] == "WEEKLY"
    assert row["last_run_at"] is None
    assert row["last_run_status"] is None
    assert row["next_run_at"] is None
    assert row["created_at"] is not None
    assert row["updated_at"] is not None

# Test defaults are not hard-stuck
@pytest.mark.parametrize("frequency", ["HOURLY", "DAILY", "MONTHLY", "ARCHIVE"])
def test_insert_schedule_with_frequency(cur, frequency):
    schedule_id = insert_schedule(cur, insert_user(cur), scan_frequency=frequency)

    assert get_schedule(cur, schedule_id)["scan_frequency"] == frequency

# Test that both run statuses can be stored
@pytest.mark.parametrize("status", ["SUCCESS", "ERROR"])
def test_insert_schedule_with_run_status(cur, status):
    schedule_id = insert_schedule(cur, insert_user(cur), last_run_status=status)

    assert get_schedule(cur, schedule_id)["last_run_status"] == status

# Test that it will error if NOT NULL fields without defaults are left blank
@pytest.mark.parametrize("missing", ["created_by", "source_link"])
def test_insert_schedule_missing_required_field_rejected(cur, missing):
    schedule = {"created_by": insert_user(cur), **SCHEDULE}
    del schedule[missing]
    cols = ", ".join(schedule)
    placeholders = ", ".join(["%s"] * len(schedule))
    with pytest.raises(pymysql.err.MySQLError):
        cur.execute(
            f"INSERT INTO schedules ({cols}) VALUES ({placeholders})",
            tuple(schedule.values()),
        )

# Test that NOT NULL fields with defaults still reject an explicit NULL
@pytest.mark.parametrize("col", ["scan_frequency", "created_at", "updated_at"])
def test_insert_schedule_explicit_null_rejected(cur, col):
    with pytest.raises(pymysql.err.MySQLError):
        insert_schedule(cur, insert_user(cur), **{col: None})

# Test that it will error if values outside of enum are used
@pytest.mark.parametrize("col, value", [("scan_frequency", "YEARLY"), ("last_run_status", "PARTIAL")])
def test_insert_schedule_invalid_enum_rejected(cur, col, value):
    with pytest.raises(pymysql.err.MySQLError):
        insert_schedule(cur, insert_user(cur), **{col: value})

# Test that created_by must reference an existing user
def test_insert_schedule_unknown_user_rejected(cur):
    cur.execute("SELECT COALESCE(MAX(user_id), 0) + 1 AS missing_id FROM users")
    missing_id = cur.fetchone()["missing_id"]
    with pytest.raises(pymysql.err.IntegrityError):
        insert_schedule(cur, missing_id)

# Test that source_link is UNIQUE
def test_duplicate_source_rejected(cur):
    user_id = insert_user(cur)
    insert_schedule(cur, user_id)
    with pytest.raises(pymysql.err.IntegrityError):
        insert_schedule(cur, user_id, scan_frequency="HOURLY")

# Test that one user can own multiple schedules
def test_user_can_create_multiple_schedules(cur):
    user_id = insert_user(cur)
    first_id = insert_schedule(cur, user_id)
    second_id = insert_schedule(cur, user_id, source_link="www.example.com/other-reports")

    assert first_id != second_id
    assert get_schedule(cur, second_id)["created_by"] == user_id

# ============================= #
#         MODIFY TESTS          #
# ============================= #

# Test that you can update the fields of a schedule
def test_update_schedule_fields(cur):
    user_id = insert_user(cur)
    schedule_id = insert_schedule(cur, user_id)
    cur.execute(
        "UPDATE schedules SET source_link = %s, scan_frequency = %s, next_run_at = %s WHERE schedule_id = %s",
        ("www.example.com/changed", "DAILY", datetime(2026, 11, 3, 13, 30), schedule_id),
    )
    assert cur.rowcount == 1

    row = get_schedule(cur, schedule_id)
    assert row["source_link"] == "www.example.com/changed"
    assert row["scan_frequency"] == "DAILY"
    assert row["next_run_at"] == datetime(2026, 11, 3, 13, 30)
    # Untouched columns keep their values
    assert row["created_by"] == user_id
    assert row["last_run_at"] == SCHEDULE["last_run_at"]
    assert row["last_run_status"] == SCHEDULE["last_run_status"]

# Test that a scan run can be recorded on a schedule
def test_record_schedule_run(cur):
    schedule_id = insert_schedule(cur, insert_user(cur))
    cur.execute(
        "UPDATE schedules SET last_run_at = %s, last_run_status = %s, next_run_at = %s WHERE schedule_id = %s",
        (datetime(2026, 11, 9, 13, 30), "ERROR", datetime(2026, 11, 16, 13, 30), schedule_id),
    )

    row = get_schedule(cur, schedule_id)
    assert row["last_run_at"] == datetime(2026, 11, 9, 13, 30)
    assert row["last_run_status"] == "ERROR"
    assert row["next_run_at"] == datetime(2026, 11, 16, 13, 30)

# Test that you can archive a schedule
def test_archive_schedule(cur):
    schedule_id = insert_schedule(cur, insert_user(cur))
    cur.execute("UPDATE schedules SET scan_frequency = 'ARCHIVE' WHERE schedule_id = %s", (schedule_id,))

    assert get_schedule(cur, schedule_id)["scan_frequency"] == "ARCHIVE"

# Test that updated_at will refresh upon any edits
def test_update_refreshes_updated_at(cur):
    # Backdate the row so the change is visible without sleeping
    schedule_id = insert_schedule(
        cur, insert_user(cur), created_at="2000-01-01 00:00:00", updated_at="2000-01-01 00:00:00"
    )
    cur.execute("UPDATE schedules SET scan_frequency = 'HOURLY' WHERE schedule_id = %s", (schedule_id,))

    row = get_schedule(cur, schedule_id)
    assert row["updated_at"] > row["created_at"]

# Test that you cannot update a source_link to break UNIQUE
def test_update_to_duplicate_source_rejected(cur):
    user_id = insert_user(cur)
    insert_schedule(cur, user_id)
    other_id = insert_schedule(cur, user_id, source_link="www.example.com/other-reports")
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute(
            "UPDATE schedules SET source_link = %s WHERE schedule_id = %s",
            (SCHEDULE["source_link"], other_id),
        )

# Test that it will error if updated to values outside of enum
@pytest.mark.parametrize("col, value", [("scan_frequency", "YEARLY"), ("last_run_status", "PARTIAL")])
def test_update_schedule_invalid_enum_rejected(cur, col, value):
    schedule_id = insert_schedule(cur, insert_user(cur))
    with pytest.raises(pymysql.err.MySQLError):
        cur.execute(f"UPDATE schedules SET {col} = %s WHERE schedule_id = %s", (value, schedule_id))

# Test that NOT NULL fields cannot be updated to NULL
@pytest.mark.parametrize("col", ["created_by", "source_link", "scan_frequency"])
def test_update_schedule_required_field_to_null_rejected(cur, col):
    schedule_id = insert_schedule(cur, insert_user(cur))
    with pytest.raises(pymysql.err.MySQLError):
        cur.execute(f"UPDATE schedules SET {col} = NULL WHERE schedule_id = %s", (schedule_id,))

# Test that created_by can be reassigned, but only to an existing user
def test_update_schedule_created_by(cur):
    schedule_id = insert_schedule(cur, insert_user(cur))
    new_user_id = insert_user(cur, email="other@vt.edu", username="otheruser")
    cur.execute("UPDATE schedules SET created_by = %s WHERE schedule_id = %s", (new_user_id, schedule_id))

    assert get_schedule(cur, schedule_id)["created_by"] == new_user_id

    cur.execute("SELECT COALESCE(MAX(user_id), 0) + 1 AS missing_id FROM users")
    missing_id = cur.fetchone()["missing_id"]
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute("UPDATE schedules SET created_by = %s WHERE schedule_id = %s", (missing_id, schedule_id))

# ============================= #
#         DELETE TESTS          #
# ============================= #

# Test that a schedule can be entirely removed from DB if necessary
def test_delete_schedule(cur):
    user_id = insert_user(cur)
    schedule_id = insert_schedule(cur, user_id)
    cur.execute("DELETE FROM schedules WHERE schedule_id = %s", (schedule_id,))

    assert cur.rowcount == 1
    assert get_schedule(cur, schedule_id) is None

# Test that UNIQUE values still allowed after delete
def test_deleted_schedule_link_can_be_reused(cur):
    user_id = insert_user(cur)
    schedule_id = insert_schedule(cur, user_id)
    cur.execute("DELETE FROM schedules WHERE schedule_id = %s", (schedule_id,))

    new_id = insert_schedule(cur, user_id)
    assert new_id != schedule_id
    assert get_schedule(cur, new_id)["source_link"] == SCHEDULE["source_link"]

# Test that a schedule cannot be deleted while audits reference it (data loss)
def test_delete_schedule_with_audit_rejected(cur):
    user_id = insert_user(cur)
    schedule_id = insert_schedule(cur, user_id)
    cur.execute(
        "INSERT INTO audit_headers (schedule_id, title, audit_date) VALUES (%s, %s, %s)",
        (schedule_id, "Legitimate Audit", date(2026, 11, 5)),
    )
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute("DELETE FROM schedules WHERE schedule_id = %s", (schedule_id,))

    assert get_schedule(cur, schedule_id) is not None

# Test that deleting a schedule leaves its creator intact
def test_delete_schedule_keeps_user(cur):
    user_id = insert_user(cur)
    schedule_id = insert_schedule(cur, user_id)
    cur.execute("DELETE FROM schedules WHERE schedule_id = %s", (schedule_id,))

    assert get_user(cur, user_id) is not None