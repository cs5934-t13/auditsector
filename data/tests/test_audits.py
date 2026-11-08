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
    pass

# Test the defaults work properly if optional fields are left blank
def test_insert_audit_defaults(cur):
    pass

# Test every risk level can be stored
@pytest.mark.parametrize("risk", ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"])
def test_insert_audit_with_risk_level(cur, risk):
    pass

# Test defaults are not hard-stuck for run_status
@pytest.mark.parametrize("status", ["PENDING", "RUNNING", "COMPLETED", "FAILED"])
def test_insert_audit_with_run_status(cur, status):
    pass

# Test that it will error if NOT NULL fields without defaults are left blank
@pytest.mark.parametrize("missing", ["schedule_id", "title", "audit_date"])
def test_insert_audit_missing_required_field_rejected(cur, missing):
    pass

# Test that NOT NULL fields with defaults still reject an explicit NULL
def test_insert_audit_explicit_null_created_at_rejected(cur):
    pass

# Test that it will error if values outside of enum are used
@pytest.mark.parametrize("col, value", [("risk_level", "SEVERE"), ("run_status", "CANCELLED")])
def test_insert_audit_invalid_enum_rejected(cur, col, value):
    pass

# Test that schedule_id must reference an existing schedule
def test_insert_audit_unknown_schedule_rejected(cur):
    pass

# Test that a title longer than VARCHAR(255) is rejected
def test_insert_audit_title_too_long_rejected(cur):
    pass

# Test that one schedule can have multiple audits
def test_schedule_can_have_multiple_audits(cur):
    pass

# Test that the same schedule + audit_date is allowed (index is not UNIQUE)
def test_same_schedule_and_date_allowed(cur):
    pass

# Test a tag can be properly inserted into DB
def test_insert_tag_stores_fields(cur):
    pass

# Test that tag name is required
def test_insert_tag_missing_name_rejected(cur):
    pass

# Test that tag name is UNIQUE
def test_duplicate_tag_name_rejected(cur):
    pass

# Test that a tag can be attached to an audit
def test_tag_audit(cur):
    pass

# Test that one audit can have multiple tags
def test_audit_can_have_multiple_tags(cur):
    pass

# Test that one tag can be applied to multiple audits
def test_tag_can_apply_to_multiple_audits(cur):
    pass

# Test that the same tag cannot be attached to the same audit twice (composite PK)
def test_duplicate_audit_tag_rejected(cur):
    pass

# Test that audit_tags must reference an existing audit and tag
@pytest.mark.parametrize("missing", ["audit_id", "tag_id"])
def test_audit_tag_unknown_reference_rejected(cur, missing):
    pass

# ============================= #
#         MODIFY AUDITS         #
# ============================= #

# Test that you can update the fields of an audit
def test_update_audit_fields(cur):
    pass

# Test that an audit run can be recorded (status, risk, summary)
def test_record_audit_result(cur):
    pass

# Test that it will error if updated to values outside of enum
@pytest.mark.parametrize("col, value", [("risk_level", "SEVERE"), ("run_status", "CANCELLED")])
def test_update_audit_invalid_enum_rejected(cur, col, value):
    pass

# Test that NOT NULL fields cannot be updated to NULL
@pytest.mark.parametrize("col", ["schedule_id", "title", "audit_date", "created_at"])
def test_update_audit_required_field_to_null_rejected(cur, col):
    pass

# Test that schedule_id can be reassigned, but only to an existing schedule
def test_update_audit_schedule_id(cur):
    pass

# Test that a tag can be renamed
def test_rename_tag(cur):
    pass

# Test that you cannot rename a tag to break UNIQUE
def test_update_to_duplicate_tag_name_rejected(cur):
    pass

# ============================= #
#         DELETE AUDITS         #
# ============================= #

# Test that an audit can be entirely removed from DB if necessary
def test_delete_audit(cur):
    pass

# Test that deleting an audit cascades to its audit_tags rows
def test_delete_audit_cascades_audit_tags(cur):
    pass

# Test that deleting an audit leaves its tags intact
def test_delete_audit_keeps_tags(cur):
    pass

# Test that deleting an audit leaves its schedule intact
def test_delete_audit_keeps_schedule(cur):
    pass

# Test that a tag can be removed from an audit without deleting either
def test_untag_audit(cur):
    pass

# Test that an unused tag can be deleted
def test_delete_unused_tag(cur):
    pass

# Test that a tag cannot be deleted while audits reference it
def test_delete_tag_in_use_rejected(cur):
    pass

# Test that UNIQUE tag names still allowed after delete
def test_deleted_tag_name_can_be_reused(cur):
    pass