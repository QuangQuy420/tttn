ALTER TABLE order_items
    ADD COLUMN variant_id UUID,
    ADD COLUMN sku_variant VARCHAR(100),
    ADD COLUMN color VARCHAR(100),
    ADD COLUMN size VARCHAR(100);

UPDATE order_items
SET variant_id = product_id
WHERE variant_id IS NULL;

ALTER TABLE order_items
    ALTER COLUMN variant_id SET NOT NULL;

CREATE INDEX idx_order_items_variant_id
    ON order_items (variant_id);