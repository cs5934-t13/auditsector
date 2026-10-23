import os
import pymysql
import pytest


@pytest.fixture(scope="session")
def conn():
    c = pymysql.connect(
        host="127.0.0.1",
        user="root",
        password=os.environ["MYSQL_ROOT_PASSWORD"],
        database="auditsector",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )
    yield c
    c.close()


@pytest.fixture
def cur(conn):
    """Cursor whose changes are rolled back after each test."""
    with conn.cursor() as cursor:
        yield cursor
    conn.rollback()