"""Async SQLAlchemy engine + session factory, built from `Settings.DATABASE_URL`.

Only this module constructs the engine/sessionmaker — routers/services get an
`AsyncSession` via the `get_db_session` FastAPI dependency, never by importing the
engine directly (Dependency Inversion, per coder.md §3).
"""
from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Shared declarative base for ORM models (see `app/db/models.py`)."""


@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    return create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=get_engine(), expire_on_commit=False)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an `AsyncSession`, closed after the request."""
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        yield session
