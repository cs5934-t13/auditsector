"""Database connection factory.

Kept in its own module so every service shares one implementation. Services
must call `db.get_db_connection()` (attribute access) rather than
`from db import get_db_connection`, so tests can patch `db.get_db_connection`
once and cover every caller.
"""

import os

import pymysql


def get_db_connection():
    """Opens a connection to the application database.

    Host and database name are still hard-coded, unlike the data layer which
    reads `DB_HOST`/`DB_NAME`. Inside the pod every container shares the
    network namespace, so loopback reaches MySQL.
    """
    return pymysql.connect(
        host="127.0.0.1",
        user="root",
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database="auditsector",
        cursorclass=pymysql.cursors.DictCursor,
    )
