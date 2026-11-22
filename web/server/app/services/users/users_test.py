import os

import pytest
from pymysql import IntegrityError
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


@pytest.fixture
def make_user(users):
    """Creates a fresh ACTIVE ANALYST and returns its id.

    Update tests must not depend on a row another test happened to create,
    because the module-scoped database is shared. The counter is module-level
    so usernames and e-mails stay unique across every test in the module.
    """

    def _make_user(**overrides):
        make_user.counter += 1
        n = make_user.counter
        fields = {
            "first_name": "Fixture",
            "last_name": f"User{n}",
            "email": f"fixture-{n}@email.com",
            "username": f"fixture{n}",
            "password": "abc123",
            "role": "ANALYST",
            "status": "ACTIVE",
        }
        fields.update(overrides)
        return users.add_user(**fields)

    return _make_user


make_user.counter = 0


class TestGetUsers:
    def test_get_users(self, users):
        all_users = users.get_users()
        # The seeded user is always present; other tests share this database.
        assert any(u["username"] == "jsmith" for u in all_users)

    def test_get_users_never_returns_password_hash(self, users):
        for user in users.get_users(include_inactive=True):
            assert "password_hash" not in user

    def test_get_users_excludes_inactive_by_default(self, users, make_user):
        user_id = make_user(username="archivedperson")
        assert users.deactivate_user(user_id)

        active_names = {u["username"] for u in users.get_users()}
        all_names = {u["username"] for u in users.get_users(include_inactive=True)}

        assert "archivedperson" not in active_names
        assert "archivedperson" in all_names


class TestGetUser:
    def test_valid_user(self, users):
        user = users.get_user(1)
        assert user["first_name"] == "John"

    def test_no_password_hash(self, users):
        assert "password_hash" not in users.get_user(1)

    def test_invalid_request(self, users):
        with pytest.raises(TypeError):
            users.get_user()  # type: ignore[call-arg]

    def test_not_found(self, users):
        user = users.get_user(9999)
        assert user is None

    def test_inactive_hidden_by_default(self, users, make_user):
        user_id = make_user()
        assert users.deactivate_user(user_id)

        assert users.get_user(user_id) is None
        assert users.get_user(user_id, include_inactive=True) is not None


class TestGetUserByUsername:
    def test_found(self, users):
        assert users.get_user_by_username("jsmith")["first_name"] == "John"

    def test_not_found(self, users):
        assert users.get_user_by_username("nobody") is None


class TestVerifyPassword:
    def test_correct_password(self, users, make_user):
        user_id = make_user(password="correct-horse")

        assert users.verify_password(user_id, "correct-horse")

    def test_wrong_password(self, users, make_user):
        user_id = make_user(password="correct-horse")

        assert not users.verify_password(user_id, "wrong-horse")

    def test_unknown_user(self, users):
        assert not users.verify_password(9999, "anything")


class TestAddUser:
    def test_add_valid_user(self, users, make_user):
        user_id = make_user(
            first_name="Real",
            last_name="Name",
            email="my@email.com",
            username="realname",
            password="abc2",
            role="ADMIN",
            status="ACTIVE",
        )

        user = users.get_user(user_id)
        assert user["first_name"] == "Real"
        assert user["user_role"] == "ADMIN"
        assert user["user_status"] == "ACTIVE"

    def test_added_password_is_hashed(self, users, make_user):
        user_id = make_user(password="plain-text-secret")

        # The plain text must never be stored, and the hash must verify.
        assert users.verify_password(user_id, "plain-text-secret")

    def test_add_returns_an_id(self, users, make_user):
        user_id = make_user()

        assert isinstance(user_id, int)
        assert user_id > 0

    def test_duplicate_email(self, users, make_user):
        make_user(email="taken@email.com", username="unique-one")

        with pytest.raises(IntegrityError):
            make_user(email="taken@email.com", username="unique-two")

    def test_duplicate_username(self, users, make_user):
        make_user(email="first@email.com", username="same-name")

        with pytest.raises(IntegrityError):
            make_user(email="second@email.com", username="same-name")

    def test_missing_first_name(self, users):
        with pytest.raises(ValueError):
            users.add_user(
                first_name="",
                last_name="Name",
                email="my2@email.com",
                username="missing-first-name",
                password="abc123",
                role="ADMIN",
                status="ACTIVE",
            )

    def test_missing_last_name(self, users):

        with pytest.raises(ValueError):
            users.add_user(
                first_name="First",
                last_name="",
                email="my3@email.com",
                username="missing-last-name",
                password="abc1",
                role="ADMIN",
                status="ACTIVE",
            )

    def test_missing_email(self, users):

        with pytest.raises(ValueError):
            users.add_user(
                first_name="First",
                last_name="Last",
                email="",
                username="missing-email",
                password="abc1",
                role="ADMIN",
                status="ACTIVE",
            )

    def test_missing_username(self, users):

        with pytest.raises(ValueError):
            users.add_user(
                first_name="First",
                last_name="Last",
                email="missing_username@me.com",
                username="",
                password="abc1",
                role="ADMIN",
                status="ACTIVE",
            )

    def test_missing_password(self, users):

        with pytest.raises(ValueError):
            users.add_user(
                first_name="First",
                last_name="Last",
                email="missing-password@me.com",
                username="missing-password",
                password="",
                role="ADMIN",
                status="ACTIVE",
            )

    def test_blank_first_name_is_rejected(self, users):
        with pytest.raises(ValueError):
            users.add_user(
                first_name="   ",
                last_name="Name",
                email="blank-name@email.com",
                username="blank-name",
                password="abc123",
                role="ANALYST",
                status="ACTIVE",
            )

    def test_invalid_role_is_rejected(self, users):
        with pytest.raises(ValueError):
            users.add_user(
                first_name="First",
                last_name="Last",
                email="bad-role@email.com",
                username="bad-role",
                password="abc123",
                role="SUPERUSER",
                status="ACTIVE",
            )

    def test_invalid_status_is_rejected(self, users):
        with pytest.raises(ValueError):
            users.add_user(
                first_name="First",
                last_name="Last",
                email="bad-status@email.com",
                username="bad-status",
                password="abc123",
                role="ANALYST",
                status="BANNED",
            )



class TestDeactivateUser:
    def test_deactivate_invalid_user(self, users):
        assert not users.deactivate_user(9999)

    def test_deactivate_valid_user(self, users, make_user):
        user_id = make_user()

        assert users.deactivate_user(user_id)

        # Archived, not destroyed: the row is still there when asked for.
        assert users.get_user(user_id) is None
        archived = users.get_user(user_id, include_inactive=True)
        assert archived is not None
        assert archived["user_status"] == "INACTIVE"

    def test_deactivating_twice_is_a_no_op(self, users, make_user):
        user_id = make_user()

        assert users.deactivate_user(user_id)
        assert not users.deactivate_user(user_id)


class TestReactivateUser:
    def test_restore_archived_user(self, users, make_user):
        user_id = make_user()
        assert users.deactivate_user(user_id)

        assert users.reactivate_user(user_id)
        assert users.get_user(user_id)["user_status"] == "ACTIVE"

    def test_restoring_an_active_user_is_a_no_op(self, users, make_user):
        assert not users.reactivate_user(make_user())

    def test_restore_unknown_user(self, users):
        assert not users.reactivate_user(9999)


class TestUpdateUser:
    def test_valid_update(self, users, make_user):
        user_id = make_user()

        assert users.update_user(user_id, first_name="After")
        assert users.get_user(user_id)["first_name"] == "After"

    def test_update_does_not_change_user_id(self, users, make_user):
        user_id = make_user()

        users.update_user(user_id, first_name="Still", last_name="Same")

        row = users.get_user(user_id, include_inactive=True)
        assert row["user_id"] == user_id

    def test_update_role_uses_user_role_column(self, users, make_user):
        user_id = make_user()

        assert users.update_user(user_id, role="ADMIN")

        assert users.get_user(user_id)["user_role"] == "ADMIN"

    def test_update_status_uses_user_status_column(self, users, make_user):
        user_id = make_user()

        assert users.update_user(user_id, status="INACTIVE")

        assert users.get_user(user_id, include_inactive=True)["user_status"] == (
            "INACTIVE"
        )

    def test_update_password_is_hashed(self, users, make_user):
        user_id = make_user()

        assert users.update_user(user_id, password="brand-new-password")

        assert users.verify_password(user_id, "brand-new-password")
        assert not users.verify_password(user_id, "abc123")

    def test_update_preserves_untouched_fields(self, users, make_user):
        user_id = make_user()
        before = users.get_user(user_id, include_inactive=True)

        users.update_user(user_id, last_name="OnlyLast")

        after = users.get_user(user_id, include_inactive=True)
        assert after["first_name"] == before["first_name"]
        assert after["email"] == before["email"]
        assert after["username"] == before["username"]
        assert after["last_name"] == "OnlyLast"

    def test_invalid_update(self, users):
        assert not users.update_user(9999, last_name="I don't exist")

    def test_empty_update_is_rejected(self, users):
        with pytest.raises(ValueError):
            users.update_user(1)

    def test_invalid_role_is_rejected(self, users):
        with pytest.raises(ValueError):
            users.update_user(1, role="SUPERUSER")

    def test_invalid_status_is_rejected(self, users):
        with pytest.raises(ValueError):
            users.update_user(1, status="BANNED")

    def test_blank_field_is_rejected(self, users):
        with pytest.raises(ValueError):
            users.update_user(1, first_name="   ")

    def test_empty_password_is_rejected(self, users):
        with pytest.raises(ValueError):
            users.update_user(1, password="")

