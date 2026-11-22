"""Guards the SQL directory resolution that broke database seeding.

`db_init.py` used to hardcode `/sql`. Neither layout has that path:

* the image copies the seed files to `/app/sql` (`WORKDIR /app` +
  `COPY scripts/*.sql ./sql/`);
* the repository keeps `db_init.py` and the `.sql` files side by side in
  `data/scripts/`.

Every run therefore raised FileNotFoundError before executing a single file, so
no seed data — including the tag list — was ever applied. These tests pin the
resolution for both layouts and check that a bad directory fails loudly and
early, before any partial initialization.

No database connection is involved: `init_db` validates the files first.
"""

import shutil
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"

# Import the script directly; it is not an installed module.
sys.path.insert(0, str(SCRIPTS_DIR))

import db_init  # noqa: E402


def test_repo_layout_resolves_to_the_scripts_directory():
    """Locally the SQL sits beside db_init.py (no nested `sql/`)."""
    assert not (SCRIPTS_DIR / "sql").is_dir(), (
        "unexpected data/scripts/sql — remove it or this test no longer covers "
        "the flat layout"
    )
    assert db_init.resolve_sql_dir() == SCRIPTS_DIR


def test_image_layout_prefers_the_nested_sql_directory(tmp_path):
    """The image nests the files under `<script dir>/sql`."""
    (tmp_path / "sql").mkdir()
    assert db_init._sql_dir_for(tmp_path) == tmp_path / "sql"


def test_flat_layout_falls_back_to_the_script_directory(tmp_path):
    assert db_init._sql_dir_for(tmp_path) == tmp_path


def test_sql_dir_environment_override(tmp_path, monkeypatch):
    monkeypatch.setenv("SQL_DIR", str(tmp_path))
    assert db_init.resolve_sql_dir() == tmp_path


def test_every_seed_file_exists_in_the_repo():
    sql_dir = db_init.resolve_sql_dir()
    missing = [name for name in db_init.SQL_FILES if not (sql_dir / name).is_file()]
    assert not missing, f"SQL_FILES references missing files: {missing}"


def test_tag_seed_is_registered_and_includes_every_tag():
    assert "init_tag_data.sql" in db_init.SQL_FILES

    text = (db_init.resolve_sql_dir() / "init_tag_data.sql").read_text()
    # The client's seed list and this file must not drift apart.
    assert "Credentiality of Employees" in text

    # Every seeded tuple carries a name, an inclusion rule and a boundary, so
    # the count of name literals equals the number of tags.
    seed = seed_rows()
    assert len(seed) == 11
    assert [row[0] for row in seed][-1] == "Credentiality of Employees"


def seed_rows():
    """Parses the `(name, description, boundary)` tuples out of the seed file.

    Kept deliberately simple: the file is machine-generated-ish SQL with one
    tuple per tag, so a regex over the quoted strings is enough and avoids
    pulling in an SQL parser.
    """
    import re

    text = (db_init.resolve_sql_dir() / "init_tag_data.sql").read_text()
    body = text.split("VALUES", 1)[1].split("AS new", 1)[0]
    tuples = re.findall(
        r"\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*\)",
        body,
    )
    return [tuple(value.replace("''", "'") for value in row) for row in tuples]


def test_every_seed_tag_has_a_description_and_a_boundary():
    for name, description, boundary in seed_rows():
        assert description.strip(), f"{name} has no description"
        assert boundary.strip(), f"{name} has no boundary"


def test_seed_refreshes_existing_rows():
    """`INSERT IGNORE` would skip the 11 tags a live database already has."""
    raw = (db_init.resolve_sql_dir() / "init_tag_data.sql").read_text()
    # Comments legitimately discuss the old behaviour, so strip them before
    # asserting on the statement itself.
    statements = "\n".join(
        line for line in raw.splitlines() if not line.lstrip().startswith("--")
    )

    assert "ON DUPLICATE KEY UPDATE" in statements
    updates = statements.split("ON DUPLICATE KEY UPDATE", 1)[1]
    assert "description" in updates
    assert "boundary" in updates
    # The statement must not skip an existing row, or the rule never lands.
    assert "IGNORE" not in statements.upper()


def test_late_columns_cover_the_tag_rule():
    """A legacy `tags` table gains both rule columns before the seed runs."""
    columns = {(table, column) for table, column, _ in db_init.LATE_COLUMNS}
    assert ("tags", "description") in columns
    assert ("tags", "boundary") in columns


def test_late_columns_cover_the_contact_setting():
    """`init_settings.sql` is CREATE TABLE IF NOT EXISTS, so a legacy
    `app_settings` table needs `contact` added explicitly."""
    columns = {(table, column) for table, column, _ in db_init.LATE_COLUMNS}
    assert ("app_settings", "contact") in columns


def test_missing_files_raise_before_connecting(tmp_path):
    """A bad directory fails with one clear error, not a partial initialization."""
    with pytest.raises(FileNotFoundError) as raised:
        db_init.init_db(tmp_path)

    message = str(raised.value)
    # Names the directory and a missing file, and explains the cause.
    assert str(tmp_path) in message
    assert "init_users.sql" in message
    assert "Containerfile" in message


def test_nested_layout_passes_validation(tmp_path, monkeypatch):
    """The packaged layout is accepted, and validation happens before connecting."""
    sql_dir = tmp_path / "sql"
    sql_dir.mkdir()
    for name in db_init.SQL_FILES:
        shutil.copy(SCRIPTS_DIR / name, sql_dir / name)

    def stop_before_connecting(*args, **kwargs):
        raise SystemExit("reached connect_db")

    monkeypatch.setattr(db_init, "connect_db", stop_before_connecting)

    # No FileNotFoundError: the files were found, so it proceeded to connect.
    with pytest.raises(SystemExit):
        db_init.init_db(sql_dir)


def test_tag_seed_is_not_gated_on_dummy_data():
    """Schema and tag seeds run for every deployment; demo users do not."""
    assert "init_tag_data.sql" in db_init.SQL_FILES
    assert "init_audits.sql" in db_init.SQL_FILES
