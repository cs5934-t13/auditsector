# This package will contain the spiders of your Scrapy project
#
# Please refer to the documentation for information on how to create and manage
# your spiders.
import os

import pymysql.cursors
import scrapy


class BaseSpider(scrapy.Spider):
    def record_download(self, urls):
        # Save a download URL to the `fetches` table
        connection = pymysql.connect(
            host="localhost",
            user="root",
            password=os.environ["MYSQL_ROOT_PASSWORD"],
            database="auditsector",
            cursorclass=pymysql.cursors.DictCursor,
        )

        with connection, connection.cursor() as cursor:
            for url in urls:
                sql = "INSERT INTO `fetches` (`spider_id`, `fetch_url`) VALUES(%s, %s)"
                cursor.execute(sql, (self.name, url))
            connection.commit()

    def get_download_urls(self):
        # Retrieve downloaded URLs from the `fetches` table
        connection = pymysql.connect(
            host="localhost",
            user="root",
            password=os.environ["MYSQL_ROOT_PASSWORD"],
            database="auditsector",
            cursorclass=pymysql.cursors.DictCursor,
        )
        with connection, connection.cursor() as cursor:
            sql = "SELECT DISTINCT `fetch_url` FROM `fetches` WHERE `spider_id`=%s"
            cursor.execute(sql, (self.name,))
            result = [row["fetch_url"] for row in cursor.fetchall()]

        return result
