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

    private final RedisTemplate<String, Cart> cartRedisTemplate;
    private final ProductClient productClient;
    private final CartMapper cartMapper;

    @Override
    public CartResponse getCart(UUID userId) {
        return cartMapper.toResponse(getOrCreateCart(userId));
    }

    @Override
    public CartResponse addItem(
            UUID userId,
            AddCartItemRequest request
    ) {
        ProductResponse product =
                productClient.getProductById(request.productId());

        validateProduct(product);

        ProductVariantResponse variant =
                findVariant(product, request.variantId());

        Cart cart = getOrCreateCart(userId);

        Optional<CartItem> existingItem = cart.getItems()
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

            item.setQuantity(
                    item.getQuantity() + request.quantity()
            );

            updateCartItemSnapshot(item, product, variant);
        } else {
            CartItem item = createCartItem(
                    product,
                    variant,
                    request.quantity()
            );

            cart.getItems().add(item);
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
        Cart cart = getExistingCart(userId);

        CartItem item = findCartItem(cart, variantId);

        ProductResponse product =
                productClient.getProductById(item.getProductId());

        validateProduct(product);

        ProductVariantResponse variant =
                findVariant(product, variantId);

        item.setQuantity(request.quantity());
        updateCartItemSnapshot(item, product, variant);

        saveCart(cart);

        return cartMapper.toResponse(cart);
    }

    @Override
    public CartResponse removeItem(
            UUID userId,
            UUID variantId
    ) {
        Cart cart = getExistingCart(userId);

        boolean removed = cart.getItems()
                .removeIf(item ->
                        Objects.equals(item.getVariantId(), variantId)
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
        cartRedisTemplate.delete(buildCartKey(userId));
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
        BigDecimal basePrice = defaultMoney(product.basePrice());
        BigDecimal extraPrice = defaultMoney(variant.extraPrice());

        return CartItem.builder()
                .productId(product.id())
                .variantId(variant.id())
                .productName(product.name())
                .skuVariant(variant.skuVariant())
                .color(variant.color())
                .size(variant.size())
                .productImageUrl(
                        selectProductImage(product, variant.id())
                )
                .basePrice(basePrice)
                .extraPrice(extraPrice)
                .unitPrice(basePrice.add(extraPrice))
                .quantity(quantity)
                .build();
    }

    private void updateCartItemSnapshot(
            CartItem item,
            ProductResponse product,
            ProductVariantResponse variant
    ) {
        BigDecimal basePrice = defaultMoney(product.basePrice());
        BigDecimal extraPrice = defaultMoney(variant.extraPrice());

        item.setProductId(product.id());
        item.setVariantId(variant.id());
        item.setProductName(product.name());
        item.setSkuVariant(variant.skuVariant());
        item.setColor(variant.color());
        item.setSize(variant.size());
        item.setProductImageUrl(
                selectProductImage(product, variant.id())
        );
        item.setBasePrice(basePrice);
        item.setExtraPrice(extraPrice);
        item.setUnitPrice(basePrice.add(extraPrice));
    }

    private void validateProduct(ProductResponse product) {
        if (product == null) {
            throw new ResourceNotFoundException(
                    "Không tìm thấy sản phẩm"
            );
        }

        if (product.status() != ProductStatus.PUBLISHED) {
            throw new BadRequestException(
                    "Sản phẩm hiện không được phép đặt mua"
            );
        }

        if (product.basePrice() == null
                || product.basePrice().compareTo(BigDecimal.ZERO) < 0) {
            throw new BadRequestException(
                    "Sản phẩm có giá bán không hợp lệ"
            );
        }
    }

    private ProductVariantResponse findVariant(
            ProductResponse product,
            UUID variantId
    ) {
        if (product.variants() == null) {
            throw new ResourceNotFoundException(
                    "Sản phẩm không có biến thể"
            );
        }

        return product.variants()
                .stream()
                .filter(variant ->
                        Objects.equals(variant.id(), variantId)
                )
                .findFirst()
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Không tìm thấy biến thể sản phẩm: "
                                        + variantId
                        )
                );
    }

    private String selectProductImage(
            ProductResponse product,
            UUID variantId
    ) {
        if (product.images() == null || product.images().isEmpty()) {
            return null;
        }

        Optional<ProductImageResponse> variantThumbnail =
                product.images()
                        .stream()
                        .filter(image ->
                                Objects.equals(
                                        image.variantId(),
                                        variantId
                                )
                        )
                        .filter(image ->
                                Boolean.TRUE.equals(image.isThumbnail())
                        )
                        .findFirst();

        if (variantThumbnail.isPresent()) {
            return variantThumbnail.get().imageUrl();
        }

        Optional<ProductImageResponse> variantImage =
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
                                        image -> Optional.ofNullable(
                                                image.sortOrder()
                                        ).orElse(Integer.MAX_VALUE)
                                )
                        );

        if (variantImage.isPresent()) {
            return variantImage.get().imageUrl();
        }

        return product.images()
                .stream()
                .filter(image ->
                        Boolean.TRUE.equals(image.isThumbnail())
                )
                .findFirst()
                .orElse(product.images().getFirst())
                .imageUrl();
    }

    private Cart getOrCreateCart(UUID userId) {
        Cart cart = cartRedisTemplate
                .opsForValue()
                .get(buildCartKey(userId));

        if (cart != null) {
            ensureItemsInitialized(cart);
            return cart;
        }

        return createEmptyCart(userId);
    }

    private Cart getExistingCart(UUID userId) {
        Cart cart = cartRedisTemplate
                .opsForValue()
                .get(buildCartKey(userId));

        if (cart == null || cart.isEmpty()) {
            throw new ResourceNotFoundException(
                    "Giỏ hàng không tồn tại hoặc đang trống"
            );
        }

        ensureItemsInitialized(cart);

        return cart;
    }

    private Cart createEmptyCart(UUID userId) {
        LocalDateTime now = LocalDateTime.now();

        return Cart.builder()
                .userId(userId)
                .items(new ArrayList<>())
                .createdAt(now)
                .updatedAt(now)
                .build();
    }

    private void saveCart(Cart cart) {
        if (cart.getCreatedAt() == null) {
            cart.setCreatedAt(LocalDateTime.now());
        }

        cart.setUpdatedAt(LocalDateTime.now());

        cartRedisTemplate.opsForValue().set(
                buildCartKey(cart.getUserId()),
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
                        Objects.equals(item.getVariantId(), variantId)
                )
                .findFirst()
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Biến thể sản phẩm không tồn tại trong giỏ hàng"
                        )
                );
    }

    private void ensureItemsInitialized(Cart cart) {
        if (cart.getItems() == null) {
            cart.setItems(new ArrayList<>());
        }
    }

    private String buildCartKey(UUID userId) {
        if (userId == null) {
            throw new BadRequestException(
                    "Mã người dùng không được để trống"
            );
        }

        return CART_KEY_PREFIX + userId;
    }

    private BigDecimal defaultMoney(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}