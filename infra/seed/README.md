# Seed Data

Sample data loaded on local startup:
- `products.json` — 60 sample eyewear products (8 brands, all 8 frame shapes with ≥ 6 products each,
  2–4 variants per product). Loaded by product-service's seed runner (`src/seed.ts`).

`products.json` is **generated** — edit `infra/scripts/generate-seed-products.py`, then run it
(stdlib only, deterministic):

```bash
python3 infra/scripts/generate-seed-products.py
```

It keeps the 10 original products (sku/name/slug/description/prices unchanged) and adds 50 more.
The extra products are **illustrative data for the thesis**: model names are made up and their images
reuse the photos of an original product with the same frame shape.

Fields added on top of the original shape:
- product: `material_type` (`ACETATE|METAL|TITANIUM|TR90|PLASTIC|MIXED`; `material` stays the
  free-text Vietnamese label) and frame measurements in mm — `lens_width_mm` (40–65),
  `bridge_width_mm` (12–26), `temple_length_mm` (120–160), `frame_width_mm` (110–160).
- image: `kind` — `GALLERY` or `TRY_ON`. Every product has exactly one product-level `TRY_ON` image,
  a transparent PNG from `web/public/products/frames/`.

## Reset & reseed

The seed runner skips products whose `sku` already exists, so a database seeded before this data
changed keeps the old rows. To load the new data, recreate `product_db` (run from `infra/`):

```bash
docker compose stop product-service
docker compose exec postgres psql -U app -d postgres -c 'DROP DATABASE product_db' -c 'CREATE DATABASE product_db'
docker compose up -d product-service   # entrypoint runs the migrations
docker compose exec product-service node dist/seed.js
```

This wipes every product in `product_db`, including products created from the admin UI. Carts and
orders in other services that point at old product ids will no longer resolve — fine for local dev.
