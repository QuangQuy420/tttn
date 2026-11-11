"""Request id (`X-Request-Id`) + logging setup — one id per request, printed on every log line.

Contract shared with api-gateway and face-processing-service (`infra/contracts/README.md`):
an incoming `X-Request-Id` matching `^[A-Za-z0-9-]{8,64}$` is kept, anything else is
replaced by a new UUID; the id is echoed on the response and forwarded on outgoing calls
(`request_id_headers()`).

The middleware is pure ASGI (not `BaseHTTPMiddleware`) so the contextvar it sets is the one
the endpoint and the exception handlers see. It never resets the contextvar: each request
runs in its own task context, and the unhandled-500 handler runs outside user middleware but
still needs the id for its log line (that 500 response itself may lack the header).
"""
import logging
import re
import time
import uuid
from contextvars import ContextVar
from urllib.parse import quote

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-Id"
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
# "-" = outside a request (startup, RabbitMQ consumers).
_NO_REQUEST_ID = "-"

request_id_var: ContextVar[str] = ContextVar("request_id", default=_NO_REQUEST_ID)

access_logger = logging.getLogger("app.access")


def request_id_headers() -> dict[str, str]:
    """`{"X-Request-Id": <id>}` for an outgoing call, or `{}` outside a request."""
    request_id = request_id_var.get()
    if request_id == _NO_REQUEST_ID:
        return {}
    return {REQUEST_ID_HEADER: request_id}


class _RequestIdFilter(logging.Filter):
    """Adds `record.request_id` so the `[%(request_id)s]` format field always resolves."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


_request_id_filter = _RequestIdFilter()


def configure_logging() -> None:
    """INFO logs on stderr with the request id. A no-op `basicConfig` (root already has
    handlers) leaves those handlers' format alone; the filter is still attached so a format
    using `request_id` never fails. uvicorn's own loggers do not propagate to root; httpx is
    kept at WARNING so each outgoing call does not add an INFO line."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    for handler in logging.getLogger().handlers:
        handler.addFilter(_request_id_filter)


class RequestIdMiddleware:
    """Pure ASGI middleware: sets `request_id_var`, adds `X-Request-Id` to the response and
    logs one access line `method path status ms` per request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = _header(scope, b"x-request-id")
        request_id = (
            incoming if incoming is not None and _VALID_REQUEST_ID.match(incoming) else str(uuid.uuid4())
        )
        request_id_var.set(request_id)

        status_code: int | None = None
        started = time.perf_counter()

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            # No response started = the inner app raised → the outer 500 handler answers.
            access_logger.info(
                "%s %s %s %.1fms",
                scope["method"],
                # Re-quoted: `path` is percent-decoded, so `%0a` would forge a log line.
                quote(scope["path"]),
                status_code if status_code is not None else 500,
                (time.perf_counter() - started) * 1000,
            )


def _header(scope: Scope, name: bytes) -> str | None:
    """First value of a (lower-case) request header, or None."""
    for key, value in scope["headers"]:
        if key == name:
            return value.decode("latin-1")
    return None
