# Application layer

The services container runs the AW-98 scheduler and Scott's existing Scrapy fetcher.
It reads saved sources, launches supported collection scans, processes downloaded
PDFs, and writes reports, tags, and duplicate receipts to MySQL.

Build with `podman build -f services/Containerfile -t services .`. The container belongs in the
existing web pod and needs MYSQL_ROOT_PASSWORD, LLM_API_URL, and LLM_API_KEY from
Podman secrets. Do not put secret values in commands, documentation, or Git.

See [scheduler instructions](scheduler/README.md) for timing, supported sources,
and the inspect-first migration required by older databases. The existing pod.yaml
already supplies worker environment references; existing containers must be updated
explicitly because rebuilding an image does not replace a running container.

Run `python3 services/scheduler/run_integration_tests.py` from the repository root.
It builds worker/server images and tests real login, source creation, Scrapy, PDF
extraction, a local LLM fixture, report persistence, retries, and migration safety.
Its own temporary MySQL pod has no published ports or persistent database volume.
The local LLM fixture verifies integration, not the availability of the team's ARC service.

The existing AI pipeline is in `fetcher/fetcher/ai/`. Standalone
`from fetcher.ai.pipeline import process_audit` returns a summary and predefined tags;
the Scrapy pipeline persists them. Scanned PDFs without text still require OCR,
audit_date remains ingestion time, and risk still defaults to INFO.
