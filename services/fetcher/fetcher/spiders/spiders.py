"""Spiders for the remaining collection pages in services/sample_pages.csv."""

from fetcher.spiders import BaseSpider


class PdfListingSpider(BaseSpider):
    pdf_xpath = "//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"

    def parse(self, response):
        urls = [
            response.urljoin(url) for url in response.xpath(self.pdf_xpath).getall()
        ]
        yield {"file_urls": self.new_files(urls)}


class LinkedPdfListingSpider(PdfListingSpider):
    detail_xpath = ""

    def parse(self, response):
        pdf_urls = [
            response.urljoin(url) for url in response.xpath(self.pdf_xpath).getall()
        ]
        detail_urls = list(
            dict.fromkeys(
                response.urljoin(url)
                for url in response.xpath(self.detail_xpath).getall()
            )
        )
        if pdf_urls:
            yield {"file_urls": self.new_files(pdf_urls)}
        if not pdf_urls and not detail_urls:
            raise ValueError("No report pages or PDFs found on the collection page")
        for url in detail_urls:
            yield response.follow(url, callback=self.parse_report)

    def parse_report(self, response):
        urls = [response.urljoin(url) for url in response.xpath(self.pdf_xpath).getall()]
        yield {"file_urls": self.new_files(urls)}


class TulsaOKSpider(PdfListingSpider):
    name = "tulsa_ok"
    start_urls = ["https://www.cityoftulsa.org/government/internal-audit-reports/"]
    custom_settings = {"FILES_STORE": "./files/tulsa_ok"}
    pdf_xpath = "//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"


class ClarkCountyWASpider(PdfListingSpider):
    name = "clark_wa"
    start_urls = ["https://clark.wa.gov/auditor/auditor-documents"]
    custom_settings = {"FILES_STORE": "./files/clark_wa"}
    pdf_xpath = (
        "//main//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf') "
        "and (contains(translate(@href, 'REPORT', 'report'), 'report') "
        "or contains(translate(string(.), 'REPORT', 'report'), 'report'))]/@href"
    )


class DenverCOSpider(PdfListingSpider):
    name = "denver_co"
    start_urls = [
        "https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Auditors-Office/Audit-Services/Audit-Reports"
    ]
    custom_settings = {"FILES_STORE": "./files/denver_co"}
    pdf_xpath = (
        "//a[contains(@href, '/audit-reports/') "
        "and contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"
    )


class KingCountyWASpider(LinkedPdfListingSpider):
    name = "king_county_wa"
    start_urls = [
        "https://kingcounty.gov/en/independents/governance-and-leadership/government-oversight/auditors-office/reports-papers"
    ]
    custom_settings = {"FILES_STORE": "./files/king_county_wa"}
    pdf_xpath = "//main//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"
    detail_xpath = (
        "//main//a[contains(@href, '/reports-papers/annual-reports') "
        "or contains(@href, '/reports-papers/papers')]/@href"
    )


class MaricopaAZSpider(LinkedPdfListingSpider):
    name = "maricopa_az"
    start_urls = ["https://www.azauditor.gov/counties/maricopa-county"]
    custom_settings = {"FILES_STORE": "./files/maricopa_az"}
    pdf_xpath = "//main//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"
    detail_xpath = (
        "//main//a[contains(@href, 'maricopa-county') and contains(@href, 'reports')]/@href"
    )


class PortlandAuditReportsOnlineSpider(PdfListingSpider):
    name = "portland_audit_reports"
    start_urls = [
        "https://www.portland.gov/auditor/audit-services/about-us/audit-reports-online"
    ]
    custom_settings = {"FILES_STORE": "./files/portland_audit_reports"}
    record_xpath = "//main//a[contains(@href, 'efiles.portlandoregon.gov/record/')]/@href"

    def parse(self, response):
        urls = [
            response.urljoin(url.rstrip("/") + "/file/document")
            for url in response.xpath(self.record_xpath).getall()
        ]
        yield {"file_urls": self.new_files(urls)}


class PortlandAuditServicesSpider(LinkedPdfListingSpider):
    name = "portland_audit_services"
    start_urls = ["https://www.portland.gov/auditor/audit-services"]
    custom_settings = {"FILES_STORE": "./files/portland_audit_services"}
    pdf_xpath = "//main//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"
    detail_xpath = (
        "//main//a[contains(@href, '/auditor/audit-services/audit-reports') "
        "or contains(@href, '/auditor/all-audit-reports')]/@href"
    )
    record_xpath = "//main//a[contains(@href, 'efiles.portlandoregon.gov/record/')]/@href"

    def parse_report(self, response):
        record_urls = [
            response.urljoin(url.rstrip("/") + "/file/document")
            for url in response.xpath(self.record_xpath).getall()
        ]
        pdf_urls = [
            response.urljoin(url) for url in response.xpath(self.pdf_xpath).getall()
        ]
        urls = list(dict.fromkeys(record_urls + pdf_urls))
        yield {"file_urls": self.new_files(urls)}


class SacramentoCASpider(LinkedPdfListingSpider):
    name = "sacramento_ca"
    start_urls = ["https://www.cityofsacramento.gov/auditor"]
    custom_settings = {"FILES_STORE": "./files/sacramento_ca"}
    pdf_xpath = "//main//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"
    detail_xpath = "//a[contains(@href, '/auditor/our-reports/audit-reports')]/@href"


class SanDiegoCASpider(PdfListingSpider):
    name = "san_diego_ca"
    start_urls = ["https://www.sandiego.gov/auditor/reports"]
    custom_settings = {"FILES_STORE": "./files/san_diego_ca"}
    pdf_xpath = "//main//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"


class SanFranciscoCASpider(PdfListingSpider):
    name = "san_francisco_ca"
    start_urls = ["https://www.sf.gov/information--city-services-auditor"]
    custom_settings = {"FILES_STORE": "./files/san_francisco_ca"}
    pdf_xpath = "//main//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"


class SanJoseCASpider(PdfListingSpider):
    name = "san_jose_ca"
    start_urls = [
        "https://www.sanjoseca.gov/your-government/appointees/city-auditor/audit-reports-4828"
    ]
    custom_settings = {"FILES_STORE": "./files/san_jose_ca"}
    pdf_xpath = "//main//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf')]/@href"


class VirginiaBeachVASpider(PdfListingSpider):
    name = "virginia_beach_va"
    start_urls = ["https://auditor.virginiabeach.gov/"]
    custom_settings = {"FILES_STORE": "./files/virginia_beach_va"}
    pdf_xpath = (
        "//a[contains(translate(@href, 'PDF', 'pdf'), '.pdf') "
        "and contains(translate(@href, 'REPORT', 'report'), 'report') "
        "and not(contains(translate(@href, 'SCHEDULE', 'schedule'), 'schedule'))]/@href"
    )
