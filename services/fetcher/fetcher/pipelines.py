# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html


# useful for handling different item types with a single interface
from scrapy.pipelines.files import FilesPipeline


class FetcherPipeline:
    def process_item(self, item):
        return item


class PdfPipeline(FilesPipeline):
    def file_path(self, request, response=None, info=None, *, item=None):
        # Currently hard-coded to Portland, OR URLs
        filename = request.url.split("/")[-3]
        return f"{filename}.pdf"
