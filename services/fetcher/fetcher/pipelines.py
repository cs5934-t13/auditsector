# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html


# useful for handling different item types with a single interface
import os

import pymysql
from fetcher.ai.pipeline import process_audit
from fetcher.classes import Audit
from scrapy.pipelines.files import FilesPipeline


class FetcherPipeline:
    def process_item(self, item):
        return item


class PdfPipeline(FilesPipeline):
    def file_path(self, request, response=None, info=None, *, item=None):
        # Currently hard-coded to Portland, OR URLs
        filename = request.url.split("/")[-3]
        return f"{filename}.pdf"


class SummarizeTagPipeline:
    def process_item(self, item, spider):
        audits = []

        connection = pymysql.connect(
            host="localhost",
            user="root",
            password=os.environ["MYSQL_ROOT_PASSWORD"],
            database="auditsector",
            cursorclass=pymysql.cursors.DictCursor,
        )

        with connection, connection.cursor() as cur:
            cur.execute("SELECT * FROM tags;")
            tags = cur.fetchall()
            tag_lookup = {tag["name"]: tag["tag_id"] for tag in tags}

        for file in item["files"]:
            path = f"files/{spider.name}/{file["path"]}"
            processed_audit = process_audit(path)

            audit = Audit()
            audit.title = processed_audit["file_name"]
            audit.summary = processed_audit["summary"]
            audit.tags = [ tag_lookup[tag["tag"]] for tag in processed_audit["tags"]]


            audits.append(audit)

        insert_audit_query = """
            INSERT INTO audit_headers (
                audit_id,
                schedule_id,
                title,
                audit_date,
                risk_level,
                run_status,
                summary
                created_at)
            VALUES (
                %(uuid)s,
                %(schedule_id)s,
                %(title)s,
                %(audit_date)s,
                %(risk_level)s,
                %(run_status)s,
                %(summary)s,
                NOW()
                )
        """
        insert_audit_tags_query = """
            INSERT INTO audit_tags (audit_id, tag_id)
                VALUES (%(audit_id)s, %(tag_id)s)
        """


        for audit in audits:
            with connection, connection.cursor() as cur:

                cur.execute(insert_audit_query, audit.insert_audit_dict())
                cur.executemany(insert_audit_tags_query, audit.insert_tags_dict_list())
                connection.commit()

        return item
