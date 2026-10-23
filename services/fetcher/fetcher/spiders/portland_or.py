import scrapy


class PortlandORSpider(scrapy.Spider):
    name = "portland_or"
    start_urls = [
        "https://efiles.portlandoregon.gov/record?q=recContainerEx%3a3753929&sortBy=recCreatedOn-&nb=true&pageSize=15&start=1"
    ]
    custom_settings = {"ITEM_PIPELINES": {"fetcher.pipelines.PdfPipeline": 1}, "FILES_STORE": "./files/portland_or"}

    def parse(self, response):
        yield {
            "file_urls": [
                response.urljoin(item + "file/document")
                for item in response.xpath(
                    "/html/body/table/tbody/tr/td[4]/a/@href"
                ).getall()
            ]
        }
