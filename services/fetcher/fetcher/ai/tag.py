
import json
import os

import requests

API_URL = os.getenv("LLM_API_URL")
API_KEY = os.getenv("LLM_API_KEY")

TAG_DEFINITIONS = {
    "Inventory": {
        "include": "Stock, consumable supplies and non-capital small equipment: counts, custody, distribution and safeguarding.",
        "boundary": "Includes small durable items below the fixed-asset threshold; exclude capital-asset lifecycle planning."
    },
    "Fixed Assets": {
        "include": "Acquisition, records, maintenance or disposal of capital assets over $5,000, including major infrastructure.",
        "boundary": "Non-capital equipment alone does not qualify. Construction delivery uses Capital Projects."
    },
    "Payroll and Benefits": {
        "include": "Substantial testing or analysis of pay, timekeeping, leave, benefits or compensation costs, including pay equity and reimbursed payroll costs.",
        "boundary": "Promotion or hiring decisions alone use Human Resources. Labor-law enforcement alone uses Regulatory Compliance."
    },
    "Accounts Receivable": {
        "include": "Government billing, receivables, collection controls and money owed to government, including collection through agents.",
        "boundary": "Exclude private-company customer billing and employee remedies unless government receivables are directly examined."
    },
    "Accounts Payable and Vendors": {
        "include": "Invoice processing, payment authorization, supplier payments and vendor-file controls.",
        "boundary": "Grant or aid allocations and payroll are not automatically Accounts Payable. Contractor mentions or procurement strategy alone do not qualify."
    },
    "Human Resources": {
        "include": "Hiring, termination, promotion decisions, personnel procedures, employee conduct, investigations and workplace training.",
        "boundary": "Pay or benefit amounts alone use Payroll and Benefits. Both tags may apply when each topic is substantially examined."
    },
    "Capital Projects": {
        "include": "Planning, prioritization, budgeting, delivery and oversight of major construction or infrastructure projects.",
        "boundary": "Exclude routine stock and asset-record controls. May overlap Fixed Assets only with evidence for both scopes."
    },
    "Grant Oversight": {
        "include": "Grant or aid program selection, eligibility, allowable spending, compliance, recipient monitoring and outcomes.",
        "boundary": "Funding mentions alone do not qualify. Add another process tag only for separate substantial testing."
    },
    "Information Technology": {
        "include": "IT systems and governance, cybersecurity, logical access, data privacy, surveillance technology and retention controls.",
        "boundary": "Software use or project/personnel data problems alone do not qualify. Physical door or key controls alone are not IT."
    },
    "Regulatory Compliance": {
        "include": "Specific laws, regulations or externally mandated standards are an explicit objective or substantial testing focus.",
        "boundary": "Internal policy or contract testing alone does not qualify. Do not infer illegality."
    }
}


def generate_tags(audit_text):
    """Generate predefined audit categories using the ARC LLM."""

    api_key = API_KEY

    if not api_key:
        raise ValueError(
            "VT_LLM_API_KEY environment variable is not set"
        )

    tag_description = ""

    for tag, definition in TAG_DEFINITIONS.items():
        tag_description += f"""
Tag: {tag}
Use when: {definition["include"]}
Do not use when: {definition["boundary"]}
"""

    prompt = f"""
You are analyzing a government audit report.

Your job is to assign one or more tags from the predefined tag list below.

Only assign a tag when that topic is SUBSTANTIALLY examined in the audit.
Do not assign a tag just because a topic is briefly mentioned.

PREDEFINED TAGS:

{tag_description}

Return JSON only in this exact format:

{{
  "tags": [
    {{
      "tag": "Human Resources",
      "evidence": "Short supporting evidence from the audit"
    }}
  ]
}}

Rules:
- Only use tags listed above.
- Do not create new tags.
- Multiple tags are allowed.
- Every tag must include supporting evidence.
- Evidence must come from the audit text.
- If no category substantially applies, return an empty tags list.

AUDIT TEXT:

{audit_text[:12000]}
"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "gpt-oss-120b",
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.2
    }

    response = requests.post(
        API_URL,
        headers=headers,
        json=payload,
        timeout=120
    )

    response.raise_for_status()

    content = response.json()["choices"][0]["message"]["content"]

    result = json.loads(content)

    # Only allow tags from the predefined list
    valid_tags = []

    for item in result.get("tags", []):
        if item.get("tag") in TAG_DEFINITIONS:
            valid_tags.append({
                "tag": item["tag"],
                "evidence": item.get("evidence", "")
            })

    return {
        "tags": valid_tags
    }
