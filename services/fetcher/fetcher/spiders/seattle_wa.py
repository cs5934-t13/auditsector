from fetcher.spiders import BaseSpider


class SeattleWASpider(BaseSpider):
    name = "seattle_wa"
    start_urls = ["https://www.seattle.gov/city-auditor/reports"]
    custom_settings = {"FILES_STORE": "./files/seattle_wa"}

    def parse(self, response):
        urls = [
            response.urljoin(item)
            for item in response.xpath(
                "/html/body/div/div/div/div/div/div/div/div/main/div/div/div/div/div/h3/a/@href"
            ).getall()
        ]
        yield {"file_urls": self.new_files(urls)}
