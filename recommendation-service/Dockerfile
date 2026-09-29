# Dockerfile — recommendation-service (Python + FastAPI)
FROM python:3.11-slim

# curl: lets Compose's healthcheck curl GET /health (python:3.11-slim ships neither curl nor
# wget by default — same as face-processing-service's Dockerfile).
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x entrypoint.sh
EXPOSE 8000

# Runs pending Alembic migrations before the app starts (see entrypoint.sh) — every
# `docker compose up`, not just the first one.
ENTRYPOINT ["./entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
