import os

import pymysql
import pytest
from testing import containers

import users

def get_db_connection():
    host = os.getenv("DB_HOST","localhost")
    user = os.getenv("DB_USERNAME", "root")
    password = os.getenv("DB_PASSWORD", "")
    database = os.getenv("DB_NAME", "auditsector")
    return pymysql.connect(
        host = host,
        use = user,
        password = password,
        database = database,
        cursorclass = pymysql.cursors.DictCursor)

def create_users_table() :
    query = """
    CREATE TABLE IF NOT EXISTS users(
    user_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(100) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    user_role       ENUM('ADMIN', 'ANALYST') NOT NULL DEFAULT('ANALYST'),
    user_status     ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT('ACTIVE'),
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
    """

    with get_db_connection as conn, conn.cursor() as cur:
        cur.execute(query)



@pytest.fixture(scope="module", autouse=True)
def setup(request):
    container = containers.DatabaseContainer()
    container.start_mysql()
    connection = container.get_test_db_connection()

    def remove_container():
        container.stop_mysql()

    request.addfinalizer(remove_container)
    # os.environ["DB_CONN"] = mysql.get_connection_url()
    # os.environ["DB_HOST"] = mysql.get_container_host_ip()
    # os.environ["DB_PORT"] = mysql.get_exposed_port(3361)
    # os.environ["DB_USERNAME"] = mysql.username
    # os.environ["DB_PASSWORD"] = mysql.password
    # os.environ["DB_NAME"] = mysql.dbname


def test_test_runner():
    assert True
