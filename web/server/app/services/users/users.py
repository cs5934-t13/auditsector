import os

import pymysql
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError


class Users:
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
            FROM users;
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
        query = (
            """
            SELECT *
            FROM users
            WHERE user_id=%s;
            """,
            (user_id,),
        )
        try:
            conn = self.get_db_connection()
            with conn, conn.cursor() as cur:
                cur.execute(query)
                return cur.fetchone()
        except pymysql.MySQLError:
            return None

    def add_user(self, first_name, last_name, email, username, password, role, status):
        query = (
            """
            INSERT INTO users
            VALUES
                first_name=%s,
                last_name=%s,
                email=%s,
                username=%s,
                password_hash=%s,
                user_role=%s,
                user_status=%s
                created_at=NOW();
            """,
            (
                first_name,
                last_name,
                email,
                username,
                PasswordHasher.hash(password),
                role,
                status,
            ),
        )

        try:
            conn = self.get_db_connection()

            with conn, conn.cursor() as cur:
                cur.execute(query)

        except pymysql.MySQLError:
            return None

    def remove_user(self, user_id):
        conn = self.get_db_connection()

        return

    def update_user(
        self, user_id, first_name, last_name, email, username, password, role, status
    ):
        conn = self.get_db_connection()

        return
