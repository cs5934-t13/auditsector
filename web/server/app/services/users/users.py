import os

import pymysql
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# Columns that are safe to return to an API caller. `password_hash` is
# deliberately absent: it must never leave the database, and the original
# `SELECT *` would have returned it with every user record.
SAFE_COLUMNS = """
    user_id,
    first_name,
    last_name,
    email,
    username,
    user_role,
    user_status,
    created_at,
    updated_at
"""

USER_ROLES = ("ADMIN", "ANALYST")
USER_STATUSES = ("ACTIVE", "INACTIVE")

MAX_NAME_LENGTH = 100
MAX_EMAIL_LENGTH = 255
MAX_USERNAME_LENGTH = 100

# Maps the service's keyword arguments to their real column names. `role` and
# `status` read better at call sites, but the table columns are `user_role`
# and `user_status`.
COLUMN_FOR_FIELD = {
    "first_name": "first_name",
    "last_name": "last_name",
    "email": "email",
    "username": "username",
    "password_hash": "password_hash",
    "role": "user_role",
    "status": "user_status",
}


class Users:
    @staticmethod
    def valid_user(first_name, last_name, email, username, password, role, status):
        return (
            Users.valid_text(first_name, MAX_NAME_LENGTH)
            and Users.valid_text(last_name, MAX_NAME_LENGTH)
            and Users.valid_text(email, MAX_EMAIL_LENGTH)
            and Users.valid_text(username, MAX_USERNAME_LENGTH)
            and len(password) > 0
            and role in USER_ROLES
            and status in USER_STATUSES
        )

    @staticmethod
    def valid_text(value, max_length=MAX_NAME_LENGTH):
        """True for a non-blank string that fits the column."""
        return (
            isinstance(value, str)
            and len(value.strip()) > 0
            and len(value) <= max_length
        )

    def __init__(self, port=3306):
        self.port = port

    def get_db_connection(self):

        return pymysql.connect(
            host="127.0.0.1",
            port=self.port,
            user="root",
            password=os.environ["MYSQL_ROOT_PASSWORD"],
            database="auditsector",
            cursorclass=pymysql.cursors.DictCursor,
        )

    def get_users(self, include_inactive=False):
        """Lists users.

        Archived (`INACTIVE`) accounts are hidden by default. The administrator
        screen asks for them explicitly so archived users can be restored.
        """
        query = f"""
            SELECT {SAFE_COLUMNS}
            FROM users
            {"WHERE user_status='ACTIVE'" if not include_inactive else ""}
            ORDER BY user_id;
            """
        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                cur.execute(query)
                return cur.fetchall()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def get_user(self, user_id, include_inactive=False):
        query = f"""
            SELECT {SAFE_COLUMNS}
            FROM users
            WHERE user_id=%s
            {"AND user_status='ACTIVE'" if not include_inactive else ""};
            """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                cur.execute(query, (user_id,))
                return cur.fetchone()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def get_user_by_username(self, username, include_inactive=False):
        query = f"""
            SELECT {SAFE_COLUMNS}
            FROM users
            WHERE username=%s
            {"AND user_status='ACTIVE'" if not include_inactive else ""};
            """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                cur.execute(query, (username,))
                return cur.fetchone()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def verify_password(self, user_id, password):
        """Checks a password against the stored hash for `user_id`.

        The self-service profile endpoint requires the current password before
        accepting a new one.
        """
        query = """
            SELECT password_hash
            FROM users
            WHERE user_id=%s;
            """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                cur.execute(query, (user_id,))
                row = cur.fetchone()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

        if row is None:
            return False

        try:
            PasswordHasher().verify(row["password_hash"], password)
        except (VerificationError, InvalidHashError):
            return False

        return True

    def add_user(self, first_name, last_name, email, username, password, role, status):

        if not self.valid_user(
            first_name, last_name, email, username, password, role, status
        ):
            raise ValueError

        user = {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "username": username,
            "password_hash": PasswordHasher().hash(password=password),
            "role": role,
            "status": status,
        }

        query = """
            INSERT INTO users (
                first_name,
                last_name,
                email,
                username,
                password_hash,
                user_role,
                user_status,
                created_at
                )
            VALUES (
                %(first_name)s,
                %(last_name)s,
                %(email)s,
                %(username)s,
                %(password_hash)s,
                %(role)s,
                %(status)s,
                NOW()
                );
            """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                cur.execute(query, user)
                user_id = cur.lastrowid
                conn.commit()
                return user_id

        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def deactivate_user(self, user_id):
        """Archives a user by switching them to `INACTIVE`.

        The row is kept, so historic references (for example a schedule's
        `created_by`) still resolve. Sign-in stays blocked because the login
        route rejects any account that is not `ACTIVE`.
        """

        query = """
            UPDATE users 
            SET user_status="INACTIVE"
            WHERE user_id=%s AND user_status="ACTIVE"
        """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                rows_updated = cur.execute(query, (user_id,))
                conn.commit()
                return rows_updated == 1
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def reactivate_user(self, user_id):
        """Restores an archived user to `ACTIVE`."""

        query = """
            UPDATE users
            SET user_status="ACTIVE"
            WHERE user_id=%s AND user_status="INACTIVE"
        """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                rows_updated = cur.execute(query, (user_id,))
                conn.commit()
                return rows_updated == 1
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def update_user(
        self,
        user_id,
        first_name=None,
        last_name=None,
        email=None,
        username=None,
        password=None,
        role=None,
        status=None,
    ):
        """Updates any subset of a user's properties.

        `user_id` only selects the row: it is never added to the SET clause, so
        a caller cannot change a user's identity. Passing no values raises
        `ValueError` instead of emitting an empty (or `user_id`-only) UPDATE.
        """
        if role is not None and role not in USER_ROLES:
            raise ValueError(f"Invalid role: {role!r}")

        if status is not None and status not in USER_STATUSES:
            raise ValueError(f"Invalid status: {status!r}")

        for field, value, max_length in (
            ("first_name", first_name, MAX_NAME_LENGTH),
            ("last_name", last_name, MAX_NAME_LENGTH),
            ("email", email, MAX_EMAIL_LENGTH),
            ("username", username, MAX_USERNAME_LENGTH),
        ):
            if value is not None and not self.valid_text(value, max_length):
                raise ValueError(f"Invalid {field}")

        if password is not None and len(password) == 0:
            raise ValueError("Invalid password")

        values = {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "username": username,
            "password_hash": PasswordHasher().hash(password=password)
            if password is not None
            else None,
            "role": role,
            "status": status,
        }

        updates = {
            COLUMN_FOR_FIELD[field]: value
            for field, value in values.items()
            if value is not None
        }

        if not updates:
            raise ValueError("No fields to update")

        assignments = ", ".join(f"{column}=%s" for column in updates)
        query = f"UPDATE users SET {assignments} WHERE user_id=%s;"

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                rows_updated = cur.execute(query, (*updates.values(), user_id))
                conn.commit()
                return rows_updated == 1
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise
