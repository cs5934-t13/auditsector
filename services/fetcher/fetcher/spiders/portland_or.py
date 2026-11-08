from fetcher.spiders import BaseSpider


class PortlandORSpider(BaseSpider):
    name = "portland_or"
    start_urls = [
        "https://efiles.portlandoregon.gov/record?q=recContainerEx%3a3753929&sortBy=recCreatedOn-&nb=true&pageSize=15&start=1"
    ]
    custom_settings = {
        "ITEM_PIPELINES": {"scrapy.pipelines.files.FilesPipeline": 100,
                           "fetcher.pipelines.SummarizeTagPipeline": 200},
        "FILES_STORE": "./files/portland_or",
    }

    def parse(self, response):
        duplicates = self.get_download_urls()
        print(f"Duplicates: {duplicates}")

        file_urls = [
            response.urljoin(item + "file/document")
            for item in response.xpath(
                "/html/body/table/tbody/tr/td[4]/a/@href"
            ).getall()
            if response.urljoin(item + "file/document") not in duplicates
        ]

        self.record_download(file_urls)

        yield {"file_urls": file_urls}
