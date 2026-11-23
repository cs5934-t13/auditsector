"""PDF text extraction, report-title, and publication-date derivation."""

from pathlib import Path

import pymupdf

from .publish_date import derive_publish_date
from .title import derive_title


def extract_pdf(pdf_path, audit_url=None, fallback_date=None):
    """Extract PDF text while preserving page numbers.

    Scrapy stores downloads under content-hashed filenames, so `file_name` is
    not a usable report name; `title` comes from `derive_title`, which prefers
    the embedded metadata title and falls back to the page-1 masthead and the
    filename inside `audit_url`.

    `publish_date` is when the report was published, read from the page-1
    masthead and then from the PDF's creation metadata. `fallback_date` is used
    when neither yields a date, so the value is never `None`.
    """

    pages = []

    with pymupdf.open(pdf_path) as doc:
        page_count = len(doc)
        metadata = doc.metadata or {}
        metadata_title = metadata.get("title")
        metadata_created = metadata.get("creationDate")

        for page_number, page in enumerate(doc, start=1):
            pages.append({
                "page_number": page_number,
                "text": page.get_text().strip()
            })

    file_name = Path(pdf_path).name
    first_page_text = pages[0]["text"] if pages else ""

    return {
        "file_name": file_name,
        "title": derive_title(
            metadata_title=metadata_title,
            first_page_text=first_page_text,
            audit_url=audit_url,
            file_name=file_name,
        ),
        "publish_date": derive_publish_date(
            first_page_text=first_page_text,
            metadata_creation_date=metadata_created,
            fallback=fallback_date,
        ),
        "page_count": page_count,
        "pages": pages
    }
