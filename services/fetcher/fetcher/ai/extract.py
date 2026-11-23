"""PDF text extraction and report-title derivation."""

from pathlib import Path

import pymupdf

from .title import derive_title


def extract_pdf(pdf_path, audit_url=None):
    """Extract PDF text while preserving page numbers.

    Scrapy stores downloads under content-hashed filenames, so `file_name` is
    not a usable report name; `title` comes from `derive_title`, which prefers
    the embedded metadata title and falls back to the page-1 masthead and the
    filename inside `audit_url`.
    """

    pages = []

    with pymupdf.open(pdf_path) as doc:
        page_count = len(doc)
        metadata_title = (doc.metadata or {}).get("title")

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
        "page_count": page_count,
        "pages": pages
    }
