"""Shared fetcher connection settings, matching the scheduler's configuration."""

import os
import pymysql


def connect_db():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database=os.environ.get("DB_NAME", "auditsector"),
        cursorclass=pymysql.cursors.DictCursor,
    )
