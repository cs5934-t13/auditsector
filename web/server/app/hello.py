from flask import Flask, request, session
from functools import wraps
from datetime import timedelta
import pymysql
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
import os

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)

def get_db_connection():
    return pymysql.connect(
        host="127.0.0.1",
        user="root",
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database="auditsector",
        cursorclass=pymysql.cursors.DictCursor,
    )

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "username" not in session:
            return {
                "status": "failed",
                "reason": "authentication required"
            }, 401
        return f(*args, **kwargs)
    return wrapper

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
        }, 401

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
            "reason": "invalid credentials"
        }, 401

    try:
        PasswordHasher().verify(row["password_hash"], password)
    except (VerificationError, InvalidHashError):
        return {
            "status": "failed",
            "reason": "invalid credentials"
        }, 401

    session.clear()
    session["username"] = username
    session.permanent = True

    return {
        "status": "approved",
        "reason": "user is authorized"
    }


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return {
        "status": "logged out"
    }