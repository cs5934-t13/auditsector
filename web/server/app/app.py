"""Flask application entry point.

This module only wires the app together: configuration, the JSON error handler,
and blueprint registration. Routes live in `blueprints/`, SQL in `services/`,
and shared helpers in `db.py`, `auth.py`, and `routing.py`.

## Why some names are re-exported here

Several modules are reached as attributes of this module:

* Tests patch `app.get_db_connection` to stub the database.
* `blueprints/*` import `db`, `auth`, and `routing` as modules, so patching the
  module attribute covers every caller at once.

Re-exporting keeps `app.get_db_connection` a stable, patchable name without
duplicating the implementation. Do not "clean up" these imports.
"""

import os
from datetime import timedelta

import pymysql
from flask import Flask, request
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

import db
import routing
from blueprints import audits as audits_bp
from blueprints import auth as auth_bp
from blueprints import settings as settings_bp
from blueprints import sources as sources_bp
from blueprints import tags as tags_bp
from blueprints import users as users_bp

# Re-exported for callers and tests that reach through `app.`: `patch("app.X")`.
# `admin_required`, `login_required`, `current_role`, and `session_user_id` are
# the authorization guards; `get_db_connection` is the connection factory;
# `error_response`, `paginate`, and `wants_json` are the HTTP helpers.
import auth
from auth import admin_required, current_role, login_required, session_user_id
from db import get_db_connection
from routing import error_response, paginate, wants_json

# Re-exported so `patch("app.auth")` keeps working now that `auth` is a module.
_ = auth


def create_app():
    """Builds the Flask app. Importable so tests can construct a fresh one."""
    application = Flask(__name__)
    application.secret_key = os.environ["FLASK_SECRET_KEY"]
    application.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    application.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)

    # The nginx client strips the /api prefix before proxying (see
    # web/client/web.conf) and reports the stripped prefix in
    # X-Forwarded-Prefix. ProxyFix copies that into the WSGI SCRIPT_NAME, so
    # redirect() and url_for() emit /api/... URLs instead of /..., and
    # request.script_root tells us where we are mounted.
    #
    # Only x_prefix is enabled: trusting x_for/x_host from an arbitrary client
    # would let a caller spoof its own address unless a trusted proxy is
    # configured.
    application.wsgi_app = ProxyFix(application.wsgi_app, x_prefix=1)

    # Treat a trailing slash as insignificant on every route.
    #
    # By default Flask matches URLs exactly, so `/api/tags/` is a different
    # route from `/api/tags` and returns 404. That punished hand-typed URLs and
    # curl calls while the client happened to always omit the slash. Setting it
    # on the map fixes every endpoint at once instead of per decorator, and new
    # routes inherit it.
    #
    # Note: Werkzeug ignores this for `<path:...>` converters, so single-segment
    # parameters use `<string:...>`.
    application.url_map.strict_slashes = False

    @application.errorhandler(HTTPException)
    def handle_http_error(error: HTTPException):
        """Return JSON for API errors instead of Flask's default HTML pages.

        A typo in an endpoint URL should surface as a JSON error the client can
        parse, not as HTML that makes response.json() throw a SyntaxError.
        """
        response = error.get_response()
        if not routing.wants_json():
            return response

        response.data = application.json.dumps(
            {
                "error": {
                    "code": error.name.upper().replace(" ", "_"),
                    "message": error.description,
                }
            }
        )
        response.content_type = "application/json"
        return response

    for module in (auth_bp, tags_bp, audits_bp, users_bp, settings_bp, sources_bp):
        application.register_blueprint(module.bp)

    return application


app = create_app()


__all__ = [
    "admin_required",
    "app",
    "create_app",
    "current_role",
    "db",
    "error_response",
    "get_db_connection",
    "login_required",
    "paginate",
    "pymysql",
    "request",
    "routing",
    "session_user_id",
    "wants_json",
]
