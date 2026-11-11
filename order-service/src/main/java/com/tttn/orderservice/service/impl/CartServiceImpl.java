package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.dto.request.AddCartItemRequest;
import com.tttn.orderservice.dto.request.UpdateCartItemRequest;
import com.tttn.orderservice.dto.response.CartItemResponse;
import com.tttn.orderservice.dto.response.CartRefreshResponse;
import com.tttn.orderservice.dto.response.CartResponse;
import com.tttn.orderservice.dto.response.ProductImageResponse;
import com.tttn.orderservice.dto.response.ProductResponse;
import com.tttn.orderservice.dto.response.ProductVariantResponse;
import com.tttn.orderservice.enums.CartItemUnavailableReason;
import com.tttn.orderservice.enums.ProductStatus;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.exception.ConflictException;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import com.tttn.orderservice.mapper.CartMapper;
import com.tttn.orderservice.messaging.BehaviorEventPublisher;
import com.tttn.orderservice.model.cart.Cart;
import com.tttn.orderservice.model.cart.CartItem;
import com.tttn.orderservice.service.CartService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

@Slf4j
@Service
@RequiredArgsConstructor
public class CartServiceImpl implements CartService {

    private static final int MAX_ITEM_QUANTITY = 99;
    private static final long SCAN_BATCH_SIZE = 100;

    // Per-cart lock (SET NX PX) around every read-modify-write of a cart, so two concurrent
    // writes (e.g. two "add" clicks, or an add racing a background product sync) cannot
    // overwrite each other. Never held across a product-service HTTP call. syncProduct skips
    // these keys in its cart scan. The lock is not re-entrant. TTL covers the 2-3 Redis calls
    // done under it (3 s command timeout each).
    private static final String CART_LOCK_PREFIX = "cart-lock:";
    private static final Duration CART_LOCK_TTL = Duration.ofSeconds(10);
    private static final long CART_LOCK_RETRY_DELAY_MS = 50;
    private static final int CART_LOCK_MAX_TRIES = 60;
    private static final RedisScript<Long> RELEASE_CART_LOCK_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then "
                    + "return redis.call('DEL', KEYS[1]) else return 0 end",
            Long.class
    );

    private final RedisTemplate<String, Cart> cartRedisTemplate;
    private final ProductClient productClient;
    private final CartMapper cartMapper;
    private final BehaviorEventPublisher behaviorEventPublisher;
    private final StringRedisTemplate stringRedisTemplate;

    @Value("${cart.key-prefix}")
    private String cartKeyPrefix;

    @Value("${cart.expiration-days}")
    private long cartExpirationDays;

    @Override
    public CartResponse getCart(UUID userId) {
        Cart cart = getOrCreateCart(userId);
        return cartMapper.toResponse(cart);
    }

    @Override
    public CartResponse addItem(
            UUID userId,
            AddCartItemRequest request
    ) {
        validateUserId(userId);
        validateAddItemRequest(request);

        ProductResponse product =
                productClient.getProductById(request.productId());

        validateProduct(product);

        ProductVariantResponse variant =
                findVariant(product, request.variantId());

        CartResponse response = withCartLock(buildCartKey(userId), () -> {
            Cart cart = getOrCreateCart(userId);

            Optional<CartItem> existingItem =
                    cart.getItems()
                            .stream()
                            .filter(item ->
                                    Objects.equals(
                                            item.getVariantId(),
                                            request.variantId()
                                    )
                            )
                            .findFirst();

            if (existingItem.isPresent()) {
                CartItem item = existingItem.get();

                int newQuantity =
                        item.getQuantity() + request.quantity();

                validateQuantity(newQuantity);
                validateStock(variant, newQuantity);

                item.setQuantity(newQuantity);

                refreshItemSnapshot(
                        item,
                        product,
                        variant
                );
                applyAvailability(item, product, variant);
            } else {
                validateStock(variant, request.quantity());

                CartItem newItem = createCartItem(
                        product,
                        variant,
                        request.quantity()
                );
                applyAvailability(newItem, product, variant);

                cart.getItems().add(newItem);
            }

            saveCart(cart);

            return cartMapper.toResponse(cart);
        });

        behaviorEventPublisher.publishAddToCart(
                userId,
                request.productId(),
                request.variantId(),
                request.quantity()
        );

        return response;
    }

    @Override
    public CartResponse updateItem(
            UUID userId,
            UUID variantId,
            UpdateCartItemRequest request
    ) {
        validateUserId(userId);

        if (variantId == null) {
            throw new BadRequestException(
                    "Mã biến thể không được để trống"
            );
        }

        if (request == null) {
            throw new BadRequestException(
                    "Dữ liệu cập nhật không được để trống"
            );
        }

        validateQuantity(request.quantity());

        // Read without the lock only to know which product to fetch (no HTTP call under the
        // lock); the cart is re-read under the lock before it is changed.
        CartItem currentItem = findCartItem(
                getExistingCart(userId),
                variantId
        );

        ProductResponse product =
                productClient.getProductById(
                        currentItem.getProductId()
                );

        validateProduct(product);

        ProductVariantResponse variant =
                findVariant(product, variantId);

        validateStock(variant, request.quantity());

        return withCartLock(buildCartKey(userId), () -> {
            Cart cart = getExistingCart(userId);

            CartItem cartItem = findCartItem(
                    cart,
                    variantId
            );

            cartItem.setQuantity(request.quantity());

            refreshItemSnapshot(
                    cartItem,
                    product,
                    variant
            );
            applyAvailability(cartItem, product, variant);

            saveCart(cart);

            return cartMapper.toResponse(cart);
        });
    }

    @Override
    public CartResponse removeItem(
            UUID userId,
            UUID variantId
    ) {
        validateUserId(userId);

        if (variantId == null) {
            throw new BadRequestException(
                    "Mã biến thể không được để trống"
            );
        }

        return withCartLock(buildCartKey(userId), () -> {
            Cart cart = getExistingCart(userId);

            boolean removed = cart.getItems()
                    .removeIf(item ->
                            Objects.equals(
                                    item.getVariantId(),
                                    variantId
                            )
                    );

            if (!removed) {
                throw new ResourceNotFoundException(
                        "Biến thể sản phẩm không tồn tại trong giỏ hàng"
                );
            }

            if (cart.getItems().isEmpty()) {
                deleteCart(userId);

                return cartMapper.toResponse(
                        createEmptyCart(userId)
                );
            }

            saveCart(cart);

            return cartMapper.toResponse(cart);
        });
    }

    @Override
    public void clearCart(UUID userId) {
        validateUserId(userId);

        // Locked so a concurrent add / sync cannot write the cart back after the delete.
        runWithCartLock(buildCartKey(userId), () -> deleteCart(userId));
    }

    // No lock: for callers that already hold the cart lock (it is not re-entrant).
    private void deleteCart(UUID userId) {
        cartRedisTemplate.delete(
                buildCartKey(userId)
        );
    }

    @Override
    public void removeItems(UUID userId, List<UUID> variantIds) {
        validateUserId(userId);

        if (variantIds == null || variantIds.isEmpty()) {
            return;
        }

        runWithCartLock(buildCartKey(userId), () -> {
            Cart cart = cartRedisTemplate.opsForValue().get(buildCartKey(userId));

            if (cart == null) {
                return;
            }

            initializeCartItems(cart);

            cart.getItems()
                    .removeIf(item ->
                            variantIds.contains(item.getVariantId())
                    );

            if (cart.getItems().isEmpty()) {
                deleteCart(userId);
                return;
            }

            saveCart(cart);
        });
    }

    @Override
    public Cart getCartEntity(UUID userId) {
        return getExistingCart(userId);
    }

    @Override
    public void syncProduct(UUID productId) {
        if (productId == null) {
            return;
        }

        ProductResponse product = fetchProductOrNull(productId);

        ScanOptions options = ScanOptions.scanOptions()
                .match(cartKeyPrefix + "*")
                .count(SCAN_BATCH_SIZE)
                .build();

        try (Cursor<String> keys = cartRedisTemplate.scan(options)) {
            while (keys.hasNext()) {
                String key = keys.next();

                // A prefix without a trailing ':' (e.g. "cart") would also match lock keys.
                if (key.startsWith(CART_LOCK_PREFIX)) {
                    continue;
                }

                syncCartKey(key, productId, product);
            }
        }
    }

    @Override
    public CartRefreshResponse refreshCart(UUID userId) {
        Cart snapshot = getOrCreateCart(userId);

        if (snapshot.isEmpty()) {
            return new CartRefreshResponse(
                    cartMapper.toResponse(snapshot),
                    List.of()
            );
        }

        // One product-service call per distinct product; null = product returned 404. Fetched
        // before taking the cart lock, then applied to a fresh read of the cart under the lock.
        Map<UUID, ProductResponse> products = new HashMap<>();

        for (CartItem item : snapshot.getItems()) {
            if (!products.containsKey(item.getProductId())) {
                products.put(
                        item.getProductId(),
                        fetchProductOrNull(item.getProductId())
                );
            }
        }

        return withCartLock(buildCartKey(userId), () -> {
            Cart cart = getOrCreateCart(userId);

            List<UUID> changedVariantIds = new ArrayList<>();
            boolean cartChanged = false;

            for (CartItem item : cart.getItems()) {
                // Added after the fetch above: left as is until the next refresh.
                if (!products.containsKey(item.getProductId())) {
                    continue;
                }

                BigDecimal previousUnitPrice = item.getUnitPrice();
                boolean previouslyAvailable =
                        !Boolean.FALSE.equals(item.getAvailable());

                cartChanged |= applyProductState(
                        item,
                        products.get(item.getProductId())
                );

                if (!samePrice(previousUnitPrice, item.getUnitPrice())
                        || previouslyAvailable != item.getAvailable()) {
                    changedVariantIds.add(item.getVariantId());
                }
            }

            if (cartChanged) {
                saveCart(cart);
            }

            return new CartRefreshResponse(
                    cartMapper.toResponse(cart),
                    changedVariantIds
            );
        });
    }

    private void syncCartKey(
            String key,
            UUID productId,
            ProductResponse product
    ) {
        // Cheap unlocked check first, so carts without this product never take the lock.
        if (!containsProduct(cartRedisTemplate.opsForValue().get(key), productId)) {
            return;
        }

        runWithCartLock(key, () -> {
            Cart cart = cartRedisTemplate.opsForValue().get(key);

            if (cart == null || cart.isEmpty()) {
                return;
            }

            boolean changed = false;

            for (CartItem item : cart.getItems()) {
                if (Objects.equals(item.getProductId(), productId)) {
                    changed |= applyProductState(item, product);
                }
            }

            if (!changed) {
                return;
            }

            // A background sync is not user activity — keep the cart's remaining lifetime
            // instead of resetting it to the full TTL like saveCart() does.
            Long ttlSeconds = cartRedisTemplate.getExpire(key);

            if (ttlSeconds == null || ttlSeconds == -2) {
                // Key expired or was cleared (e.g. checkout) since we read it.
                return;
            }

            cartRedisTemplate
                    .opsForValue()
                    .set(
                            key,
                            cart,
                            ttlSeconds > 0
                                    ? Duration.ofSeconds(ttlSeconds)
                                    : cartTtl()
                    );
        });
    }

    private boolean containsProduct(Cart cart, UUID productId) {
        return cart != null
                && !cart.isEmpty()
                && cart.getItems()
                .stream()
                .anyMatch(item -> Objects.equals(item.getProductId(), productId));
    }

    private <T> T withCartLock(String cartKey, Supplier<T> action) {
        String lockKey = CART_LOCK_PREFIX + cartKey.substring(cartKeyPrefix.length());
        String token = UUID.randomUUID().toString();

        acquireCartLock(lockKey, token);

        try {
            return action.get();
        } finally {
            releaseCartLock(lockKey, token);
        }
    }

    private void runWithCartLock(String cartKey, Runnable action) {
        withCartLock(cartKey, () -> {
            action.run();
            return null;
        });
    }

    private void acquireCartLock(String lockKey, String token) {
        for (int attempt = 0; attempt < CART_LOCK_MAX_TRIES; attempt++) {
            if (Boolean.TRUE.equals(
                    stringRedisTemplate
                            .opsForValue()
                            .setIfAbsent(lockKey, token, CART_LOCK_TTL)
            )) {
                return;
            }

            try {
                Thread.sleep(CART_LOCK_RETRY_DELAY_MS);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                break;
            }
        }

        throw new ConflictException(
                "Giỏ hàng đang được cập nhật, vui lòng thử lại"
        );
    }

    // Deletes the lock only if it is still ours (it may have expired and been taken by another
    // writer). A failure here is only logged: the lock expires on its own after CART_LOCK_TTL.
    private void releaseCartLock(String lockKey, String token) {
        try {
            stringRedisTemplate.execute(
                    RELEASE_CART_LOCK_SCRIPT,
                    List.of(lockKey),
                    token
            );
        } catch (RuntimeException exception) {
            log.warn(
                    "Không thể mở khóa giỏ hàng {}: {}",
                    lockKey,
                    exception.getMessage()
            );
        }
    }

    /**
     * Updates one cart item from the latest product state and returns whether anything
     * visible to the client changed. {@code product == null} means product-service returned
     * 404 for it.
     */
    private boolean applyProductState(
            CartItem item,
            ProductResponse product
    ) {
        CartItemResponse before = cartMapper.toItemResponse(item);

        ProductVariantResponse variant = product == null
                ? null
                : findVariantOrNull(product, item.getVariantId());

        if (variant != null) {
            refreshItemSnapshot(item, product, variant);
        }

        applyAvailability(item, product, variant);

        return !before.equals(cartMapper.toItemResponse(item));
    }

    private void applyAvailability(
            CartItem item,
            ProductResponse product,
            ProductVariantResponse variant
    ) {
        CartItemUnavailableReason reason =
                CartItemUnavailableReason.resolve(
                        product,
                        variant,
                        item.getQuantity()
                );

        item.setAvailable(reason == null);
        item.setUnavailableReason(reason);
        item.setAvailableStock(
                variant == null || variant.stock() == null
                        ? 0
                        : variant.stock()
        );
    }

    private ProductResponse fetchProductOrNull(UUID productId) {
        try {
            return productClient.getProductById(productId);
        } catch (ResourceNotFoundException exception) {
            return null;
        }
    }

    private ProductVariantResponse findVariantOrNull(
            ProductResponse product,
            UUID variantId
    ) {
        if (product.variants() == null) {
            return null;
        }

        return product.variants()
                .stream()
                .filter(variant ->
                        Objects.equals(
                                variant.id(),
                                variantId
                        )
                )
                .findFirst()
                .orElse(null);
    }

    private boolean samePrice(
            BigDecimal first,
            BigDecimal second
    ) {
        if (first == null || second == null) {
            return first == second;
        }

        return first.compareTo(second) == 0;
    }

    private CartItem createCartItem(
            ProductResponse product,
            ProductVariantResponse variant,
            Integer quantity
    ) {
        BigDecimal basePrice =
                defaultMoney(product.basePrice());

        BigDecimal extraPrice =
                defaultMoney(variant.extraPrice());

        BigDecimal unitPrice =
                basePrice.add(extraPrice);

        return CartItem.builder()
                .productId(product.id())
                .variantId(variant.id())
                .productName(product.name())
                .skuVariant(variant.skuVariant())
                .color(variant.color())
                .colorHex(variant.colorHex())
                .size(variant.size())
                .productImageUrl(
                        selectProductImage(
                                product,
                                variant.id()
                        )
                )
                .basePrice(basePrice)
                .extraPrice(extraPrice)
                .unitPrice(unitPrice)
                .quantity(quantity)
                .build();
    }

    private void refreshItemSnapshot(
            CartItem item,
            ProductResponse product,
            ProductVariantResponse variant
    ) {
        BigDecimal basePrice =
                defaultMoney(product.basePrice());

        BigDecimal extraPrice =
                defaultMoney(variant.extraPrice());

        item.setProductId(product.id());
        item.setVariantId(variant.id());
        item.setProductName(product.name());
        item.setSkuVariant(variant.skuVariant());
        item.setColor(variant.color());
        item.setColorHex(variant.colorHex());
        item.setSize(variant.size());

        item.setProductImageUrl(
                selectProductImage(
                        product,
                        variant.id()
                )
        );

        item.setBasePrice(basePrice);
        item.setExtraPrice(extraPrice);
        item.setUnitPrice(
                basePrice.add(extraPrice)
        );
    }

    private Cart getOrCreateCart(UUID userId) {
        validateUserId(userId);

        String redisKey =
                buildCartKey(userId);

        Cart cart =
                cartRedisTemplate
                        .opsForValue()
                        .get(redisKey);

        if (cart == null) {
            return createEmptyCart(userId);
        }

        initializeCartItems(cart);

        return cart;
    }

    private Cart getExistingCart(UUID userId) {
        validateUserId(userId);

        Cart cart =
                cartRedisTemplate
                        .opsForValue()
                        .get(buildCartKey(userId));

        if (cart == null || cart.isEmpty()) {
            throw new ResourceNotFoundException(
                    "Giỏ hàng không tồn tại hoặc đang trống"
            );
        }

        initializeCartItems(cart);

        return cart;
    }

    private Cart createEmptyCart(UUID userId) {
        LocalDateTime now =
                LocalDateTime.now();

        return Cart.builder()
                .userId(userId)
                .items(new ArrayList<>())
                .createdAt(now)
                .updatedAt(now)
                .build();
    }

    private void saveCart(Cart cart) {
        initializeCartItems(cart);

        if (cart.getCreatedAt() == null) {
            cart.setCreatedAt(
                    LocalDateTime.now()
            );
        }

        cart.setUpdatedAt(
                LocalDateTime.now()
        );

        cartRedisTemplate
                .opsForValue()
                .set(
                        buildCartKey(
                                cart.getUserId()
                        ),
                        cart,
                        cartTtl()
                );
    }

    private Duration cartTtl() {
        return Duration.ofDays(cartExpirationDays);
    }

    private CartItem findCartItem(
            Cart cart,
            UUID variantId
    ) {
        return cart.getItems()
                .stream()
                .filter(item ->
                        Objects.equals(
                                item.getVariantId(),
                                variantId
                        )
                )
                .findFirst()
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Biến thể sản phẩm không tồn tại trong giỏ hàng"
                        )
                );
    }

    private ProductVariantResponse findVariant(
            ProductResponse product,
            UUID variantId
    ) {
        if (variantId == null) {
            throw new BadRequestException(
                    "Mã biến thể không được để trống"
            );
        }

        if (product.variants() == null
                || product.variants().isEmpty()) {
            throw new ResourceNotFoundException(
                    "Sản phẩm không có biến thể"
            );
        }

        return product.variants()
                .stream()
                .filter(variant ->
                        Objects.equals(
                                variant.id(),
                                variantId
                        )
                )
                .findFirst()
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Không tìm thấy biến thể sản phẩm"
                        )
                );
    }

    private void validateProduct(
            ProductResponse product
    ) {
        if (product == null) {
            throw new ResourceNotFoundException(
                    "Không tìm thấy sản phẩm"
            );
        }

        if (product.id() == null) {
            throw new BadRequestException(
                    "Sản phẩm có mã không hợp lệ"
            );
        }

        if (product.status() != ProductStatus.PUBLISHED) {
            throw new BadRequestException(
                    "Sản phẩm hiện không được phép đặt mua"
            );
        }

        if (product.basePrice() == null) {
            throw new BadRequestException(
                    "Sản phẩm chưa có giá bán"
            );
        }

        if (product.basePrice()
                .compareTo(BigDecimal.ZERO) < 0) {
            throw new BadRequestException(
                    "Giá sản phẩm không hợp lệ"
            );
        }
    }

    private void validateAddItemRequest(
            AddCartItemRequest request
    ) {
        if (request == null) {
            throw new BadRequestException(
                    "Dữ liệu thêm giỏ hàng không được để trống"
            );
        }

        if (request.productId() == null) {
            throw new BadRequestException(
                    "Mã sản phẩm không được để trống"
            );
        }

        if (request.variantId() == null) {
            throw new BadRequestException(
                    "Mã biến thể không được để trống"
            );
        }

        validateQuantity(
                request.quantity()
        );
    }

    private void validateQuantity(
            Integer quantity
    ) {
        if (quantity == null) {
            throw new BadRequestException(
                    "Số lượng sản phẩm không được để trống"
            );
        }

        if (quantity < 1
                || quantity > MAX_ITEM_QUANTITY) {
            throw new BadRequestException(
                    "Số lượng sản phẩm phải từ 1 đến "
                            + MAX_ITEM_QUANTITY
            );
        }
    }

    private void validateStock(
            ProductVariantResponse variant,
            int desiredQuantity
    ) {
        int availableStock =
                variant.stock() == null
                        ? 0
                        : variant.stock();

        if (desiredQuantity > availableStock) {
            throw new BadRequestException(
                    "Chỉ còn "
                            + availableStock
                            + " sản phẩm trong kho"
            );
        }
    }

    private void validateUserId(
            UUID userId
    ) {
        if (userId == null) {
            throw new BadRequestException(
                    "Mã người dùng không được để trống"
            );
        }
    }

    private void initializeCartItems(
            Cart cart
    ) {
        if (cart.getItems() == null) {
            cart.setItems(
                    new ArrayList<>()
            );
        }
    }

    private String selectProductImage(
            ProductResponse product,
            UUID variantId
    ) {
        if (product.images() == null
                || product.images().isEmpty()) {
            return null;
        }

        Optional<ProductImageResponse>
                variantThumbnail =
                product.images()
                        .stream()
                        .filter(image ->
                                Objects.equals(
                                        image.variantId(),
                                        variantId
                                )
                        )
                        .filter(image ->
                                Boolean.TRUE.equals(
                                        image.isThumbnail()
                                )
                        )
                        .findFirst();

        if (variantThumbnail.isPresent()) {
            return variantThumbnail
                    .get()
                    .imageUrl();
        }

        Optional<ProductImageResponse>
                variantImage =
                product.images()
                        .stream()
                        .filter(image ->
                                Objects.equals(
                                        image.variantId(),
                                        variantId
                                )
                        )
                        .min(
                                Comparator.comparing(
                                        image ->
                                                Optional.ofNullable(
                                                                image.sortOrder()
                                                        )
                                                        .orElse(
                                                                Integer.MAX_VALUE
                                                        )
                                )
                        );

        if (variantImage.isPresent()) {
            return variantImage
                    .get()
                    .imageUrl();
        }

        Optional<ProductImageResponse>
                productThumbnail =
                product.images()
                        .stream()
                        .filter(image ->
                                Boolean.TRUE.equals(
                                        image.isThumbnail()
                                )
                        )
                        .findFirst();

        if (productThumbnail.isPresent()) {
            return productThumbnail
                    .get()
                    .imageUrl();
        }

        return product.images()
                .get(0)
                .imageUrl();
    }

    private String buildCartKey(
            UUID userId
    ) {
        return cartKeyPrefix + userId;
    }

    private BigDecimal defaultMoney(
            BigDecimal value
    ) {
        return value == null
                ? BigDecimal.ZERO
                : value;
    }
}