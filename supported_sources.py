"""The audit-source URLs this project can collect, in one place.

This is the single source of truth for "can we scan this URL?". It has two
consumers, in two different containers:

* ``services/scheduler/fetcher.py`` decides which spider to launch.
* ``web/server/app/blueprints/sources.py`` rejects an unsupported URL in
  ``POST /sources``, so a stored schedule is scannable by construction.

They previously held separate copies, and the copies drifted: the scheduler grew
to 14 sources while the web tier still knew only Seattle and Portland, so the UI
labelled working sources as unsupported. Anything that answers this question must
read from here.

The file lives at the repository root, which is neutral ground: neither image
depends on the other's package layout. It imports only the standard library, so
the server image can copy it in without pulling in Scrapy or the scheduler.
"""

from urllib.parse import urlsplit

#: How a path is matched.
EXACT = "exact"
PREFIX = "prefix"
SUFFIX = "suffix"

#: One entry per spider. Order is not significant: the matches are disjoint.
#: `paths` are compared against the URL path with a trailing slash removed.
SUPPORTED_SOURCES = (
    {
        "spider": "seattle_wa",
        "label": "Seattle City Auditor",
        "hosts": ("www.seattle.gov", "seattle.gov"),
        "paths": ("/city-auditor/reports",),
        "match": EXACT,
    },
    {
        "spider": "portland_audit_reports",
        "label": "Portland Auditor — Audit Reports Online",
        "hosts": ("www.portland.gov", "portland.gov"),
        "paths": ("/auditor/audit-services/about-us/audit-reports-online",),
        "match": EXACT,
    },
    {
        "spider": "portland_audit_services",
        "label": "Portland Auditor — Audit Services",
        "hosts": ("www.portland.gov", "portland.gov"),
        "paths": ("/auditor/audit-services",),
        "match": EXACT,
    },
    {
        "spider": "portland_or",
        "label": "Portland eFiles records",
        "hosts": ("efiles.portlandoregon.gov",),
        "paths": ("/record",),
        "match": PREFIX,
    },
    {
        "spider": "tulsa_ok",
        "label": "Tulsa Internal Audit reports",
        "hosts": ("www.cityoftulsa.org", "cityoftulsa.org"),
        "paths": ("/government/internal-audit-reports",),
        "match": EXACT,
    },
    {
        "spider": "clark_wa",
        "label": "Clark County WA Auditor documents",
        "hosts": ("clark.wa.gov",),
        "paths": ("/auditor/auditor-documents",),
        "match": EXACT,
    },
    {
        "spider": "denver_co",
        "label": "Denver Auditor's Office reports",
        "hosts": ("denvergov.org", "www.denvergov.org"),
        "paths": ("/Auditors-Office/Audit-Services/Audit-Reports",),
        "match": SUFFIX,
    },
    {
        "spider": "king_county_wa",
        "label": "King County WA Auditor reports and papers",
        "hosts": ("kingcounty.gov", "www.kingcounty.gov"),
        "paths": ("/auditors-office/reports-papers",),
        "match": SUFFIX,
    },
    {
        "spider": "maricopa_az",
        "label": "Arizona Auditor General — Maricopa County",
        "hosts": ("www.azauditor.gov", "azauditor.gov"),
        "paths": ("/counties/maricopa-county",),
        "match": EXACT,
    },
    {
        "spider": "sacramento_ca",
        "label": "Sacramento City Auditor",
        "hosts": ("www.cityofsacramento.gov", "cityofsacramento.gov"),
        "paths": ("/auditor",),
        "match": EXACT,
    },
    {
        "spider": "san_diego_ca",
        "label": "San Diego City Auditor reports",
        "hosts": ("www.sandiego.gov", "sandiego.gov"),
        "paths": ("/auditor/reports",),
        "match": EXACT,
    },
    {
        "spider": "san_francisco_ca",
        "label": "San Francisco City Services Auditor",
        "hosts": ("www.sf.gov", "sf.gov"),
        "paths": ("/information--city-services-auditor",),
        "match": EXACT,
    },
    {
        "spider": "san_jose_ca",
        "label": "San José City Auditor reports",
        "hosts": ("www.sanjoseca.gov", "sanjoseca.gov"),
        "paths": ("/your-government/appointees/city-auditor/audit-reports-4828",),
        "match": EXACT,
    },
    {
        "spider": "virginia_beach_va",
        "label": "Virginia Beach City Auditor",
        "hosts": ("auditor.virginiabeach.gov",),
        # The site's home page is its report index.
        "paths": ("",),
        "match": EXACT,
    },
)


def normalize_path(path):
    """The comparison form of a URL path.

    A trailing slash is not meaningful on these listings, so it is removed. The
    root becomes an empty string so ``virginia_beach_va`` matches it.
    """
    return (path or "").rstrip("/")


def path_matches(path, allowed, match):
    """True when `path` matches `allowed` under the `match` rule."""
    path = normalize_path(path)
    allowed = normalize_path(allowed)

    if match == PREFIX:
        return path == allowed or path.startswith(allowed + "/")
    if match == SUFFIX:
        return path == allowed or path.endswith(allowed)
    return path == allowed


def source_for_url(source_url):
    """The registry entry describing `source_url`, or `None`.

    Returns `None` for a malformed URL as well as an unsupported one; callers
    that need to distinguish those should parse the URL first.
    """
    try:
        url = urlsplit(source_url or "")
    except (TypeError, ValueError):
        return None

    if url.scheme not in ("http", "https") or url.username or url.password:
        return None

    host = (url.hostname or "").lower()

    for source in SUPPORTED_SOURCES:
        if host not in source["hosts"]:
            continue
        if any(
            path_matches(url.path, allowed, source["match"])
            for allowed in source["paths"]
        ):
            return source

    return None


def spider_for_url(source_url):
    """The spider name that can handle `source_url`, or `None`."""
    source = source_for_url(source_url)
    return source["spider"] if source else None


def example_url(source):
    """A URL that this source accepts, for help text and tests."""
    host = source["hosts"][0]
    path = source["paths"][0]
    return f"https://{host}{path}"
