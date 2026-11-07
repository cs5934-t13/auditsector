import os

import pytest
from testing import containers

from users.users import Users


def create_users_table(connection):
    create_query = """
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

    insert_query = """
    INSERT INTO users (first_name, last_name, email, username, password_hash, user_role, user_status)
        VALUES ('John', 'Smith', 'jsmith@vt.edu', 'jsmith', 'abc123', 'ANALYST', 'ACTIVE');
    """

    with connection.cursor() as cur:
        cur.execute(create_query)
        cur.execute(insert_query)


@pytest.fixture(scope="module", autouse=True)
def users(request):
    container = containers.DatabaseContainer()
    container.start_mysql()
    connection = container.get_test_db_connection()
    create_users_table(connection)
    connection.commit()

    os.environ["MYSQL_ROOT_PASSWORD"] = "test"
    users = Users(port=4321)
    yield users

    container.stop_mysql()
    os.unsetenv("MYSQL_ROOT_PASSWORD")


def test_test_runner():
    assert True


class TestGetUsers:
    def test_get_users(self, users):
        all_users = users.get_users()
        assert len(all_users) == 1


class TestGetUser:
    def test_valid_user(self, users):
        user = users.get_user(1)
        assert user["first_name"] == "John"

    def test_invalid_request(self, users):
        with pytest.raises(TypeError):
            users.get_user()

    def test_not_found(self, users):
        user = users.get_user(2)
        assert user is None


class TestAddUser:
    def test_add_valid_user(self, users):
        users.add_user(
            first_name="Real",
            last_name="Name",
            email="my@email.com",
            username="realname",
            password="abc2",
            role="ADMIN",
            status="ACTIVE",
        )

        user = users.get_user(2)
        assert user["first_name"] == "Real"

    def test_missing_username(self, users):
        assert False

    def test_missing_password(self, users):
        assert False
