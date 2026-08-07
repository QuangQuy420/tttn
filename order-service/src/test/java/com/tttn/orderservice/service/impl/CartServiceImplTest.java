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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
@DisplayName("CartServiceImpl Unit Tests")
class CartServiceImplTest {

    private static final String CART_KEY_PREFIX = "cart:";
    private static final Duration CART_TTL = Duration.ofDays(7);

    @Mock
    private RedisTemplate<String, Cart> cartRedisTemplate;

    @Mock
    private ValueOperations<String, Cart> valueOperations;

    @Mock
    private ProductClient productClient;

    private CartMapper cartMapper;

    private CartServiceImpl cartService;

    private UUID userId;
    private UUID productId;
    private UUID variantId;

    @BeforeEach
    void setUp() {
        cartMapper = new CartMapper();

        cartService = new CartServiceImpl(
                cartRedisTemplate,
                productClient,
                cartMapper
        );

        userId = UUID.randomUUID();
        productId = UUID.randomUUID();
        variantId = UUID.randomUUID();

        lenient()
                .when(cartRedisTemplate.opsForValue())
                .thenReturn(valueOperations);
    }

    @Nested
    @DisplayName("getCart")
    class GetCartTests {

        @Test
        @DisplayName("Trả về giỏ hàng hiện có")
        void getCart_whenCartExists_shouldReturnCartResponse() {
            Cart cart = createCartWithOneItem();

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(cart);

            CartResponse response = cartService.getCart(userId);

            assertNotNull(response);
            assertEquals(userId, response.userId());
            assertEquals(1, response.items().size());
            assertEquals(2, response.totalQuantity());
            assertEquals(
                    new BigDecimal("2400000"),
                    response.totalAmount()
            );

            verify(valueOperations)
                    .get(buildCartKey(userId));
        }

        @Test
        @DisplayName("Trả về giỏ hàng rỗng khi Redis chưa có dữ liệu")
        void getCart_whenCartDoesNotExist_shouldReturnEmptyCart() {
            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            CartResponse response = cartService.getCart(userId);

            assertNotNull(response);
            assertEquals(userId, response.userId());
            assertNotNull(response.items());
            assertTrue(response.items().isEmpty());
            assertEquals(0, response.totalQuantity());
            assertEquals(BigDecimal.ZERO, response.totalAmount());
            assertNotNull(response.createdAt());
            assertNotNull(response.updatedAt());

            verify(valueOperations)
                    .get(buildCartKey(userId));

            verify(valueOperations, never())
                    .set(
                            any(String.class),
                            any(Cart.class),
                            any(Duration.class)
                    );
        }

        @Test
        @DisplayName("Ném lỗi khi userId bằng null")
        void getCart_whenUserIdIsNull_shouldThrowBadRequestException() {
            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.getCart(null)
                    );

            assertEquals(
                    "Mã người dùng không được để trống",
                    exception.getMessage()
            );

            verify(valueOperations, never())
                    .get(any(String.class));
        }
    }

    @Nested
    @DisplayName("addItem")
    class AddItemTests {

        @Test
        @DisplayName("Thêm sản phẩm mới vào giỏ hàng rỗng")
        void addItem_whenCartIsEmpty_shouldAddNewItem() {
            AddCartItemRequest request =
                    new AddCartItemRequest(
                            productId,
                            variantId,
                            2
                    );

            ProductResponse product =
                    createPublishedProduct();

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            CartResponse response =
                    cartService.addItem(userId, request);

            assertNotNull(response);
            assertEquals(userId, response.userId());
            assertEquals(1, response.items().size());
            assertEquals(2, response.totalQuantity());
            assertEquals(
                    new BigDecimal("2400000"),
                    response.totalAmount()
            );

            assertEquals(
                    productId,
                    response.items().get(0).productId()
            );

            assertEquals(
                    variantId,
                    response.items().get(0).variantId()
            );

            assertEquals(
                    "Kính mắt thời trang",
                    response.items().get(0).productName()
            );

            assertEquals(
                    "SKU-VARIANT-001",
                    response.items().get(0).skuVariant()
            );

            assertEquals(
                    "Đen",
                    response.items().get(0).color()
            );

            assertEquals(
                    "M",
                    response.items().get(0).size()
            );

            assertEquals(
                    "https://example.com/variant-thumbnail.jpg",
                    response.items().get(0).productImageUrl()
            );

            assertEquals(
                    new BigDecimal("1000000"),
                    response.items().get(0).basePrice()
            );

            assertEquals(
                    new BigDecimal("200000"),
                    response.items().get(0).extraPrice()
            );

            assertEquals(
                    new BigDecimal("1200000"),
                    response.items().get(0).unitPrice()
            );

            assertEquals(
                    new BigDecimal("2400000"),
                    response.items().get(0).subtotal()
            );

            ArgumentCaptor<Cart> cartCaptor =
                    ArgumentCaptor.forClass(Cart.class);

            verify(valueOperations).set(
                    eq(buildCartKey(userId)),
                    cartCaptor.capture(),
                    eq(CART_TTL)
            );

            Cart savedCart = cartCaptor.getValue();

            assertEquals(userId, savedCart.getUserId());
            assertEquals(1, savedCart.getItems().size());
            assertEquals(
                    variantId,
                    savedCart.getItems().get(0).getVariantId()
            );
            assertEquals(
                    2,
                    savedCart.getItems().get(0).getQuantity()
            );
            assertNotNull(savedCart.getCreatedAt());
            assertNotNull(savedCart.getUpdatedAt());

            verify(productClient)
                    .getProductById(productId);
        }

        @Test
        @DisplayName("Cộng số lượng khi biến thể đã tồn tại trong giỏ hàng")
        void addItem_whenVariantAlreadyExists_shouldIncreaseQuantity() {
            AddCartItemRequest request =
                    new AddCartItemRequest(
                            productId,
                            variantId,
                            3
                    );

            ProductResponse product =
                    createPublishedProduct();

            Cart existingCart =
                    createCartWithOneItem();

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(existingCart);

            CartResponse response =
                    cartService.addItem(userId, request);

            assertNotNull(response);
            assertEquals(1, response.items().size());
            assertEquals(5, response.totalQuantity());
            assertEquals(
                    new BigDecimal("6000000"),
                    response.totalAmount()
            );
            assertEquals(
                    5,
                    response.items().get(0).quantity()
            );

            ArgumentCaptor<Cart> cartCaptor =
                    ArgumentCaptor.forClass(Cart.class);

            verify(valueOperations).set(
                    eq(buildCartKey(userId)),
                    cartCaptor.capture(),
                    eq(CART_TTL)
            );

            assertEquals(
                    5,
                    cartCaptor
                            .getValue()
                            .getItems()
                            .get(0)
                            .getQuantity()
            );
        }

        @Test
        @DisplayName("Ném lỗi khi tổng số lượng vượt quá 99")
        void addItem_whenTotalQuantityExceedsMaximum_shouldThrowBadRequestException() {
            AddCartItemRequest request =
                    new AddCartItemRequest(
                            productId,
                            variantId,
                            10
                    );

            Cart cart = createCartWithOneItem();
            cart.getItems().get(0).setQuantity(95);

            when(productClient.getProductById(productId))
                    .thenReturn(createPublishedProduct());

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(cart);

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    request
                            )
                    );

            assertEquals(
                    "Số lượng sản phẩm phải từ 1 đến 99",
                    exception.getMessage()
            );

            verify(valueOperations, never())
                    .set(
                            any(String.class),
                            any(Cart.class),
                            any(Duration.class)
                    );
        }

        @Test
        @DisplayName("Ném lỗi khi request bằng null")
        void addItem_whenRequestIsNull_shouldThrowBadRequestException() {
            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    null
                            )
                    );

            assertEquals(
                    "Dữ liệu thêm giỏ hàng không được để trống",
                    exception.getMessage()
            );

            verify(productClient, never())
                    .getProductById(any(UUID.class));
        }

        @Test
        @DisplayName("Ném lỗi khi productId bằng null")
        void addItem_whenProductIdIsNull_shouldThrowBadRequestException() {
            AddCartItemRequest request =
                    new AddCartItemRequest(
                            null,
                            variantId,
                            1
                    );

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    request
                            )
                    );

            assertEquals(
                    "Mã sản phẩm không được để trống",
                    exception.getMessage()
            );

            verify(productClient, never())
                    .getProductById(any(UUID.class));
        }

        @Test
        @DisplayName("Ném lỗi khi variantId bằng null")
        void addItem_whenVariantIdIsNull_shouldThrowBadRequestException() {
            AddCartItemRequest request =
                    new AddCartItemRequest(
                            productId,
                            null,
                            1
                    );

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    request
                            )
                    );

            assertEquals(
                    "Mã biến thể không được để trống",
                    exception.getMessage()
            );

            verify(productClient, never())
                    .getProductById(any(UUID.class));
        }

        @Test
        @DisplayName("Ném lỗi khi số lượng bằng null")
        void addItem_whenQuantityIsNull_shouldThrowBadRequestException() {
            AddCartItemRequest request =
                    new AddCartItemRequest(
                            productId,
                            variantId,
                            null
                    );

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    request
                            )
                    );

            assertEquals(
                    "Số lượng sản phẩm không được để trống",
                    exception.getMessage()
            );

            verify(productClient, never())
                    .getProductById(any(UUID.class));
        }

        @Test
        @DisplayName("Ném lỗi khi số lượng nhỏ hơn 1")
        void addItem_whenQuantityIsLessThanOne_shouldThrowBadRequestException() {
            AddCartItemRequest request =
                    new AddCartItemRequest(
                            productId,
                            variantId,
                            0
                    );

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    request
                            )
                    );

            assertEquals(
                    "Số lượng sản phẩm phải từ 1 đến 99",
                    exception.getMessage()
            );

            verify(productClient, never())
                    .getProductById(any(UUID.class));
        }

        @Test
        @DisplayName("Ném lỗi khi sản phẩm không tồn tại")
        void addItem_whenProductIsNull_shouldThrowResourceNotFoundException() {
            AddCartItemRequest request =
                    new AddCartItemRequest(
                            productId,
                            variantId,
                            1
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(null);

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> cartService.addItem(
                                    userId,
                                    request
                            )
                    );

            assertEquals(
                    "Không tìm thấy sản phẩm",
                    exception.getMessage()
            );

            verify(valueOperations, never())
                    .get(any(String.class));
        }

        @Test
        @DisplayName("Ném lỗi khi sản phẩm không ở trạng thái PUBLISHED")
        void addItem_whenProductIsNotPublished_shouldThrowBadRequestException() {
            AddCartItemRequest request =
                    new AddCartItemRequest(
                            productId,
                            variantId,
                            1
                    );

            ProductResponse product =
                    createProductWithStatus(
                            findNonPublishedStatus()
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    request
                            )
                    );

            assertEquals(
                    "Sản phẩm hiện không được phép đặt mua",
                    exception.getMessage()
            );

            verify(valueOperations, never())
                    .get(any(String.class));
        }

        @Test
        @DisplayName("Ném lỗi khi sản phẩm không có biến thể yêu cầu")
        void addItem_whenVariantDoesNotExist_shouldThrowResourceNotFoundException() {
            UUID unknownVariantId = UUID.randomUUID();

            AddCartItemRequest request =
                    new AddCartItemRequest(
                            productId,
                            unknownVariantId,
                            1
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(createPublishedProduct());

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> cartService.addItem(
                                    userId,
                                    request
                            )
                    );

            assertEquals(
                    "Không tìm thấy biến thể sản phẩm",
                    exception.getMessage()
            );

            verify(valueOperations, never())
                    .get(any(String.class));
        }
    }

    @Nested
    @DisplayName("updateItem")
    class UpdateItemTests {

        @Test
        @DisplayName("Cập nhật số lượng và snapshot sản phẩm thành công")
        void updateItem_whenItemExists_shouldUpdateItem() {
            UpdateCartItemRequest request =
                    new UpdateCartItemRequest(4);

            Cart cart = createCartWithOneItem();

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(createPublishedProduct());

            CartResponse response =
                    cartService.updateItem(
                            userId,
                            variantId,
                            request
                    );

            assertNotNull(response);
            assertEquals(1, response.items().size());
            assertEquals(4, response.totalQuantity());
            assertEquals(
                    new BigDecimal("4800000"),
                    response.totalAmount()
            );
            assertEquals(
                    4,
                    response.items().get(0).quantity()
            );

            verify(productClient)
                    .getProductById(productId);

            verify(valueOperations).set(
                    eq(buildCartKey(userId)),
                    any(Cart.class),
                    eq(CART_TTL)
            );
        }

        @Test
        @DisplayName("Ném lỗi khi variantId cập nhật bằng null")
        void updateItem_whenVariantIdIsNull_shouldThrowBadRequestException() {
            UpdateCartItemRequest request =
                    new UpdateCartItemRequest(2);

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.updateItem(
                                    userId,
                                    null,
                                    request
                            )
                    );

            assertEquals(
                    "Mã biến thể không được để trống",
                    exception.getMessage()
            );
        }

        @Test
        @DisplayName("Ném lỗi khi request cập nhật bằng null")
        void updateItem_whenRequestIsNull_shouldThrowBadRequestException() {
            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.updateItem(
                                    userId,
                                    variantId,
                                    null
                            )
                    );

            assertEquals(
                    "Dữ liệu cập nhật không được để trống",
                    exception.getMessage()
            );
        }

        @Test
        @DisplayName("Ném lỗi khi giỏ hàng không tồn tại")
        void updateItem_whenCartDoesNotExist_shouldThrowResourceNotFoundException() {
            UpdateCartItemRequest request =
                    new UpdateCartItemRequest(2);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> cartService.updateItem(
                                    userId,
                                    variantId,
                                    request
                            )
                    );

            assertEquals(
                    "Giỏ hàng không tồn tại hoặc đang trống",
                    exception.getMessage()
            );

            verify(productClient, never())
                    .getProductById(any(UUID.class));
        }

        @Test
        @DisplayName("Ném lỗi khi biến thể không có trong giỏ hàng")
        void updateItem_whenItemDoesNotExist_shouldThrowResourceNotFoundException() {
            UUID unknownVariantId = UUID.randomUUID();

            UpdateCartItemRequest request =
                    new UpdateCartItemRequest(2);

            Cart cart = createCartWithOneItem();

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(cart);

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> cartService.updateItem(
                                    userId,
                                    unknownVariantId,
                                    request
                            )
                    );

            assertEquals(
                    "Biến thể sản phẩm không tồn tại trong giỏ hàng",
                    exception.getMessage()
            );

            verify(productClient, never())
                    .getProductById(any(UUID.class));
        }
    }
    @Nested
    @DisplayName("removeItem")
    class RemoveItemTests {

        @Test
        @DisplayName("Xóa sản phẩm cuối cùng và xóa giỏ hàng khỏi Redis")
        void removeItem_whenRemovingLastItem_shouldDeleteCartFromRedis() {
            Cart cart = createCartWithOneItem();

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(cart);

            CartResponse response =
                    cartService.removeItem(
                            userId,
                            variantId
                    );

            assertNotNull(response);
            assertEquals(userId, response.userId());
            assertNotNull(response.items());
            assertTrue(response.items().isEmpty());
            assertEquals(0, response.totalQuantity());
            assertEquals(BigDecimal.ZERO, response.totalAmount());

            verify(cartRedisTemplate)
                    .delete(buildCartKey(userId));

            verify(valueOperations, never())
                    .set(
                            any(String.class),
                            any(Cart.class),
                            any(Duration.class)
                    );
        }

        @Test
        @DisplayName("Xóa một sản phẩm và giữ lại các sản phẩm còn lại")
        void removeItem_whenCartHasMultipleItems_shouldRemoveOnlyRequestedItem() {
            UUID secondProductId = UUID.randomUUID();
            UUID secondVariantId = UUID.randomUUID();

            Cart cart = createCartWithOneItem();

            CartItem secondItem = CartItem.builder()
                    .productId(secondProductId)
                    .variantId(secondVariantId)
                    .productName("Kính mắt thứ hai")
                    .skuVariant("SKU-VARIANT-002")
                    .color("Trắng")
                    .size("L")
                    .productImageUrl(
                            "https://example.com/second-product.jpg"
                    )
                    .basePrice(new BigDecimal("800000"))
                    .extraPrice(new BigDecimal("100000"))
                    .unitPrice(new BigDecimal("900000"))
                    .quantity(3)
                    .build();

            cart.getItems().add(secondItem);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(cart);

            CartResponse response =
                    cartService.removeItem(
                            userId,
                            variantId
                    );

            assertNotNull(response);
            assertEquals(1, response.items().size());
            assertEquals(3, response.totalQuantity());
            assertEquals(
                    new BigDecimal("2700000"),
                    response.totalAmount()
            );

            assertEquals(
                    secondVariantId,
                    response.items().get(0).variantId()
            );

            verify(cartRedisTemplate, never())
                    .delete(any(String.class));

            ArgumentCaptor<Cart> cartCaptor =
                    ArgumentCaptor.forClass(Cart.class);

            verify(valueOperations).set(
                    eq(buildCartKey(userId)),
                    cartCaptor.capture(),
                    eq(CART_TTL)
            );

            Cart savedCart = cartCaptor.getValue();

            assertEquals(1, savedCart.getItems().size());
            assertEquals(
                    secondVariantId,
                    savedCart.getItems().get(0).getVariantId()
            );
        }

        @Test
        @DisplayName("Ném lỗi khi variantId bằng null")
        void removeItem_whenVariantIdIsNull_shouldThrowBadRequestException() {
            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.removeItem(
                                    userId,
                                    null
                            )
                    );

            assertEquals(
                    "Mã biến thể không được để trống",
                    exception.getMessage()
            );

            verify(valueOperations, never())
                    .get(any(String.class));
        }

        @Test
        @DisplayName("Ném lỗi khi giỏ hàng không tồn tại")
        void removeItem_whenCartDoesNotExist_shouldThrowResourceNotFoundException() {
            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> cartService.removeItem(
                                    userId,
                                    variantId
                            )
                    );

            assertEquals(
                    "Giỏ hàng không tồn tại hoặc đang trống",
                    exception.getMessage()
            );

            verify(cartRedisTemplate, never())
                    .delete(any(String.class));
        }

        @Test
        @DisplayName("Ném lỗi khi biến thể không có trong giỏ hàng")
        void removeItem_whenItemDoesNotExist_shouldThrowResourceNotFoundException() {
            UUID unknownVariantId = UUID.randomUUID();

            Cart cart = createCartWithOneItem();

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(cart);

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> cartService.removeItem(
                                    userId,
                                    unknownVariantId
                            )
                    );

            assertEquals(
                    "Biến thể sản phẩm không tồn tại trong giỏ hàng",
                    exception.getMessage()
            );

            verify(cartRedisTemplate, never())
                    .delete(any(String.class));

            verify(valueOperations, never())
                    .set(
                            any(String.class),
                            any(Cart.class),
                            any(Duration.class)
                    );
        }
    }

    @Nested
    @DisplayName("clearCart")
    class ClearCartTests {

        @Test
        @DisplayName("Xóa giỏ hàng khỏi Redis thành công")
        void clearCart_whenUserIdIsValid_shouldDeleteRedisKey() {
            cartService.clearCart(userId);

            verify(cartRedisTemplate)
                    .delete(buildCartKey(userId));
        }

        @Test
        @DisplayName("Ném lỗi khi userId bằng null")
        void clearCart_whenUserIdIsNull_shouldThrowBadRequestException() {
            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.clearCart(null)
                    );

            assertEquals(
                    "Mã người dùng không được để trống",
                    exception.getMessage()
            );

            verify(cartRedisTemplate, never())
                    .delete(any(String.class));
        }
    }

    @Nested
    @DisplayName("getCartEntity")
    class GetCartEntityTests {

        @Test
        @DisplayName("Trả về Cart entity khi giỏ hàng tồn tại")
        void getCartEntity_whenCartExists_shouldReturnCart() {
            Cart cart = createCartWithOneItem();

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(cart);

            Cart result =
                    cartService.getCartEntity(userId);

            assertNotNull(result);
            assertEquals(userId, result.getUserId());
            assertEquals(1, result.getItems().size());
            assertEquals(
                    variantId,
                    result.getItems().get(0).getVariantId()
            );

            verify(valueOperations)
                    .get(buildCartKey(userId));
        }

        @Test
        @DisplayName("Ném lỗi khi giỏ hàng không tồn tại")
        void getCartEntity_whenCartDoesNotExist_shouldThrowResourceNotFoundException() {
            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> cartService.getCartEntity(userId)
                    );

            assertEquals(
                    "Giỏ hàng không tồn tại hoặc đang trống",
                    exception.getMessage()
            );
        }

        @Test
        @DisplayName("Ném lỗi khi giỏ hàng không có sản phẩm")
        void getCartEntity_whenCartIsEmpty_shouldThrowResourceNotFoundException() {
            Cart emptyCart = Cart.builder()
                    .userId(userId)
                    .items(new ArrayList<>())
                    .createdAt(LocalDateTime.now())
                    .updatedAt(LocalDateTime.now())
                    .build();

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(emptyCart);

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> cartService.getCartEntity(userId)
                    );

            assertEquals(
                    "Giỏ hàng không tồn tại hoặc đang trống",
                    exception.getMessage()
            );
        }
    }

    @Nested
    @DisplayName("Product image selection")
    class ProductImageSelectionTests {

        @Test
        @DisplayName("Ưu tiên ảnh thumbnail thuộc đúng biến thể")
        void addItem_whenVariantThumbnailExists_shouldUseVariantThumbnail() {
            ProductResponse product =
                    createProductWithImages(
                            List.of(
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            null,
                                            "https://example.com/product-thumbnail.jpg",
                                            true,
                                            1
                                    ),
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            variantId,
                                            "https://example.com/variant-normal.jpg",
                                            false,
                                            1
                                    ),
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            variantId,
                                            "https://example.com/variant-thumbnail.jpg",
                                            true,
                                            5
                                    )
                            )
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            CartResponse response =
                    cartService.addItem(
                            userId,
                            new AddCartItemRequest(
                                    productId,
                                    variantId,
                                    1
                            )
                    );

            assertEquals(
                    "https://example.com/variant-thumbnail.jpg",
                    response.items().get(0).productImageUrl()
            );
        }

        @Test
        @DisplayName("Chọn ảnh biến thể có sortOrder nhỏ nhất khi không có thumbnail")
        void addItem_whenVariantHasNoThumbnail_shouldUseLowestSortOrderImage() {
            ProductResponse product =
                    createProductWithImages(
                            List.of(
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            variantId,
                                            "https://example.com/variant-order-10.jpg",
                                            false,
                                            10
                                    ),
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            variantId,
                                            "https://example.com/variant-order-2.jpg",
                                            false,
                                            2
                                    ),
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            variantId,
                                            "https://example.com/variant-order-null.jpg",
                                            false,
                                            null
                                    )
                            )
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            CartResponse response =
                    cartService.addItem(
                            userId,
                            new AddCartItemRequest(
                                    productId,
                                    variantId,
                                    1
                            )
                    );

            assertEquals(
                    "https://example.com/variant-order-2.jpg",
                    response.items().get(0).productImageUrl()
            );
        }

        @Test
        @DisplayName("Dùng thumbnail chung của sản phẩm khi biến thể không có ảnh")
        void addItem_whenVariantHasNoImage_shouldUseProductThumbnail() {
            UUID anotherVariantId = UUID.randomUUID();

            ProductResponse product =
                    createProductWithImages(
                            List.of(
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            anotherVariantId,
                                            "https://example.com/another-variant.jpg",
                                            false,
                                            1
                                    ),
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            null,
                                            "https://example.com/product-thumbnail.jpg",
                                            true,
                                            2
                                    )
                            )
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            CartResponse response =
                    cartService.addItem(
                            userId,
                            new AddCartItemRequest(
                                    productId,
                                    variantId,
                                    1
                            )
                    );

            assertEquals(
                    "https://example.com/product-thumbnail.jpg",
                    response.items().get(0).productImageUrl()
            );
        }

        @Test
        @DisplayName("Dùng ảnh đầu tiên khi không có ảnh biến thể và thumbnail")
        void addItem_whenNoVariantImageAndNoThumbnail_shouldUseFirstImage() {
            UUID anotherVariantId = UUID.randomUUID();

            ProductResponse product =
                    createProductWithImages(
                            List.of(
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            anotherVariantId,
                                            "https://example.com/first-image.jpg",
                                            false,
                                            5
                                    ),
                                    new ProductImageResponse(
                                            UUID.randomUUID(),
                                            null,
                                            "https://example.com/second-image.jpg",
                                            false,
                                            1
                                    )
                            )
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            CartResponse response =
                    cartService.addItem(
                            userId,
                            new AddCartItemRequest(
                                    productId,
                                    variantId,
                                    1
                            )
                    );

            assertEquals(
                    "https://example.com/first-image.jpg",
                    response.items().get(0).productImageUrl()
            );
        }

        @Test
        @DisplayName("Trả về null khi sản phẩm không có ảnh")
        void addItem_whenProductHasNoImages_shouldSetImageUrlToNull() {
            ProductResponse product =
                    createProductWithImages(List.of());

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            CartResponse response =
                    cartService.addItem(
                            userId,
                            new AddCartItemRequest(
                                    productId,
                                    variantId,
                                    1
                            )
                    );

            assertNull(
                    response.items().get(0).productImageUrl()
            );
        }
    }

    @Nested
    @DisplayName("Product validation")
    class ProductValidationTests {

        @Test
        @DisplayName("Ném lỗi khi mã sản phẩm trong response bằng null")
        void addItem_whenProductResponseIdIsNull_shouldThrowBadRequestException() {
            ProductResponse product =
                    new ProductResponse(
                            null,
                            "SKU-001",
                            "Kính mắt thời trang",
                            "kinh-mat-thoi-trang",
                            "Mô tả sản phẩm",
                            null,
                            null,
                            null,
                            null,
                            new BigDecimal("1000000"),
                            ProductStatus.PUBLISHED,
                            null,
                            null,
                            List.of(createVariant()),
                            List.of(),
                            List.of(),
                            OffsetDateTime.now(),
                            OffsetDateTime.now()
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    new AddCartItemRequest(
                                            productId,
                                            variantId,
                                            1
                                    )
                            )
                    );

            assertEquals(
                    "Sản phẩm có mã không hợp lệ",
                    exception.getMessage()
            );
        }

        @Test
        @DisplayName("Ném lỗi khi sản phẩm chưa có giá")
        void addItem_whenBasePriceIsNull_shouldThrowBadRequestException() {
            ProductResponse product =
                    createProductWithBasePrice(null);

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    new AddCartItemRequest(
                                            productId,
                                            variantId,
                                            1
                                    )
                            )
                    );

            assertEquals(
                    "Sản phẩm chưa có giá bán",
                    exception.getMessage()
            );
        }

        @Test
        @DisplayName("Ném lỗi khi giá sản phẩm âm")
        void addItem_whenBasePriceIsNegative_shouldThrowBadRequestException() {
            ProductResponse product =
                    createProductWithBasePrice(
                            new BigDecimal("-1000")
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> cartService.addItem(
                                    userId,
                                    new AddCartItemRequest(
                                            productId,
                                            variantId,
                                            1
                                    )
                            )
                    );

            assertEquals(
                    "Giá sản phẩm không hợp lệ",
                    exception.getMessage()
            );
        }

        @Test
        @DisplayName("Ném lỗi khi sản phẩm không có danh sách biến thể")
        void addItem_whenVariantsAreNull_shouldThrowResourceNotFoundException() {
            ProductResponse product =
                    new ProductResponse(
                            productId,
                            "SKU-001",
                            "Kính mắt thời trang",
                            "kinh-mat-thoi-trang",
                            "Mô tả sản phẩm",
                            null,
                            null,
                            null,
                            null,
                            new BigDecimal("1000000"),
                            ProductStatus.PUBLISHED,
                            null,
                            null,
                            null,
                            List.of(),
                            List.of(),
                            OffsetDateTime.now(),
                            OffsetDateTime.now()
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> cartService.addItem(
                                    userId,
                                    new AddCartItemRequest(
                                            productId,
                                            variantId,
                                            1
                                    )
                            )
                    );

            assertEquals(
                    "Sản phẩm không có biến thể",
                    exception.getMessage()
            );
        }

        @Test
        @DisplayName("Extra price null được xem là 0")
        void addItem_whenExtraPriceIsNull_shouldUseZero() {
            ProductVariantResponse variant =
                    new ProductVariantResponse(
                            variantId,
                            "Đen",
                            "#000000",
                            "M",
                            null,
                            "SKU-VARIANT-001",
                            100
                    );

            ProductResponse product =
                    new ProductResponse(
                            productId,
                            "SKU-001",
                            "Kính mắt thời trang",
                            "kinh-mat-thoi-trang",
                            "Mô tả sản phẩm",
                            null,
                            null,
                            null,
                            null,
                            new BigDecimal("1000000"),
                            ProductStatus.PUBLISHED,
                            null,
                            null,
                            List.of(variant),
                            List.of(),
                            List.of(),
                            OffsetDateTime.now(),
                            OffsetDateTime.now()
                    );

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(valueOperations.get(buildCartKey(userId)))
                    .thenReturn(null);

            CartResponse response =
                    cartService.addItem(
                            userId,
                            new AddCartItemRequest(
                                    productId,
                                    variantId,
                                    2
                            )
                    );

            assertEquals(
                    BigDecimal.ZERO,
                    response.items().get(0).extraPrice()
            );

            assertEquals(
                    new BigDecimal("1000000"),
                    response.items().get(0).unitPrice()
            );

            assertEquals(
                    new BigDecimal("2000000"),
                    response.items().get(0).subtotal()
            );
        }
    }

    private Cart createCartWithOneItem() {
        LocalDateTime createdAt =
                LocalDateTime.now().minusMinutes(10);

        CartItem item = CartItem.builder()
                .productId(productId)
                .variantId(variantId)
                .productName("Kính mắt thời trang")
                .skuVariant("SKU-VARIANT-001")
                .color("Đen")
                .size("M")
                .productImageUrl(
                        "https://example.com/old-image.jpg"
                )
                .basePrice(new BigDecimal("1000000"))
                .extraPrice(new BigDecimal("200000"))
                .unitPrice(new BigDecimal("1200000"))
                .quantity(2)
                .build();

        return Cart.builder()
                .userId(userId)
                .items(
                        new ArrayList<>(
                                List.of(item)
                        )
                )
                .createdAt(createdAt)
                .updatedAt(createdAt)
                .build();
    }

    private ProductResponse createPublishedProduct() {
        return createProductWithImages(
                List.of(
                        new ProductImageResponse(
                                UUID.randomUUID(),
                                variantId,
                                "https://example.com/variant-thumbnail.jpg",
                                true,
                                1
                        )
                )
        );
    }

    private ProductResponse createProductWithStatus(
            ProductStatus status
    ) {
        return new ProductResponse(
                productId,
                "SKU-001",
                "Kính mắt thời trang",
                "kinh-mat-thoi-trang",
                "Mô tả sản phẩm",
                null,
                null,
                null,
                null,
                new BigDecimal("1000000"),
                status,
                null,
                null,
                List.of(createVariant()),
                List.of(),
                List.of(),
                OffsetDateTime.now(),
                OffsetDateTime.now()
        );
    }

    private ProductResponse createProductWithImages(
            List<ProductImageResponse> images
    ) {
        return new ProductResponse(
                productId,
                "SKU-001",
                "Kính mắt thời trang",
                "kinh-mat-thoi-trang",
                "Mô tả sản phẩm",
                null,
                null,
                null,
                null,
                new BigDecimal("1000000"),
                ProductStatus.PUBLISHED,
                null,
                null,
                List.of(createVariant()),
                images,
                List.of(),
                OffsetDateTime.now(),
                OffsetDateTime.now()
        );
    }

    private ProductResponse createProductWithBasePrice(
            BigDecimal basePrice
    ) {
        return new ProductResponse(
                productId,
                "SKU-001",
                "Kính mắt thời trang",
                "kinh-mat-thoi-trang",
                "Mô tả sản phẩm",
                null,
                null,
                null,
                null,
                basePrice,
                ProductStatus.PUBLISHED,
                null,
                null,
                List.of(createVariant()),
                List.of(),
                List.of(),
                OffsetDateTime.now(),
                OffsetDateTime.now()
        );
    }

    private ProductVariantResponse createVariant() {
        return new ProductVariantResponse(
                variantId,
                "Đen",
                "#000000",
                "M",
                new BigDecimal("200000"),
                "SKU-VARIANT-001",
                100
        );
    }

    private ProductStatus findNonPublishedStatus() {
        for (ProductStatus status : ProductStatus.values()) {
            if (status != ProductStatus.PUBLISHED) {
                return status;
            }
        }

        throw new IllegalStateException(
                "ProductStatus phải có ít nhất một trạng thái khác PUBLISHED"
        );
    }

    private String buildCartKey(UUID id) {
        return CART_KEY_PREFIX + id;
    }
}