"""Run AW-26 in its own Podman pod; never attach tests to the normal web pod."""

import argparse
import getpass
import os
from pathlib import Path
import secrets
import subprocess
import sys
import uuid


def command(args, *, capture=False, check=True):
    return subprocess.run(args, check=check, text=True,
        stdout=subprocess.PIPE if capture else None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", action="store_true", help="Also start the built UI and real API for browser checks; Ctrl-C cleans up.")
    parser.add_argument("--port", type=int, default=18082, help="Loopback HTTP port for --browser (default: 18082).")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("port must be between 1024 and 65535")

    root = Path(__file__).resolve().parents[3]
    token = uuid.uuid4().hex
    name = "aw26-" + token[:12]
    server = name + "-server"
    server_image = "localhost/auditsector-aw26-server:" + token[:12]
    client_image = "localhost/auditsector-aw26-client:" + token[:12]
    owned_images = []
    pod_created = False
    # Only generated test credentials are passed by environment; no real secrets.yaml.
    previous = {key: os.environ.get(key) for key in
        ("MYSQL_ROOT_PASSWORD", "FLASK_SECRET_KEY", "AW26_RUN_ID", "AW26_BROWSER_PASSWORD")}
    os.environ.update(MYSQL_ROOT_PASSWORD=secrets.token_urlsafe(32),
        FLASK_SECRET_KEY=secrets.token_urlsafe(32), AW26_RUN_ID=token)
    try:
        print("Building the current Flask application for AW-26...", flush=True)
        owned_images.append(server_image)
        command(["podman", "build", "--pull=never", "-q", "-f", str(root / "web/server/Containerfile"),
            "-t", server_image, str(root / "web/server")])
        pod_args = ["podman", "pod", "create", "--name", name, "--label", "auditsector.aw26=" + token]
        if args.browser:
            pod_args += ["--publish", f"127.0.0.1:{args.port}:80"]
        command(pod_args)
        pod_created = True
        command(["podman", "run", "-d", "--pull=never", "--pod", name, "--name", name + "-db",
            "--tmpfs", "/var/lib/mysql:rw,size=512m", "--env", "MYSQL_ROOT_PASSWORD",
            "--env", "MYSQL_DATABASE=auditsector", "docker.io/library/mysql:latest"])
        command(["podman", "run", "-d", "--pull=never", "--pod", name, "--name", server,
            "--env", "MYSQL_ROOT_PASSWORD", "--env", "FLASK_SECRET_KEY", "--env", "AW26_RUN_ID",
            server_image, "sleep", "infinity"])
        command(["podman", "exec", server, "mkdir", "-p", "/aw26/tests", "/aw26/sql"])
        command(["podman", "cp", str(Path(__file__).parent) + "/.", server + ":/aw26/tests"])
        command(["podman", "cp", str(root / "data/scripts") + "/.", server + ":/aw26/sql"])
        print("Waiting for the disposable MySQL instance...", flush=True)
        command(["podman", "exec", server, "python", "-c", """
import time
from app import get_db_connection
for attempt in range(90):
    try:
        get_db_connection().close()
        print('Disposable MySQL ready', flush=True)
        break
    except Exception:
        if attempt == 89: raise SystemExit('Disposable MySQL did not become ready')
        time.sleep(1)
"""])
        command(["podman", "exec", "--workdir", "/aw26/tests", server, "python", "-c",
            "from test_sources import initialize_database; initialize_database()"])
        command(["podman", "exec", server, "python", "-m", "unittest", "discover", "-s", "/aw26/tests", "-v"])
        command(["podman", "exec", "--workdir", "/aw26/tests", server, "python", "-c", """
from test_sources import assert_owned_database, query
assert_owned_database()
for table in ('schedules', 'users', 'audit_headers'):
    assert query('SELECT COUNT(*) AS n FROM '+table)[0]['n'] == 0, table
print('PASS: no test users, schedules, or audits remain')
"""])
        if args.browser:
            if not os.environ.get("AW26_BROWSER_PASSWORD"):
                password = getpass.getpass("Choose a temporary password for aw26_browser (not shown): ")
                if not password:
                    raise ValueError("Temporary browser password must not be empty")
                os.environ["AW26_BROWSER_PASSWORD"] = password
            command(["podman", "exec", "--env", "AW26_BROWSER_PASSWORD", "--workdir", "/aw26/tests",
                server, "python", "-c", "from test_sources import create_browser_user; create_browser_user()"])
            print("Building the current frontend for the real browser flow...", flush=True)
            owned_images.append(client_image)
            command(["podman", "build", "--pull=never", "-q", "-f", str(root / "web/client/Containerfile"),
                "-t", client_image, str(root / "web/client")])
            command(["podman", "exec", "-d", server, "flask", "run"])
            command(["podman", "run", "-d", "--pull=never", "--pod", name, "--name", name + "-client", client_image])
            print(f"\nAW-26 browser URL: http://127.0.0.1:{args.port}/audits\n"
                f"Temporary username: aw26_browser\nTest server: {server}\n"
                "Normal web pod is untouched. Ctrl-C removes this test pod and its data.\n", flush=True)
            # Keep cleanup in this process. It must own the pod for its whole lifetime.
            import time
            while True:
                time.sleep(1)
    finally:
        if pod_created:
            print("Removing only the AW-26 test pod and its in-memory database...", flush=True)
            command(["podman", "pod", "rm", "--force", name], check=False)
            remains = command(["podman", "pod", "exists", name], check=False, capture=True)
            if remains.returncode != 1:
                raise RuntimeError("Could not confirm AW-26 pod cleanup: " + name)
        for image in owned_images:
            command(["podman", "image", "rm", image], check=False, capture=True)
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("AW-26 browser check stopped; test resources cleaned up.")
    except (subprocess.CalledProcessError, RuntimeError, ValueError) as error:
        print(f"AW-26 failed: {error}", file=sys.stderr)
        sys.exit(1)
