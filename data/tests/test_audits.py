from datetime import datetime

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

AUDIT = {
    "title":        "Demo Audit",
    "audit_date":   datetime(2026, 11, 1, 13, 30),
}

TAG = {
    "name":         "Example Tag",
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


def insert_audit(cur, schedule_id, **overrides):
    audit = {"schedule_id": schedule_id, **AUDIT, **overrides}
    cols = ", ".join(audit)
    placeholders = ", ".join(["%s"] * len(audit))
    cur.execute(
        f"INSERT INTO audit_headers ({cols}) VALUES ({placeholders})",
        tuple(audit.values()),
    )
    return cur.lastrowid


def insert_tag(cur, **overrides):
    tag = {**TAG, **overrides}
    cols = ", ".join(tag)
    placeholders = ", ".join(["%s"] * len(tag))
    cur.execute(
        f"INSERT INTO tags ({cols}) VALUES ({placeholders})",
        tuple(tag.values()),
    )
    return cur.lastrowid


def tag_audit(cur, audit_id, tag_id):
    cur.execute(
        "INSERT INTO audit_tags (audit_id, tag_id) VALUES (%s, %s)",
        (audit_id, tag_id),
    )


def get_user(cur, user_id):
    cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
    return cur.fetchone()

def get_schedule(cur, schedule_id):
    cur.execute("SELECT * FROM schedules WHERE schedule_id = %s", (schedule_id,))
    return cur.fetchone()

def get_audit(cur, audit_id):
    cur.execute("SELECT * FROM audit_headers WHERE audit_id = %s", (audit_id,))
    return cur.fetchone()

def get_tag(cur, tag_id):
    cur.execute("SELECT * FROM tags WHERE tag_id = %s", (tag_id,))
    return cur.fetchone()

def get_audit_tag_ids(cur, audit_id):
    cur.execute("SELECT tag_id FROM audit_tags WHERE audit_id = %s ORDER BY tag_id", (audit_id,))
    return [row["tag_id"] for row in cur.fetchall()]

# ============================= #
#         STORING AUDITS        #
# ============================= #

# Test an audit can be properly inserted into DB
def test_insert_audit_stores_fields(cur):
    # An audit needs a schedule, and a schedule needs a user
    user_id = insert_user(cur)
    schedule_id = insert_schedule(cur, user_id)
    audit_id = insert_audit(cur, schedule_id)
    row = get_audit(cur, audit_id)

    assert row is not None
    assert row["schedule_id"] == schedule_id
    for col, value in AUDIT.items():
        assert row[col] == value

# Test the defaults work properly if optional fields are left blank
def test_insert_audit_defaults(cur):
    user_id = insert_user(cur)
    schedule_id = insert_schedule(cur, user_id)
    cur.execute(
        "INSERT INTO audit_headers (schedule_id, title, audit_date) VALUES (%s, %s, %s)",
        (schedule_id, AUDIT["title"], AUDIT["audit_date"]),
    )
    row = get_audit(cur, cur.lastrowid)

    assert row["risk_level"] is None
    assert row["run_status"] == "PENDING"
    assert row["summary"] is None
    assert row["created_at"] is not None

# Test every risk level can be stored
@pytest.mark.parametrize("risk", ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"])
def test_insert_audit_with_risk_level(cur, risk):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)), risk_level=risk)

    assert get_audit(cur, audit_id)["risk_level"] == risk

# Test defaults are not hard-stuck for run_status
@pytest.mark.parametrize("status", ["PENDING", "RUNNING", "COMPLETED", "FAILED"])
def test_insert_audit_with_run_status(cur, status):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)), run_status=status)

    assert get_audit(cur, audit_id)["run_status"] == status

# Test that it will error if NOT NULL fields without defaults are left blank
@pytest.mark.parametrize("missing", ["schedule_id", "title", "audit_date"])
def test_insert_audit_missing_required_field_rejected(cur, missing):
    audit = {"schedule_id": insert_schedule(cur, insert_user(cur)), **AUDIT}
    del audit[missing]
    cols = ", ".join(audit)
    placeholders = ", ".join(["%s"] * len(audit))
    with pytest.raises(pymysql.err.MySQLError):
        cur.execute(
            f"INSERT INTO audit_headers ({cols}) VALUES ({placeholders})",
            tuple(audit.values()),
        )

# Test that NOT NULL fields with defaults still reject an explicit NULL
# (run_status is not included: it has a default but is nullable in the schema)
def test_insert_audit_explicit_null_created_at_rejected(cur):
    with pytest.raises(pymysql.err.MySQLError):
        insert_audit(cur, insert_schedule(cur, insert_user(cur)), created_at=None)

# Test that it will error if values outside of enum are used
@pytest.mark.parametrize("col, value", [("risk_level", "SEVERE"), ("run_status", "CANCELLED")])
def test_insert_audit_invalid_enum_rejected(cur, col, value):
    with pytest.raises(pymysql.err.MySQLError):
        insert_audit(cur, insert_schedule(cur, insert_user(cur)), **{col: value})

# Test that schedule_id must reference an existing schedule
def test_insert_audit_unknown_schedule_rejected(cur):
    cur.execute("SELECT COALESCE(MAX(schedule_id), 0) + 1 AS missing_id FROM schedules")
    missing_id = cur.fetchone()["missing_id"]
    with pytest.raises(pymysql.err.IntegrityError):
        insert_audit(cur, missing_id)

# Test that a title longer than VARCHAR(255) is rejected
def test_insert_audit_title_too_long_rejected(cur):
    schedule_id = insert_schedule(cur, insert_user(cur))
    with pytest.raises(pymysql.err.MySQLError):
        insert_audit(cur, schedule_id, title="x" * 256)

# Test that one schedule can have multiple audits
def test_schedule_can_have_multiple_audits(cur):
    schedule_id = insert_schedule(cur, insert_user(cur))
    first_id = insert_audit(cur, schedule_id)
    second_id = insert_audit(cur, schedule_id, title="Second Audit", audit_date=datetime(2026, 11, 8, 13, 30))

    assert first_id != second_id
    assert get_audit(cur, first_id)["schedule_id"] == schedule_id
    assert get_audit(cur, second_id)["schedule_id"] == schedule_id

# Test that the same schedule + audit_date is allowed (index is not UNIQUE)
def test_same_schedule_and_date_allowed(cur):
    schedule_id = insert_schedule(cur, insert_user(cur))
    first_id = insert_audit(cur, schedule_id)
    second_id = insert_audit(cur, schedule_id)

    first, second = get_audit(cur, first_id), get_audit(cur, second_id)
    assert first_id != second_id
    assert first["schedule_id"] == second["schedule_id"] == schedule_id
    assert first["audit_date"] == second["audit_date"]

# Test a tag can be properly inserted into DB
def test_insert_tag_stores_fields(cur):
    tag_id = insert_tag(cur)
    row = get_tag(cur, tag_id)

    assert row is not None
    assert row["created_at"] is not None
    for col, value in TAG.items():
        assert row[col] == value

# Test that tag name is required
def test_insert_tag_missing_name_rejected(cur):
    with pytest.raises(pymysql.err.MySQLError):
        cur.execute("INSERT INTO tags () VALUES ()")

# Test that tag name is UNIQUE
def test_duplicate_tag_name_rejected(cur):
    insert_tag(cur)
    with pytest.raises(pymysql.err.IntegrityError):
        insert_tag(cur)

# Test that a tag can be attached to an audit
def test_tag_audit(cur):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    tag_id = insert_tag(cur)
    tag_audit(cur, audit_id, tag_id)

    assert get_audit_tag_ids(cur, audit_id) == [tag_id]

# Test that one audit can have multiple tags
def test_audit_can_have_multiple_tags(cur):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    first_tag = insert_tag(cur, name="tag 1")
    second_tag = insert_tag(cur, name="tag 2")

    tag_audit(cur, audit_id, first_tag)
    tag_audit(cur, audit_id, second_tag)

    assert get_audit_tag_ids(cur, audit_id) == sorted([first_tag, second_tag])

# Test that one tag can be applied to multiple audits
def test_tag_can_apply_to_multiple_audits(cur):
    schedule_id = insert_schedule(cur, insert_user(cur))
    first_audit = insert_audit(cur, schedule_id)
    second_audit = insert_audit(cur, schedule_id, title="Second Audit")
    tag_id = insert_tag(cur)

    tag_audit(cur, first_audit, tag_id)
    tag_audit(cur, second_audit, tag_id)

    assert get_audit_tag_ids(cur, first_audit) == [tag_id]
    assert get_audit_tag_ids(cur, second_audit) == [tag_id]

# Test that the same tag cannot be attached to the same audit twice (composite PK)
def test_duplicate_audit_tag_rejected(cur):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    tag_id = insert_tag(cur)
    tag_audit(cur, audit_id, tag_id)

    with pytest.raises(pymysql.err.IntegrityError):
        tag_audit(cur, audit_id, tag_id)

# Test that audit_tags must reference an existing audit and tag
@pytest.mark.parametrize("missing", ["audit_id", "tag_id"])
def test_audit_tag_unknown_reference_rejected(cur, missing):
    ids = {
        "audit_id": insert_audit(cur, insert_schedule(cur, insert_user(cur))),
        "tag_id": insert_tag(cur),
    }
    # Swap the chosen reference for an id one past the highest in use
    table = "audit_headers" if missing == "audit_id" else "tags"
    cur.execute(f"SELECT COALESCE(MAX({missing}), 0) + 1 AS missing_id FROM {table}")
    ids[missing] = cur.fetchone()["missing_id"]

    with pytest.raises(pymysql.err.IntegrityError):
        tag_audit(cur, ids["audit_id"], ids["tag_id"])

# ============================= #
#         MODIFY AUDITS         #
# ============================= #

# Test that you can update the fields of an audit
def test_update_audit_fields(cur):
    schedule_id = insert_schedule(cur, insert_user(cur))
    audit_id = insert_audit(cur, schedule_id)
    cur.execute(
        "UPDATE audit_headers SET title = %s, audit_date = %s WHERE audit_id = %s",
        ("New Title", datetime(2026, 11, 8, 13, 30), audit_id),
    )
    assert cur.rowcount == 1

    row = get_audit(cur, audit_id)
    assert row["title"] == "New Title"
    assert row["audit_date"] == datetime(2026, 11, 8, 13, 30)
    # Untouched columns keep their values
    assert row["schedule_id"] == schedule_id
    assert row["run_status"] == "PENDING"

# Test that an audit run can be recorded (status, risk, summary)
def test_record_audit_result(cur):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    cur.execute(
        "UPDATE audit_headers SET run_status = %s, risk_level = %s, summary = %s WHERE audit_id = %s",
        ("COMPLETED", "HIGH", "Two critical findings in the Q3 report", audit_id),
    )

    row = get_audit(cur, audit_id)
    assert row["run_status"] == "COMPLETED"
    assert row["risk_level"] == "HIGH"
    assert row["summary"] == "Two critical findings in the Q3 report"

# Test that it will error if updated to values outside of enum
@pytest.mark.parametrize("col, value", [("risk_level", "SEVERE"), ("run_status", "CANCELLED")])
def test_update_audit_invalid_enum_rejected(cur, col, value):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    with pytest.raises(pymysql.err.MySQLError):
        cur.execute(f"UPDATE audit_headers SET {col} = %s WHERE audit_id = %s", (value, audit_id))

# Test that NOT NULL fields cannot be updated to NULL
@pytest.mark.parametrize("col", ["schedule_id", "title", "audit_date", "created_at"])
def test_update_audit_required_field_to_null_rejected(cur, col):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    with pytest.raises(pymysql.err.MySQLError):
        cur.execute(f"UPDATE audit_headers SET {col} = NULL WHERE audit_id = %s", (audit_id,))

# Test that schedule_id can be reassigned, but only to an existing schedule
def test_update_audit_schedule_id(cur):
    user_id = insert_user(cur)
    audit_id = insert_audit(cur, insert_schedule(cur, user_id))
    new_schedule_id = insert_schedule(cur, user_id, source_link="www.example.com/other-reports")
    cur.execute("UPDATE audit_headers SET schedule_id = %s WHERE audit_id = %s", (new_schedule_id, audit_id))

    assert get_audit(cur, audit_id)["schedule_id"] == new_schedule_id

    cur.execute("SELECT COALESCE(MAX(schedule_id), 0) + 1 AS missing_id FROM schedules")
    missing_id = cur.fetchone()["missing_id"]
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute("UPDATE audit_headers SET schedule_id = %s WHERE audit_id = %s", (missing_id, audit_id))

# Test that a tag can be renamed
def test_rename_tag(cur):
    tag_id = insert_tag(cur)
    cur.execute("UPDATE tags SET name = %s WHERE tag_id = %s", ("New name", tag_id))

    assert cur.rowcount == 1
    assert get_tag(cur, tag_id)["name"] == "New name"

# Test that you cannot rename a tag to break UNIQUE
def test_update_to_duplicate_tag_name_rejected(cur):
    insert_tag(cur)
    second_tag = insert_tag(cur, name="Other example tag")
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute("UPDATE tags SET name = %s WHERE tag_id = %s", (TAG["name"], second_tag))

# ============================= #
#         DELETE AUDITS         #
# ============================= #

# Test that an audit can be entirely removed from DB if necessary
def test_delete_audit(cur):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    cur.execute("DELETE FROM audit_headers WHERE audit_id = %s", (audit_id,))

    assert cur.rowcount == 1
    assert get_audit(cur, audit_id) is None

# Test that deleting an audit cascades to its audit_tags rows
def test_delete_audit_cascades_audit_tags(cur):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    tag_audit(cur, audit_id, insert_tag(cur))
    cur.execute("DELETE FROM audit_headers WHERE audit_id = %s", (audit_id,))

    assert get_audit_tag_ids(cur, audit_id) == []

# Test that deleting an audit leaves its tags intact
def test_delete_audit_keeps_tags(cur):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    tag_id = insert_tag(cur)
    tag_audit(cur, audit_id, tag_id)
    cur.execute("DELETE FROM audit_headers WHERE audit_id = %s", (audit_id,))

    assert get_tag(cur, tag_id) is not None

# Test that deleting an audit leaves its schedule intact
def test_delete_audit_keeps_schedule(cur):
    schedule_id = insert_schedule(cur, insert_user(cur))
    audit_id = insert_audit(cur, schedule_id)
    cur.execute("DELETE FROM audit_headers WHERE audit_id = %s", (audit_id,))

    assert get_schedule(cur, schedule_id) is not None

# Test that a tag can be removed from an audit without deleting either
def test_untag_audit(cur):
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    tag_id = insert_tag(cur)
    tag_audit(cur, audit_id, tag_id)
    cur.execute("DELETE FROM audit_tags WHERE audit_id = %s AND tag_id = %s", (audit_id, tag_id))

    assert cur.rowcount == 1
    assert get_audit_tag_ids(cur, audit_id) == []
    assert get_audit(cur, audit_id) is not None
    assert get_tag(cur, tag_id) is not None

# Test that an unused tag can be deleted
def test_delete_unused_tag(cur):
    tag_id = insert_tag(cur)
    cur.execute("DELETE FROM tags WHERE tag_id = %s", (tag_id,))

    assert cur.rowcount == 1
    assert get_tag(cur, tag_id) is None

# Test that a tag cannot be deleted while audits reference it
def test_delete_tag_in_use_rejected(cur):
    # audit_tags.tag_id is ON DELETE RESTRICT
    audit_id = insert_audit(cur, insert_schedule(cur, insert_user(cur)))
    tag_id = insert_tag(cur)
    tag_audit(cur, audit_id, tag_id)
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute("DELETE FROM tags WHERE tag_id = %s", (tag_id,))

    assert get_tag(cur, tag_id) is not None
    assert get_audit_tag_ids(cur, audit_id) == [tag_id]

# Test that UNIQUE tag names still allowed after delete
def test_deleted_tag_name_can_be_reused(cur):
    tag_id = insert_tag(cur)
    cur.execute("DELETE FROM tags WHERE tag_id = %s", (tag_id,))

    new_id = insert_tag(cur)
    assert new_id != tag_id
    assert get_tag(cur, new_id)["name"] == TAG["name"]
