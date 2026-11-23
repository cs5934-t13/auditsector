"""Shared HTTP helpers: error envelope and pagination.

These are transport concerns, not business logic, so they live outside both
`app.py` and the service layer.
"""

from flask import request


def error_response(code: str, message: str, status: int):
    """Consistent error envelope used by the newer endpoints."""
    return {"error": {"code": code, "message": message}}, status


def paginate(total_items: int, page: int, limit: int):
    """Builds the `pagination` block shared by every paginated endpoint."""
    return {
        "page": page,
        "limit": limit,
        "total_items": total_items,
        "total_pages": (total_items + limit - 1) // limit,
    }


def read_pagination_args():
    """Reads `page`/`limit` off the request.

    Raises `ValueError` for a value Flask can parse as an int but that is out of
    range, so callers can answer 400 with one message.
    """
    page = int(request.args.get("page", "1"))
    limit = int(request.args.get("limit", "20"))

    if page < 1 or not 1 <= limit <= 100:
        raise ValueError("Invalid pagination")

    return page, limit


def wants_json() -> bool:
    """True when the request looks like an API call rather than a page load.

    Uses the proxy-provided SCRIPT_NAME so this keeps working if the app is ever
    mounted somewhere other than /api.
    """
    if request.script_root:
        return True
    return (
        request.accept_mimetypes.best_match(["application/json", "text/html"])
        == "application/json"
    )
