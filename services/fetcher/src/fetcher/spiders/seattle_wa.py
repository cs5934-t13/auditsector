import scrapy


class SeattleWASpider(scrapy.Spider):
    name = "seattle_wa"
    start_urls = ["https://www.seattle.gov/city-auditor/reports"]
    custom_settings = {
        "FILES_STORE": f"./files/{name}",
    }

    def parse(self, response):

        print(response)
        yield {
            "file_urls": [
                response.urljoin(item)
                for item in response.xpath(
                    "/html/body/div/div/div/div/div/div/div/div/main/div/div/div/div/div/h3/a/@href"
                ).getall()
            ]
        }
