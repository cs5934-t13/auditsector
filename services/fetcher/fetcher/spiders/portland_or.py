from fetcher.spiders import BaseSpider


class PortlandORSpider(BaseSpider):
    name = "portland_or"
    start_urls = [
        "https://efiles.portlandoregon.gov/record?q=recContainerEx%3a3753929&sortBy=recCreatedOn-&nb=true&pageSize=15&start=1"
    ]
    custom_settings = {"FILES_STORE": "./files/portland_or"}

    def parse(self, response):
        urls = [
            response.urljoin(item.rstrip("/") + "/file/document")
            for item in response.xpath(
                "/html/body/table/tbody/tr/td[4]/a/@href"
            ).getall()
        ]
        yield {"file_urls": self.new_files(urls)}
