from flask import Flask, request
import pymysql
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
import os

app = Flask(__name__)

def get_db_connection():
    return pymysql.connect(
        host="127.0.0.1",
        user="root",
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database="auditsector",
        cursorclass=pymysql.cursors.DictCursor,
    )

@app.route("/")
def hello_world():
    return "<h1>Hello AuditSector!</h1>"

@app.route("/test")
def test_api():
    return ["Hello from the server"]

@app.route("/login", methods=["POST"])
def login_user():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return {
            "status": "failed",
            "reason": "username and password are required"
        }, 400

    conn = get_db_connection()
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
    