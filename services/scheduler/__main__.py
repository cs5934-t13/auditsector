"""Run with python -m services.scheduler inside the services image."""

import argparse
import logging
import os
from datetime import datetime, timezone
from trigger_fetcher import scan
from repository import connect_db
from runner import run_forever, run_once


def main():
    parser = argparse.ArgumentParser(description="Run scheduled Scrapy scans")
    parser.add_argument("--once", action="store_true", help="Process one pass and exit")
    parser.add_argument("--poll-seconds", type=float, default=60)
    args = parser.parse_args()
    missing = [
        name
        for name in ("MYSQL_ROOT_PASSWORD", "LLM_API_URL", "LLM_API_KEY")
        if not os.environ.get(name)
    ]
    if missing:
        parser.error("Missing configuration: " + ", ".join(missing))
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    if args.once:
        connection = connect_db()
        try:
            failures = run_once(connection, datetime.now(timezone.utc), scan)
            if failures:
                raise SystemExit(1)
        finally:
            connection.close()
    else:
        run_forever(scan, args.poll_seconds)


if __name__ == "__main__":
    main()
