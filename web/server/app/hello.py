from flask import Flask, request
from urllib.parse import urlparse
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


    VALID_FREQUENCIES = {"HOURLY", "DAILY", "WEEKLY", "MONTHLY"}


def valid_url(url):
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


@app.route("/sources", methods=["POST"])
def add_source():
    user = request.args.get("user")
    source = request.args.get("source")
    frequency = request.args.get("frequency", "WEEKLY").upper()

    if not user:
        return {
            "error": {
                "code": "MISSING_USER",
                "message": "No user given in API call."
            }
        }, 400

    if not source:
        return {
            "error": {
                "code": "MISSING_SOURCE",
                "message": "No source given in API call."
            }
        }, 400

    if not valid_url(source):
        return {
            "error": {
                "code": "INVALID_SOURCE",
                "message": "Source must be a valid HTTP or HTTPS URL."
            }
        }, 400

    if frequency not in VALID_FREQUENCIES:
        return {
            "error": {
                "code": "INVALID_FREQUENCY",
                "message": "Frequency must be HOURLY, DAILY, WEEKLY, or MONTHLY."
            }
        }, 400

    try:
        conn = get_db_connection()

        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT user_id
                    FROM users
                    WHERE username = %s;
                """, (user,))

                row = cur.fetchone()

                if row is None:
                    return {
                        "error": {
                            "code": "INVALID_USER",
                            "message": "Given user not found in database."
                        }
                    }, 400

                user_id = row["user_id"]

                cur.execute("""
                    INSERT INTO schedules (
                        created_by,
                        source_link,
                        scan_frequency
                    )
                    VALUES (%s, %s, %s);
                """, (user_id, source, frequency))

                schedule_id = cur.lastrowid
                conn.commit()

        return {
            "data": [
                {
                    "schedule_id": schedule_id,
                    "created_by": user_id,
                    "source_link": source,
                    "scan_frequency": frequency
                }
            ]
        }, 201

    except pymysql.MySQLError:
        return {
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Unable to connect to or update the database."
            }
        }, 500