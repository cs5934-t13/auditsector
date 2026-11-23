"""One crawl per process, with an exit status that includes pipeline failures."""

import argparse
from scrapy import signals
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--spider",
        choices=[
            "portland_or",
            "portland_audit_reports",
            "seattle_wa",
            "tulsa_ok",
            "clark_wa",
            "denver_co",
            "king_county_wa",
            "maricopa_az",
            "portland_audit_services",
            "sacramento_ca",
            "san_diego_ca",
            "san_francisco_ca",
            "san_jose_ca",
            "virginia_beach_va",
        ],
        required=True,
    )
    parser.add_argument("--source", required=True)
    parser.add_argument("--schedule-id", type=int, required=True)
    args = parser.parse_args()
    process = CrawlerProcess(get_project_settings())
    crawler = process.create_crawler(args.spider)
    failed = []
    reasons = []

    def error(**kwargs):
        failed.append(True)

    def closed(reason, **kwargs):
        reasons.append(reason)

    for signal in (signals.spider_error, signals.item_error, signals.item_dropped):
        crawler.signals.connect(error, signal=signal, weak=False)
    crawler.signals.connect(closed, signal=signals.spider_closed, weak=False)
    process.crawl(crawler, source_url=args.source, schedule_id=args.schedule_id)
    process.start()
    stats = crawler.stats.get_stats()
    failed_downloads = stats.get("retry/max_reached", 0) or stats.get(
        "httperror/response_ignored_count", 0
    )
    return 1 if failed or failed_downloads or reasons != ["finished"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
