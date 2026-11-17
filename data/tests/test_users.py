import pymysql
import pytest


USER = {
    "first_name": "Test",
    "last_name": "User",
    "email": "testuser@vt.edu",
    "username": "testuser",
    "password_hash": "not_a_real_hash",
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


def get_user(cur, user_id):
    cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
    return cur.fetchone()


# ============================= #
#         STORING TESTS         #
# ============================= #

# Test a user can be properly inserted into DB
def test_insert_user_stores_fields(cur):
    user_id = insert_user(cur)
    row = get_user(cur, user_id)

    assert row is not None
    for col, value in USER.items():
        assert row[col] == value

# Test the defaults work properly if a field is left blank
def test_insert_user_defaults(cur):
    row = get_user(cur, insert_user(cur))

    assert row["user_role"] == "ANALYST"
    assert row["user_status"] == "ACTIVE"
    assert row["created_at"] is not None
    assert row["updated_at"] is not None

# Test defaults are not hard-stuck
def test_insert_user_with_role_and_status(cur):
    user_id = insert_user(cur, user_role="ADMIN", user_status="INACTIVE")
    row = get_user(cur, user_id)

    assert row["user_role"] == "ADMIN"
    assert row["user_status"] == "INACTIVE"


# Test that it will error if NOT NULL fields left blank
@pytest.mark.parametrize("missing", ["first_name", "last_name", "email", "username", "password_hash"])
def test_insert_user_missing_required_field_rejected(cur, missing):
    user = {k: v for k, v in USER.items() if k != missing}
    cols = ", ".join(user)
    placeholders = ", ".join(["%s"] * len(user))
    with pytest.raises(pymysql.err.MySQLError):
        cur.execute(
            f"INSERT INTO users ({cols}) VALUES ({placeholders})",
            tuple(user.values()),
        )

# Test that it will error if values outside of enum are used
@pytest.mark.parametrize("col, value", [("user_role", "SUPERUSER"), ("user_status", "BANNED")])
def test_insert_user_invalid_enum_rejected(cur, col, value):
    with pytest.raises(pymysql.err.MySQLError):
        insert_user(cur, **{col: value})

# Test that email is UNIQUE
def test_duplicate_email_rejected(cur):
    insert_user(cur)
    with pytest.raises(pymysql.err.IntegrityError):
        insert_user(cur, username="otheruser")

# Test that username is UNIQUE
def test_duplicate_username_rejected(cur):
    insert_user(cur)
    with pytest.raises(pymysql.err.IntegrityError):
        insert_user(cur, email="other@vt.edu")


# ============================= #
#         MODIFY TESTS          #
# ============================= #

# Test that you can update all fields of a user
def test_update_user_fields(cur):
    user_id = insert_user(cur)
    cur.execute(
        "UPDATE users SET first_name = %s, email = %s, user_role = %s WHERE user_id = %s",
        ("Changed", "changed@vt.edu", "ADMIN", user_id),
    )
    assert cur.rowcount == 1

    row = get_user(cur, user_id)
    assert row["first_name"] == "Changed"
    assert row["email"] == "changed@vt.edu"
    assert row["user_role"] == "ADMIN"
    # Untouched columns keep their values
    assert row["last_name"] == USER["last_name"]
    assert row["username"] == USER["username"]

# Test that you can turn a user inactive
def test_deactivate_user(cur):
    user_id = insert_user(cur)
    cur.execute("UPDATE users SET user_status = 'INACTIVE' WHERE user_id = %s", (user_id,))

    assert get_user(cur, user_id)["user_status"] == "INACTIVE"

# Test that updated_at will refresh upon any edits
def test_update_refreshes_updated_at(cur):
    # Backdate the row so the change is visible without sleeping
    user_id = insert_user(cur, created_at="2000-01-01 00:00:00", updated_at="2000-01-01 00:00:00")
    cur.execute("UPDATE users SET last_name = 'Changed' WHERE user_id = %s", (user_id,))

    row = get_user(cur, user_id)
    assert row["updated_at"] > row["created_at"]

# Test that you cannot update an email to break UNIQUE
def test_update_to_duplicate_email_rejected(cur):
    insert_user(cur)
    other_id = insert_user(cur, email="other@vt.edu", username="otheruser")
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute("UPDATE users SET email = %s WHERE user_id = %s", (USER["email"], other_id))

# Test that you cannot update a username to break UNIQUE
def test_update_to_duplicate_username_rejected(cur):
    insert_user(cur)
    other_id = insert_user(cur, email="other@vt.edu", username="otheruser")
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute("UPDATE users SET username = %s WHERE user_id = %s", (USER["username"], other_id))


# ============================= #
#         DELETE TESTS          #
# ============================= #

# Test that a user can be entirely removed from DB if necessary
def test_delete_user(cur):
    user_id = insert_user(cur)
    cur.execute("DELETE FROM users WHERE user_id = %s", (user_id,))

    assert cur.rowcount == 1
    assert get_user(cur, user_id) is None

# Test that UNIQUE values still allowed after delete
def test_deleted_user_credentials_can_be_reused(cur):
    user_id = insert_user(cur)
    cur.execute("DELETE FROM users WHERE user_id = %s", (user_id,))

    new_id = insert_user(cur)
    assert new_id != user_id
    assert get_user(cur, new_id)["username"] == USER["username"]

# Test that user cannot be deleted if they created any schedules (data loss)
def test_delete_user_with_schedule_rejected(cur):
    # schedules.created_by is ON DELETE RESTRICT
    user_id = insert_user(cur)
    cur.execute(
        "INSERT INTO schedules (created_by, source_link) VALUES (%s, %s)",
        (user_id, "https://example.com/reports"),
    )
    with pytest.raises(pymysql.err.IntegrityError):
        cur.execute("DELETE FROM users WHERE user_id = %s", (user_id,))

    assert get_user(cur, user_id) is not None
