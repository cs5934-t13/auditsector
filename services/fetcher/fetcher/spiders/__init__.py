"""Common source identity, committed-download lookup, and progress for spiders."""

import scrapy
from fetcher.progress import record_total
from fetcher.storage import connect_db


class BaseSpider(scrapy.Spider):
    def __init__(self, *args, source_url=None, schedule_id=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.schedule_id = int(schedule_id or 0)
        if self.schedule_id < 1:
            raise ValueError("A real schedule_id is required")
        if source_url:
            self.start_urls = [source_url]
        # Reports this source listed, once the index has been parsed.
        self.discovered_total = 0

    def get_processed_urls(self):
        """URLs already committed to `audit_headers`.

        Only `PROCESSED` receipts suppress a download. A `DOWNLOADED` receipt
        means the file is on disk but its report never made it into the
        database, so the file still needs processing (and re-fetching it is
        cheap because `FilesPipeline` keeps the file in `FILES_STORE`).
        """
        with connect_db() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT fetch_url FROM fetches "
                "WHERE spider_id=%s AND status='PROCESSED'",
                (self.name,),
            )
            return {row["fetch_url"] for row in cur.fetchall()}

    def new_files(self, urls):
        urls = list(dict.fromkeys(urls))
        if not urls:
            raise ValueError(
                "No report links found; check the collection page selector"
            )
        done = self.get_processed_urls()
        pending = [url for url in urls if url not in done]

        # Report progress as soon as the index is understood, so the UI can show
        # a denominator instead of an indefinite spinner.
        if pending:
            self.discovered_total = len(pending)
            record_total(self.schedule_id, len(pending))
        return pending
