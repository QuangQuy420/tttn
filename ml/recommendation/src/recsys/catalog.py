"""Product catalog for the simulator and the dataset builder (plan 09, T2).

Two sources, one normalized dataframe (`CATALOG_COLUMNS`), sorted by `sku` before any use (the
API order is not stable, AC5):
- `api`: `GET <catalog-url>?page=&limit=100` through the gateway (public, PUBLISHED products only),
  paged until `meta.totalPages`, de-duplicated by `id`. Real product ids.
- `seed`: `infra/seed/products.json` (PUBLISHED products). It has no ids, so
  `product_id = uuid5(NAMESPACE_URL, "tttn-product:" + sku)` - offline only, never published.
- `auto` (default): try the API, fall back to the seed file only on a connection error (warning).

Plan 11 serving must build `features.Product` from the product-service list response the same way
`_from_api_item` + `to_products` do.
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

from recsys.common import SEED_PRODUCTS_JSON, fail

if TYPE_CHECKING:
    import pandas as pd

    from app.ml.features import Product

DEFAULT_CATALOG_URL = "http://localhost:8080/api/products"
CATALOG_SOURCES = ("auto", "api", "seed")
PAGE_LIMIT = 100
MIN_PRODUCTS_WARNING = 30
CATALOG_COLUMNS = [
    "product_id",
    "sku",
    "brand",
    "frame_shape",
    "material_type",
    "gender_target",
    "base_price",
    "colors",
    "catalog_source",
]


class CatalogUnavailableError(RuntimeError):
    """The catalog API could not be reached (connection error)."""


def seed_product_id(sku: str) -> str:
    """Offline-only product id of a seed product (the seed file has no ids)."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "tttn-product:" + sku))


def _sorted_colors(colors: list[str | None]) -> list[str]:
    return sorted({color for color in colors if color})


def _from_api_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "product_id": str(item["id"]),
        "sku": item["sku"],
        "brand": item["brand"]["name"],
        "frame_shape": item["frameShape"],
        "material_type": item.get("materialType"),
        "gender_target": item["genderTarget"],
        "base_price": float(item["basePrice"]),
        "colors": _sorted_colors([variant.get("color") for variant in item.get("variants") or []]),
        "catalog_source": "api",
    }


def _from_seed_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "product_id": seed_product_id(item["sku"]),
        "sku": item["sku"],
        "brand": item["brand"],
        "frame_shape": item["frame_shape"],
        "material_type": item.get("material_type"),
        "gender_target": item["gender_target"],
        "base_price": float(item["base_price"]),
        "colors": _sorted_colors([variant.get("color") for variant in item.get("variants") or []]),
        "catalog_source": "seed",
    }


def fetch_api_rows(url: str, timeout: float = 10.0) -> list[dict[str, Any]]:
    """All products of the gateway listing; raises `CatalogUnavailableError` on a connection error."""
    import httpx

    rows: dict[str, dict[str, Any]] = {}
    page, total_pages = 1, 1
    try:
        with httpx.Client(timeout=timeout) as client:
            while page <= total_pages:
                response = client.get(url, params={"page": page, "limit": PAGE_LIMIT})
                response.raise_for_status()
                body = response.json()
                for item in body["data"]:
                    rows.setdefault(str(item["id"]), _from_api_item(item))
                total_pages = int(body["meta"]["totalPages"])
                page += 1
    except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
        raise CatalogUnavailableError(f"catalog API {url} is not reachable ({exc})") from exc
    return list(rows.values())


def read_seed_rows(path: Path = SEED_PRODUCTS_JSON) -> list[dict[str, Any]]:
    products = json.loads(path.read_text(encoding="utf-8"))["products"]
    return [_from_seed_item(item) for item in products if item.get("status", "PUBLISHED") == "PUBLISHED"]


def load_catalog(source: str = "auto", url: str = DEFAULT_CATALOG_URL) -> pd.DataFrame:
    """Normalized catalog sorted by `sku`. `api` never falls back; `auto` falls back to the seed."""
    import pandas as pd

    if source not in CATALOG_SOURCES:
        fail(f"unknown catalog source {source!r} (expected one of {CATALOG_SOURCES})")
    if source == "seed":
        rows = read_seed_rows()
    else:
        try:
            rows = fetch_api_rows(url)
        except CatalogUnavailableError as exc:
            if source == "api":
                fail(f"{exc}; start the stack (docker compose in infra/) or use --catalog-source seed")
            print(f"warning: {exc} - falling back to {SEED_PRODUCTS_JSON} (uuid5 ids, offline only)", file=sys.stderr)
            rows = read_seed_rows()

    if not rows:
        fail("the catalog is empty")
    df = pd.DataFrame(rows, columns=CATALOG_COLUMNS).sort_values("sku", kind="stable").reset_index(drop=True)
    if len(df) < MIN_PRODUCTS_WARNING:
        print(f"warning: the catalog has only {len(df)} products (< {MIN_PRODUCTS_WARNING})", file=sys.stderr)
    return df


def catalog_source_of(df: pd.DataFrame) -> str:
    """`api` or `seed` (a loaded catalog has one source)."""
    return str(df["catalog_source"].iloc[0])


def to_products(df: pd.DataFrame) -> dict[str, Product]:
    """`features.Product` per product_id (the input of `app.ml.features`)."""
    from app.ml.features import Product

    return {
        row.product_id: Product(
            product_id=row.product_id,
            brand=row.brand,
            frame_shape=row.frame_shape,
            material_type=row.material_type if isinstance(row.material_type, str) else None,
            gender_target=row.gender_target,
            base_price=float(row.base_price),
            colors=tuple(row.colors),
        )
        for row in df.itertuples(index=False)
    }
