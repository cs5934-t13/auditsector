"""Common source identity and committed-download lookup for collection spiders."""

import scrapy
from fetcher.storage import connect_db


class BaseSpider(scrapy.Spider):
    def __init__(self, *args, source_url=None, schedule_id=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.schedule_id = int(schedule_id or 0)
        if self.schedule_id < 1:
            raise ValueError("A real schedule_id is required")
        if source_url:
            self.start_urls = [source_url]

    def get_download_urls(self):
        with connect_db() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT fetch_url FROM fetches WHERE spider_id=%s", (self.name,)
            )
            return {row["fetch_url"] for row in cur.fetchall()}

    def new_files(self, urls):
        urls = list(dict.fromkeys(urls))
        if not urls:
            raise ValueError(
                "No report links found; check the collection page selector"
            )
        done = self.get_download_urls()
        return [url for url in urls if url not in done]
