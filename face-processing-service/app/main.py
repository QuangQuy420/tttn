"""FastAPI entrypoint — app instance, router mounting, startup DI wiring."""
from fastapi import FastAPI

from app.repositories.image_storage_repository import get_image_storage_repository
from app.routers.face import router as face_router

app = FastAPI(title="face-processing-service")

app.include_router(face_router)


@app.on_event("startup")
async def on_startup() -> None:
    """Ensure the private `face-images` bucket exists before serving traffic."""
    image_storage = get_image_storage_repository()
    image_storage.ensure_bucket()
