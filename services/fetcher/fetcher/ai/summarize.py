"""Summary-only helper, kept for callers that do not need a risk level.

The pipeline now uses :func:`fetcher.ai.classify.classify_report`, which returns
the summary and the risk level in one request. This module remains as a thin
wrapper so existing imports keep working, and so there is only one prompt and
one response parser to maintain.

Prefer :func:`classify_report` in new code: it costs the same one request and
also fills ``audit_headers.risk_level``.
"""

from .classify import classify_report


def generate_summary(audit_text):
    """Generate a four-sentence summary of an audit report.

    Delegates to :func:`classify_report` and discards the risk level, so the
    wording of the summary matches what the pipeline stores.
    """
    return classify_report(audit_text)["summary"]
