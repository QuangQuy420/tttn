CREATE TABLE orders
(
    id               UUID PRIMARY KEY,
    order_code       VARCHAR(50)    NOT NULL UNIQUE,
    user_id          UUID           NOT NULL,

    total_amount     NUMERIC(19, 2) NOT NULL DEFAULT 0,

    status           VARCHAR(30)    NOT NULL,

    payment_id       UUID,
    payment_method   VARCHAR(30),
    payment_status VARCHAR(30) NOT NULL DEFAULT 'UNPAID',

    receiver_name    VARCHAR(150)   NOT NULL,
    receiver_phone   VARCHAR(20)    NOT NULL,
    shipping_address VARCHAR(500)   NOT NULL,
    note             VARCHAR(1000),

    created_at       TIMESTAMP      NOT NULL,
    updated_at       TIMESTAMP      NOT NULL,

    CONSTRAINT chk_orders_total_amount
        CHECK (total_amount >= 0),
    CONSTRAINT chk_orders_payment_status
        CHECK (
            payment_status IN (
                               'UNPAID',
                               'PENDING',
                               'PAID',
                               'FAILED',
                               'CANCELLED',
                               'REFUNDED'
                )
            ),

    CONSTRAINT chk_orders_status
        CHECK (
            status IN (
                       'PENDING',
                       'CONFIRMED',
                       'PROCESSING',
                       'SHIPPING',
                       'DELIVERED',
                       'COMPLETED',
                       'CANCELLED'
                )
            )
);

CREATE INDEX idx_orders_user_id
    ON orders (user_id);

CREATE INDEX idx_orders_status
    ON orders (status);

CREATE INDEX idx_orders_created_at
    ON orders (created_at);


CREATE TABLE order_items
(
    id                UUID PRIMARY KEY,
    order_id          UUID           NOT NULL,
    product_id        UUID           NOT NULL,

    product_name      VARCHAR(255)   NOT NULL,
    product_image_url VARCHAR(1000),

    unit_price        NUMERIC(19, 2) NOT NULL,
    quantity          INTEGER        NOT NULL,
    subtotal          NUMERIC(19, 2) NOT NULL,

    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id)
            REFERENCES orders (id)
            ON DELETE CASCADE,

    CONSTRAINT chk_order_items_unit_price
        CHECK (unit_price >= 0),

    CONSTRAINT chk_order_items_quantity
        CHECK (quantity > 0),

    CONSTRAINT chk_order_items_subtotal
        CHECK (subtotal >= 0)
);

CREATE INDEX idx_order_items_order_id
    ON order_items (order_id);

CREATE INDEX idx_order_items_product_id
    ON order_items (product_id);


CREATE TABLE order_status_histories
(
    id         UUID PRIMARY KEY,
    order_id   UUID        NOT NULL,
    status     VARCHAR(30) NOT NULL,
    changed_by UUID,
    note       VARCHAR(1000),
    changed_at TIMESTAMP   NOT NULL,

    CONSTRAINT fk_order_status_histories_order
        FOREIGN KEY (order_id)
            REFERENCES orders (id)
            ON DELETE CASCADE,

    CONSTRAINT chk_order_status_histories_status
        CHECK (
            status IN (
                       'PENDING',
                       'CONFIRMED',
                       'PROCESSING',
                       'SHIPPING',
                       'DELIVERED',
                       'COMPLETED',
                       'CANCELLED'
                )
            )
);

CREATE INDEX idx_order_status_histories_order_id
    ON order_status_histories (order_id);

CREATE INDEX idx_order_status_histories_changed_at
    ON order_status_histories (changed_at);