import os

import pymysql
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError


def get_db_connection():
    return pymysql.connect(
        host="127.0.0.1",
        user="root",
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database="auditsector",
        cursorclass=pymysql.cursors.DictCursor,
    )


def get_users():
    query = """
        SELECT *
        FROM USERS
        """
    try:
        conn = get_db_connection()
        with conn, conn.cursor() as cur:
            cur.execute(query)
            return cur.fetchall()
    except pymysql.MySQLError:
        return None


def get_user(user_id):
    query = (
        """
        SELECT *
        FROM USERS
        WHERE user_id=%s
        """,
        (user_id,),
    )
    try:
        conn = get_db_connection()
        with conn, conn.cursor() as cur:
            cur.execute(query)
            return cur.fetchone()
    except pymysql.MySQLError:
        return None





def add_user(first_name, last_name, email, username, password, role, status):
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
            created_at
        """, (first_name,
      last_name,
      email,
      username,
      PasswordHasher.hash(password),
      role,
      status))

    try:
        conn = get_db_connection()

        with conn, conn.cursor() as cur:
            cur.execute(query)

    except pymysql.MySQLError:
        return None



def remove_user(user_id):
    conn = get_db_connection()

    return


def update_user(
    user_id, first_name, last_name, email, username, password, role, status
):
    conn = get_db_connection()

    return
