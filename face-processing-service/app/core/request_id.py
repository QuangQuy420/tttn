"""`X-Request-Id` correlation — contextvar, pure ASGI middleware, logging setup.

Cross-service contract (api-gateway, recommendation-service): an incoming `X-Request-Id`
is reused only when it matches `^[A-Za-z0-9-]{8,64}$`; otherwise a new UUID is generated.
The id is echoed on the response and printed in every log line as `[<id>]`.
"""
import logging
import re
import time
import uuid
from contextvars import ContextVar
from urllib.parse import quote

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "x-request-id"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,64}$")

# "-" outside a request (startup, background work) so the log format never breaks.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

access_logger = logging.getLogger("app.access")


def _incoming_request_id(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name.decode("latin-1").lower() == REQUEST_ID_HEADER:
            candidate = value.decode("latin-1")
            return candidate if _REQUEST_ID_PATTERN.match(candidate) else None
    return None


class RequestIdMiddleware:
    """Pure ASGI (not `BaseHTTPMiddleware`) so the contextvar set here is visible to the
    endpoint and to the exception handlers. The contextvar is never reset: each request
    runs in its own task context, and the 500 handler (in `ServerErrorMiddleware`, outside
    user middleware) still needs the id when it logs."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _incoming_request_id(scope) or str(uuid.uuid4())
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
            # No response started = the inner app raised -> the outer 500 handler answers.
            # `path` is percent-decoded: re-quote it so CR/LF can't forge a log line.
            elapsed_ms = (time.perf_counter() - started) * 1000
            access_logger.info(
                "%s %s %d %.1fms",
                scope["method"],
                quote(scope["path"]),
                status_code if status_code is not None else 500,
                elapsed_ms,
            )


class _RequestIdFilter(logging.Filter):
    """Injects `record.request_id` from the contextvar for the log format."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def configure_logging() -> None:
    """INFO logs with the request id. The filter goes on the root *handlers* (not loggers)
    so records propagated from any `app.*` logger get `request_id`. No `force=True`."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s",
    )
    for handler in logging.getLogger().handlers:
        if not any(isinstance(f, _RequestIdFilter) for f in handler.filters):
            handler.addFilter(_RequestIdFilter())
