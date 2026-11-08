
from pathlib import Path

from .extract import extract_pdf
from .summarize import generate_summary
from .tag import generate_tags


def process_audit(pdf_path):
    """
    Process an audit PDF through the AI pipeline.

    Returns extracted metadata, an AI-generated summary,
    and predefined classification tags.
    """

    print(pdf_path)
    pdf_path = Path(pdf_path)
    print(pdf_path)

    if not pdf_path.is_file():
        raise FileNotFoundError(
            f"Audit PDF not found: {pdf_path}"
        )

    # Step 1: Extract text from the PDF
    extraction = extract_pdf(pdf_path)

    # Step 2: Combine text from all pages
    audit_text = "\n\n".join(
        page["text"]
        for page in extraction["pages"]
    )

    if not audit_text.strip():
        raise ValueError(
            "No extractable text found in audit PDF"
        )

    # Step 3: Generate AI summary
    summary = generate_summary(audit_text)

    # Step 4: Generate AI classification tags
    tagging_result = generate_tags(audit_text)

    return {
        "file_name": extraction["file_name"],
        "page_count": extraction["page_count"],
        "summary": summary,
        "tags": tagging_result["tags"]
    }
