
import pymupdf
from pathlib import Path


def extract_pdf(pdf_path):
    """Extract PDF text while preserving page numbers."""

    pages = []

    with pymupdf.open(pdf_path) as doc:
        page_count = len(doc)

        for page_number, page in enumerate(doc, start=1):
            pages.append({
                "page_number": page_number,
                "text": page.get_text().strip()
            })

    return {
        "file_name": Path(pdf_path).name,
        "page_count": page_count,
        "pages": pages
    }
