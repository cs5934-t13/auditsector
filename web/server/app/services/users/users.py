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
        query = f"""
            SELECT *
            FROM users
            WHERE user_id={user_id};
            """

        try:
            conn = self.get_db_connection()
            with conn, conn.cursor() as cur:
                cur.execute(query)
                return cur.fetchone()
        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def add_user(self, first_name, last_name, email, username, password, role, status):
        query = f"""
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
                '{first_name}',
                '{last_name}',
                '{email}',
                '{username}',
                '{PasswordHasher().hash(password=password)}',
                '{role}',
                '{status}',
                NOW()
                );
            """

        try:
            conn = self.get_db_connection()

            with conn, conn.cursor() as cur:
                cur.execute(query)
                conn.commit()

        except pymysql.MySQLError as err:
            print(f"Unexpected {err=}, {type(err)=}")
            raise

    def remove_user(self, user_id):
        conn = self.get_db_connection()

        return

    def update_user(
        self, user_id, first_name, last_name, email, username, password, role, status
    ):
        conn = self.get_db_connection()

        return
