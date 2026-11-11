"""Test-wide env defaults — set before any `app` module builds `Settings`.

`PRODUCT_SERVICE_URL`, `DATABASE_URL`, `RABBITMQ_URL` and `INTERNAL_API_KEY` are required
settings with no default; CI has no `.env`, so without these `get_settings()` fails. The
consumer flags are off so no test ever tries to reach RabbitMQ. Real env vars still win.
"""
import os

os.environ.setdefault("PRODUCT_SERVICE_URL", "http://product-service:3002")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://app:app@localhost:5432/recommendation_db")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key")
os.environ.setdefault("BEHAVIOR_CONSUMER_ENABLED", "false")
os.environ.setdefault("PRODUCT_CONSUMER_ENABLED", "false")
# Forced (not `setdefault`): a local `.env` sets a model version, but tests must stay
# model-free (legacy mode) so the app lifespan never loads `models/preference/`.
os.environ["PREFERENCE_MODEL_VERSION"] = ""
