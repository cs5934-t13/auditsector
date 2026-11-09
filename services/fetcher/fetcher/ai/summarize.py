
import os

import requests

API_URL = os.getenv("LLM_API_URL")
API_KEY = os.getenv("LLM_API_KEY")


def generate_summary(audit_text):
    """Generate a four-sentence summary of an audit report."""

    api_key = API_KEY

    if not api_key:
        raise ValueError("VT_LLM_API_KEY environment variable is not set")

    prompt = f"""
Read the following government audit report and write a concise summary.

Requirements:
- Exactly 4 sentences
- Focus only on the most important findings and outcomes
- Include the main problem, the most important result, and the main recommended direction
- Do not include minor details
- Do not invent facts
- Use only information supported by the audit text

Audit text:
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

    result = response.json()
    summary = result["choices"][0]["message"]["content"]

    return summary.strip()
