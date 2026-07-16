"""FastAPI entrypoint — app instance, router mounting."""
from fastapi import FastAPI

from app.routers.recommend import router as recommend_router

app = FastAPI(title="recommendation-service")

app.include_router(recommend_router)
