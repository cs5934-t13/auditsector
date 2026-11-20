"""Process downloaded PDFs and commit reports and duplicate receipts together."""

from pathlib import Path
from scrapy.pipelines.files import FilesPipeline
from fetcher.ai.pipeline import process_audit
from fetcher.classes import Audit
from fetcher.storage import connect_db


class FetcherPipeline:
    def process_item(self, item):
        return item

class SummarizeTagPipeline:
    @classmethod
    def from_crawler(cls, crawler):
        instance = cls()
        instance.crawler = crawler
        return instance

    def process_item(self, item, spider):
        files = item.get("files", [])
        if len(files) != len(item["file_urls"]):
            raise ValueError("One or more PDFs could not be downloaded")
        store = Path(self.crawler.settings["FILES_STORE"])
        for file in files:
            # Already committed files are skipped even if the item is retried.
            with connect_db() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM fetches WHERE spider_id=%s AND fetch_url=%s",
                    (spider.name, file["url"]),
                )
                if cur.fetchone():
                    continue
            processed = process_audit(store / file["path"])
            audit = Audit(schedule_id=spider.schedule_id, muni=spider.name)
            audit.title = processed["file_name"]
            audit.summary = processed["summary"]
            audit.run_status = "COMPLETED"
            with connect_db() as conn, conn.cursor() as cur:
                cur.execute("SELECT tag_id, name FROM tags")
                tags = {row["name"]: row["tag_id"] for row in cur.fetchall()}
                audit.tags = list(
                    dict.fromkeys(tags[tag["tag"]] for tag in processed["tags"])
                )
                try:
                    cur.execute(
                        """INSERT INTO audit_headers
                        (audit_id, schedule_id, title, muni, audit_date, risk_level,
                         run_status, summary, created_at)
                        VALUES (%(audit_id)s, %(schedule_id)s, %(title)s, %(muni)s,
                         UTC_TIMESTAMP(), %(risk_level)s, %(run_status)s, %(summary)s, UTC_TIMESTAMP())
                        """,
                        audit.insert_audit_dict(),
                    )
                    if audit.tags:
                        cur.executemany(
                            "INSERT INTO audit_tags (audit_id, tag_id) VALUES (%(audit_id)s, %(tag_id)s)",
                            audit.insert_tags_dict_list(),
                        )
                    cur.execute(
                        "INSERT INTO fetches (spider_id, fetch_url) VALUES (%s, %s)",
                        (spider.name, file["url"]),
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise
        return item
