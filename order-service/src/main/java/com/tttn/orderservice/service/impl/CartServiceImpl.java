package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.dto.request.AddCartItemRequest;
import com.tttn.orderservice.dto.request.UpdateCartItemRequest;
import com.tttn.orderservice.dto.response.CartResponse;
import com.tttn.orderservice.dto.response.ProductImageResponse;
import com.tttn.orderservice.dto.response.ProductResponse;
import com.tttn.orderservice.dto.response.ProductVariantResponse;
import com.tttn.orderservice.enums.ProductStatus;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import com.tttn.orderservice.mapper.CartMapper;
import com.tttn.orderservice.model.cart.Cart;
import com.tttn.orderservice.model.cart.CartItem;
import com.tttn.orderservice.service.CartService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CartServiceImpl implements CartService {

    private static final String CART_KEY_PREFIX = "cart:";
    private static final Duration CART_TTL = Duration.ofDays(7);
    private static final int MAX_ITEM_QUANTITY = 99;

    private final RedisTemplate<String, Cart> cartRedisTemplate;
    private final ProductClient productClient;
    private final CartMapper cartMapper;

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

            item.setQuantity(newQuantity);

            refreshItemSnapshot(
                    item,
                    product,
                    variant
            );
        } else {
            CartItem newItem = createCartItem(
                    product,
                    variant,
                    request.quantity()
            );

            cart.getItems().add(newItem);
        }

        saveCart(cart);

        return cartMapper.toResponse(cart);
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

        Cart cart = getExistingCart(userId);

        CartItem cartItem = findCartItem(
                cart,
                variantId
        );

        ProductResponse product =
                productClient.getProductById(
                        cartItem.getProductId()
                );

        validateProduct(product);

        ProductVariantResponse variant =
                findVariant(product, variantId);

        cartItem.setQuantity(request.quantity());

        refreshItemSnapshot(
                cartItem,
                product,
                variant
        );

        saveCart(cart);

        return cartMapper.toResponse(cart);
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
            clearCart(userId);

            return cartMapper.toResponse(
                    createEmptyCart(userId)
            );
        }

        saveCart(cart);

        return cartMapper.toResponse(cart);
    }

    @Override
    public void clearCart(UUID userId) {
        validateUserId(userId);

        cartRedisTemplate.delete(
                buildCartKey(userId)
        );
    }

    @Override
    public Cart getCartEntity(UUID userId) {
        return getExistingCart(userId);
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
                        CART_TTL
                );
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
        return CART_KEY_PREFIX + userId;
    }

    private BigDecimal defaultMoney(
            BigDecimal value
    ) {
        return value == null
                ? BigDecimal.ZERO
                : value;
    }
}