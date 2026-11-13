import os

import pymysql
from argon2 import PasswordHasher


class Users:
    @staticmethod
    def valid_user(first_name, last_name, email, username, password, role, status):
        return (
            len(first_name) > 0
            and len(last_name) > 0
            and len(email) > 0
            and len(username) > 0
            and len(password) > 0
            and role in ("ADMIN", "ANALYST")
            and status in ("ACTIVE", "INACTIVE")
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

    def get_users(self):
        query = """
            SELECT *
            FROM users
            WHERE user_status="ACTIVE";
            """
        try:
            conn = self.get_db_connection()
            with conn, conn.cursor() as cur:
                cur.execute(query)
                return cur.fetchall()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def get_user(self, user_id):
        query = """
            SELECT *
            FROM users
            WHERE user_id=%s AND user_status="ACTIVE";
            """

        try:
            conn = self.get_db_connection()
            with conn, conn.cursor() as cur:
                cur.execute(query, (user_id,))
                return cur.fetchone()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

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
                conn.commit()

        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def remove_user(self, user_id):

        query = """
            UPDATE users 
            SET user_status="INACTIVE"
            WHERE user_id=%s
        """

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                rows_deleted = cur.execute(query, (user_id,))
                conn.commit()
                return rows_deleted == 1
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

        user = {
            "user_id": user_id,
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

        updates = ",".join([f"{k}=%({k})s" for k, v in user.items() if v is not None])

        query = f"""
        UPDATE users
        SET
        {updates}
        WHERE user_id=%(user_id)s
"""

        try:
            with self.get_db_connection() as conn, conn.cursor() as cur:
                rows_updated = cur.execute(query, user)
                conn.commit()
                return rows_updated == 1
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise
