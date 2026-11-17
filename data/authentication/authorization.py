import os

import pymysql
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError


def get_connection():
    return pymysql.connect(
        host="127.0.0.1",
        user="root",
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database="auditsector",
        cursorclass=pymysql.cursors.DictCursor,
    )


def auth_user(username, password):
    conn = get_connection()

    with conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT password_hash
                FROM users
                WHERE username = %s;
            """, (username,))
            row = cur.fetchone()

    if row is None:
        return {
            "status": "failed",
            "reason": "username not in database"
        }

    try:
        PasswordHasher().verify(row["password_hash"], password)
    except (VerificationError, InvalidHashError):
        return {
            "status": "failed",
            "reason": "passwords do not match"
        }

    return {
        "status": "approved",
        "reason": "user is authorized"
    }
