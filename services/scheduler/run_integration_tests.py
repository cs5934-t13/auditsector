"""Run only in a new, unexposed Podman pod with an in-memory MySQL database."""

import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import uuid


def main():
    root = Path(__file__).resolve().parents[2]
    token = uuid.uuid4().hex
    name = "aw98-" + token[:12]
    image = "localhost/auditsector-services:aw98-check"
    env = {
        **os.environ,
        "MYSQL_ROOT_PASSWORD": secrets.token_urlsafe(32),
        "AW98_TEST_RUN": token,
    }

    def command(args, **kwargs):
        return subprocess.run(args, check=True, env=env, **kwargs)

    command(["podman", "build", "-q", "-t", image, str(root / "services")])
    api_image = "localhost/auditsector-server:aw98-check"
    command(["podman", "build", "-q", "-t", api_image, str(root / "web/server")])
    env["FLASK_SECRET_KEY"] = secrets.token_urlsafe(32)
    created = False
    with tempfile.NamedTemporaryFile(
        prefix="aw98-integration-", suffix=".log", delete=False
    ) as log:
        log_path = Path(log.name)
    try:
        command(
            [
                "podman",
                "pod",
                "create",
                "--name",
                name,
                "--label",
                "auditsector.aw98=" + token,
            ]
        )
        created = True
        command(
            [
                "podman",
                "run",
                "-d",
                "--pod",
                name,
                "--name",
                name + "-db",
                "--tmpfs",
                "/var/lib/mysql:rw,size=512m",
                "--env",
                "MYSQL_ROOT_PASSWORD",
                "docker.io/library/mysql:latest",
            ]
        )
        worker = name + "-worker"
        command(
            [
                "podman",
                "run",
                "-d",
                "--pod",
                name,
                "--name",
                worker,
                "--env",
                "MYSQL_ROOT_PASSWORD",
                "--env",
                "AW98_TEST_RUN",
                image,
                "sleep",
                "infinity",
            ]
        )
        command(["podman", "cp", str(root / "data"), worker + ":/data"])
        api = name + "-api"
        command(
            [
                "podman",
                "run",
                "-d",
                "--pod",
                name,
                "--name",
                api,
                "--env",
                "MYSQL_ROOT_PASSWORD",
                "--env",
                "FLASK_SECRET_KEY",
                api_image,
            ]
        )
        env["AW98_TEST_HASH"] = subprocess.check_output(
            [
                "podman",
                "exec",
                "--env",
                "AW98_TEST_RUN",
                api,
                "python",
                "-c",
                "import os; from argon2 import PasswordHasher; print(PasswordHasher().hash(os.environ['AW98_TEST_RUN']))",
            ],
            env=env,
            text=True,
        ).strip()
        initialize = """
import os,time
from pathlib import Path
import pymysql
from pymysql.constants import CLIENT
for attempt in range(60):
    try:
        conn=pymysql.connect(host='127.0.0.1',user='root',password=os.environ['MYSQL_ROOT_PASSWORD'],client_flag=CLIENT.MULTI_STATEMENTS)
        break
    except pymysql.MySQLError:
        if attempt==59: raise
        time.sleep(1)
with conn,conn.cursor() as cur:
    cur.execute('CREATE DATABASE auditsector');cur.execute('USE auditsector')
    for name in ['init_users.sql','init_schedules.sql','init_audits.sql','init_tag_data.sql','init_settings.sql','init_fetches.sql']:
        cur.execute((Path('/data/scripts')/name).read_text())
        while cur.nextset(): pass
    cur.execute('CREATE TABLE aw98_test_guard(token CHAR(32) NOT NULL)')
    cur.execute('INSERT INTO aw98_test_guard VALUES(%s)',(os.environ['AW98_TEST_RUN'],))
    conn.commit()
print('Disposable database initialized')
"""
        command(
            ["podman", "exec", "-i", worker, "uv", "run", "--no-sync", "python", "-"],
            input=initialize,
            text=True,
        )
        with log_path.open("w") as log:
            result = subprocess.run(
                [
                    "podman",
                    "exec",
                    "--env",
                    "AW98_TEST_HASH",
                    worker,
                    "uv",
                    "run",
                    "--no-sync",
                    "python",
                    "-m",
                    "unittest",
                    "discover",
                    "-s",
                    "/services/scheduler",
                    "-p",
                    "test_*.py",
                    "-v",
                ],
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
        print("Integration log:", log_path)
        lines = log_path.read_text().splitlines()
        print(
            "\n".join(
                line
                for line in lines
                if line.startswith(("test_", "Ran ", "OK", "FAILED", "ERROR:", "FAIL:"))
            )[-7000:]
        )
        if result.returncode:
            print("\n".join(lines[-45:]))
            raise RuntimeError("AW-98 verification failed; inspect the integration log")
        print(
            "PASS: scheduler, Scrapy, PDF extraction, local LLM fixture, MySQL, retry, and migration checks"
        )
    finally:
        if created:
            command(["podman", "pod", "rm", "--force", name], stdout=subprocess.DEVNULL)
            if (
                subprocess.run(["podman", "pod", "exists", name], env=env).returncode
                != 1
            ):
                raise RuntimeError("Disposable pod cleanup was not confirmed")
            print("Removed only the disposable AW-98 pod; normal database unchanged")


if __name__ == "__main__":
    main()
