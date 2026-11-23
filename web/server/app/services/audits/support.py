"""Which audit-source URLs a spider can collect.

The scheduler decides what to scan, and `services/scheduler/fetcher.py` holds the
authoritative allow-list. The web tier needs the same answer to flag a source
that will never produce reports, but it must not import the scheduler (which
pulls in Scrapy on a different container). Keeping the rule here, as data,
avoids two divergent copies.
"""

from urllib.parse import urlsplit

#: `(hostnames, path predicate)` per supported source. Kept declarative so a new
#: spider needs one entry, and so the web tier and tests can read it.
SUPPORTED_SOURCES = (
    {
        "spider": "seattle_wa",
        "label": "Seattle City Auditor reports",
        "hosts": ("www.seattle.gov", "seattle.gov"),
        "paths": ("/city-auditor/reports",),
        "prefix": False,
    },
    {
        "spider": "portland_or",
        "label": "Portland eFiles records",
        "hosts": ("efiles.portlandoregon.gov",),
        "paths": ("/record",),
        "prefix": True,
    },
)


def spider_for_url(source_url):
    """The spider name that can handle `source_url`, or `None`.

    Returns `None` for a malformed URL as well as an unsupported one, because
    from the UI's point of view both mean "this will never scan".
    """
    try:
        url = urlsplit(source_url or "")
    except (TypeError, ValueError):
        return None

    if url.scheme not in ("http", "https") or url.username or url.password:
        return None

    host = (url.hostname or "").lower()
    path = url.path.rstrip("/") or "/"

    for source in SUPPORTED_SOURCES:
        if host not in source["hosts"]:
            continue
        for allowed in source["paths"]:
            allowed = allowed.rstrip("/") or "/"
            if path == allowed or (source["prefix"] and path.startswith(allowed + "/")):
                return source["spider"]

    return None


def is_supported(source_url):
    """True when some spider can collect this source."""
    return spider_for_url(source_url) is not None


def supported_source_labels():
    """Human-readable descriptions of everything that can be scanned."""
    return [
        {"spider": source["spider"], "label": source["label"],
         "example": f"https://{source['hosts'][0]}{source['paths'][0]}"}
        for source in SUPPORTED_SOURCES
    ]
