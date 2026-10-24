import os
import time
from pathlib import Path

import pymysql
from pymysql.constants import CLIENT

HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_NAME = os.environ.get("DB_NAME", "auditsector")
SQL_FILES = ["init_users.sql", "init_schedules.sql", "init_audits.sql"]

if os.environ.get("LOAD_DUMMY_DATA") == "true":
    SQL_FILES.append("init_data.sql")

def connect_db(database=None, retries=30, delay=2):
    for attempt in range(retries):
        try:
            return pymysql.connect(
                host=HOST,
                user="root",
                password=os.environ["MYSQL_ROOT_PASSWORD"],
                database=database,
                cursorclass=pymysql.cursors.DictCursor,
                client_flag=CLIENT.MULTI_STATEMENTS,
            )
        except pymysql.err.OperationalError as e:
            if attempt == retries - 1:
                raise
            time.sleep(delay)


def init_db(sql_dir):
    sql_dir = Path(sql_dir)

    # 1. Make sure the database exists
    with connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
        conn.commit()

    # 2. Run the SQL files inside it
    with connect_db(DB_NAME) as conn:
        with conn.cursor() as cur:
            for name in SQL_FILES:
                cur.execute((sql_dir / name).read_text())
                while cur.nextset():
                    pass
        conn.commit()
    

if __name__ == "__main__":
    init_db("/sql")