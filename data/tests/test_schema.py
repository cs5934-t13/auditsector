import pymysql
import pytest

import sys
from pathlib import Path

here = Path(__file__).resolve().parent
for candidate in (Path("/authentication"), here.parent / "authentication"):
    if candidate.is_dir():
        sys.path.insert(0, str(candidate))
        break

from authorization import auth_user

TEST_USERNAME = "ferguszo"
TEST_PASSWORD = "abc123"  # plaintext of the hash seeded in init_data.sql

EXPECTED_TABLES = {
    "audit_headers", "tags", "audit_tags",
    "schedules", 
    "users"
}


EXPECTED_USER_COLS = {
    "user_id", "first_name", "last_name", "email", 
    "username", "password_hash", "user_role", "user_status",
    "created_at", "updated_at"
}


def test_tables_exist(cur):
    cur.execute("SHOW TABLES")
    found = {list(row.values())[0] for row in cur.fetchall()}
    for table in EXPECTED_TABLES:
        assert table in found


def test_users_columns(cur):
    cur.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
    )
    cols = {r["COLUMN_NAME"] for r in cur.fetchall()}
    for col in EXPECTED_USER_COLS:
        assert col in cols


def test_foreign_keys_exist(cur):
    cur.execute(
        "SELECT TABLE_NAME, REFERENCED_TABLE_NAME "
        "FROM information_schema.KEY_COLUMN_USAGE "
        "WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL"
    )
    assert cur.fetchall(), "expected at least one foreign key"


def test_duplicate_user_rejected(cur):
    cur.execute("""
        INSERT INTO users (first_name, last_name, email, username, password_hash, user_role, user_status) 
            VALUES ('John', 'Smith', 'jsmith@vt.edu', 'jsmith', 'abc123', 'ANALYST', 'ACTIVE');
    """)
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute("""
                INSERT INTO users (first_name, last_name, email, username, password_hash, user_role, user_status) 
                    VALUES ('John', 'Smith', 'jsmith@vt.edu', 'jsmith', 'abc123', 'ANALYST', 'ACTIVE');
        """)


def test_valid_authorization():
    status = auth_user(TEST_USERNAME, TEST_PASSWORD)
    assert status['status'] == 'approved'


def test_invalid_authorization():
    status = auth_user(TEST_USERNAME, 'invalid_password')
    assert status['status'] == 'failed'


def test_unknown_user():
    status = auth_user('no_such_user', TEST_PASSWORD)
    assert status['status'] == 'failed'