ALTER TABLE orders
    DROP CONSTRAINT chk_orders_status;

ALTER TABLE orders
    ADD CONSTRAINT chk_orders_status
        CHECK (
            status IN (
                       'PENDING',
                       'AWAITING_PAYMENT',
                       'CONFIRMED',
                       'PROCESSING',
                       'SHIPPING',
                       'DELIVERED',
                       'COMPLETED',
                       'CANCELLED'
                )
            );

ALTER TABLE order_status_histories
    DROP CONSTRAINT chk_order_status_histories_status;

ALTER TABLE order_status_histories
    ADD CONSTRAINT chk_order_status_histories_status
        CHECK (
            status IN (
                       'PENDING',
                       'AWAITING_PAYMENT',
                       'CONFIRMED',
                       'PROCESSING',
                       'SHIPPING',
                       'DELIVERED',
                       'COMPLETED',
                       'CANCELLED'
                )
            );
