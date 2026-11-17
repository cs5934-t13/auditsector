# Application Layer

The `services` container is a long-running worker placeholder. `Containerfile`
builds from `ghcr.io/astral-sh/uv:debian-slim`, copies the whole directory to
`/services`, and runs `services/test/test.py`.

## Build and run

```sh
podman build -t services services
podman run --pod web -d --name web-services services
```

## Current behaviour

`test/test.py` is a stub: it prints `Debian is running` every 10 seconds and does
nothing else. It is started by `pod.yaml` so the container is present in the pod,
but it is **not required for the web UI** — the client, server, and database do
all the work.

```
services/
├── Containerfile
└── test/test.py      # placeholder loop
```

When the scanning workers are implemented, they belong here: this layer is meant
to read due rows from `schedules` and process each `source_link` at its
`scan_frequency`.

## AI Audit Processing Pipeline

The AI pipeline processes government audit PDFs using PyMuPDF
and Virginia Tech's ARC LLM.

### Components

- `ai/extract.py` - Extracts text from PDF documents.
- `ai/summarize.py` - Generates four-sentence audit summaries.
- `ai/tag.py` - Classifies reports using 10 predefined categories.
- `ai/pipeline.py` - Connects all three components.

### Usage

```python
from ai.pipeline import process_audit

result = process_audit("/path/to/audit.pdf")
```

Run this from the services directory, or ensure `services/`
is on the Python import path.

### Example Output

```json
{
  "file_name": "audit.pdf",
  "page_count": 35,
  "summary": "AI-generated summary...",
  "tags": [
    {
      "tag": "Human Resources",
      "evidence": "Supporting evidence from the audit."
    }
  ]
}
```

### Environment Variables

The pipeline requires:

- `VT_LLM_API_KEY` - Virginia Tech ARC LLM API key

Do not commit API keys or credentials to the repository.

### Current Limitations

- Only the first 12,000 characters are analyzed by the LLM.
- Scanned PDFs without embedded text require OCR.
- The pipeline does not yet store results in MySQL.
- The scraper must supply a local PDF path.
```
