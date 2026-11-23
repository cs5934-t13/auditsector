"""Classify an audit report's risk level, and build the summary prompt.

``audit_headers.risk_level`` is
``ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NULL``, but the fetcher
hardcoded ``INFO`` for every report, so the column carried no information and
the homepage "Risk levels over time" chart only ever showed one series.

Severity is assigned by the same LLM call that writes the summary, which keeps
the number of requests per PDF unchanged. Everything here except
:func:`classify_report` is a pure function over text, so the prompt and the
response parsing are testable without a model.

The levels, their order, and this guidance are duplicated in
``web/client/app/src/content/riskLevels.ts`` for display; the database enum is
the contract between them.
"""

import json
import os
import re

import requests

#: Every storable value, least to most severe. Matches the column's ENUM order.
RISK_LEVELS = ("INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL")

#: One line per level, phrased as evidence to look for rather than a score, so
#: the model has to point at the report's own findings.
RISK_GUIDANCE = {
    "INFO": (
        "No actionable findings; the report informs, describes activity, or "
        "confirms compliance with nothing materially wrong."
    ),
    "LOW": (
        "Minor or administrative weaknesses with limited impact, affecting a "
        "small part of operations and correctable through normal supervision."
    ),
    "MEDIUM": (
        "Control weaknesses or performance gaps that need a planned corrective "
        "response, with moderate impact or a scope narrower than a whole program."
    ),
    "HIGH": (
        "Significant weaknesses with material financial, operational, legal, or "
        "reputational impact, or findings that recur across reports and have not "
        "been corrected; prompt action is warranted."
    ),
    "CRITICAL": (
        "Severe or systemic failure, including fraud, safety risk, loss of a "
        "core service, or large-scale financial loss, requiring immediate action."
    ),
}

_TAG_LEVELS = ", ".join(RISK_LEVELS)

#: Bounds the prompt the same way the summary alone was bounded.
MAX_TEXT_CHARS = 12000

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)
_WS_RE = re.compile(r"\s+")


def build_prompt(audit_text):
    """The single prompt that asks for both the summary and the risk level.

    The summary rules are unchanged from the summary-only prompt, so this is a
    drop-in replacement that returns one extra field.
    """
    guidance = "\n".join(
        f"- {level}: {RISK_GUIDANCE[level]}" for level in RISK_LEVELS
    )

    return f"""
Read the following government audit report. Produce a summary and assign one
risk level.

SUMMARY REQUIREMENTS:
- Exactly 4 sentences
- Focus only on the most important findings and outcomes
- Include the main problem, the most important result, and the main recommended direction
- Do not include minor details
- Do not invent facts
- Use only information supported by the audit text

RISK LEVEL:
Choose exactly one of: {_TAG_LEVELS}
Base the level on the MOST SERIOUS finding the report substantiates, not on the
number of findings and not on the audit's subject matter. A report about a
sensitive topic that found nothing wrong is INFO. Do not inflate the level, and
do not infer wrongdoing the report does not state.

- INFO: {RISK_GUIDANCE["INFO"]}
- LOW: {RISK_GUIDANCE["LOW"]}
- MEDIUM: {RISK_GUIDANCE["MEDIUM"]}
- HIGH: {RISK_GUIDANCE["HIGH"]}
- CRITICAL: {RISK_GUIDANCE["CRITICAL"]}

Guidance reference:
{guidance}

Return JSON only, in exactly this shape:
{{
  "summary": "The four-sentence summary.",
  "risk_level": "MEDIUM"
}}

AUDIT TEXT:
{audit_text[:MAX_TEXT_CHARS]}
"""


def _strip_code_fence(content):
    """Removes a markdown code fence around a JSON reply, when present."""
    return _FENCE_RE.sub("", (content or "").strip())


def normalize_risk_level(value):
    """A storable level, or `None` when the model's answer is unusable.

    Accepts case and surrounding whitespace, because models vary; anything not
    in the enum, including a descriptive phrase, is discarded rather than
    coerced into a level the report did not earn.
    """
    if not isinstance(value, str):
        return None

    level = _WS_RE.sub(" ", value).strip().strip(".").upper()
    return level if level in RISK_LEVELS else None


def parse_response(content):
    """`{"summary": str, "risk_level": str | None}` from the model's reply.

    Tolerates a code fence, leading prose, and a reply that is only the summary:
    the summary is recovered whenever possible, and the risk level is `None`
    rather than guessed. A reply with no usable summary raises `ValueError`,
    which the caller treats as a failed scan.
    """
    text = _strip_code_fence(content)

    payload = None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        # Models sometimes wrap JSON in explanation. Salvage the outer object.
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                payload = json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                payload = None

    if not isinstance(payload, dict):
        # No JSON at all: keep the prose as the summary, as the old prompt did.
        summary = _WS_RE.sub(" ", text).strip()
        if not summary:
            raise ValueError("Model returned no summary")
        return {"summary": summary, "risk_level": None}

    summary = payload.get("summary")
    if isinstance(summary, list):
        summary = " ".join(str(part) for part in summary)
    summary = _WS_RE.sub(" ", str(summary or "")).strip()
    if not summary:
        raise ValueError("Model returned no summary")

    return {
        "summary": summary,
        "risk_level": normalize_risk_level(payload.get("risk_level")),
    }


def _endpoint(base_url):
    """Chat-completions URL from `LLM_API_URL`, accepting either form.

    The deploy-time value may already include the path, and the API only accepts
    POSTs there; posting to ``.../api/v1`` returns 405.
    """
    if not base_url:
        raise ValueError("LLM_API_URL environment variable is not set")

    base_url = base_url.rstrip("/")
    suffix = "/chat/completions"
    return base_url if base_url.endswith(suffix) else base_url + suffix


def classify_report(audit_text, api_key=None, base_url=None, timeout=120):
    """Summary and risk level for one report, in a single request.

    `api_key` and `base_url` default to `LLM_API_KEY` and `LLM_API_URL`, read at
    call time rather than import time so a value set after import is still seen.
    """
    api_key = api_key or os.getenv("LLM_API_KEY")
    if not api_key:
        raise ValueError("LLM_API_KEY environment variable is not set")

    payload = {
        "model": "gpt-oss-120b",
        "messages": [{"role": "user", "content": build_prompt(audit_text)}],
        "temperature": 0.2,
    }

    response = requests.post(
        _endpoint(base_url or os.getenv("LLM_API_URL")),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=timeout,
    )
    response.raise_for_status()

    content = response.json()["choices"][0]["message"]["content"]
    return parse_response(content)
