package com.tttn.orderservice.client;

import com.tttn.orderservice.dto.response.ProductResponse;
import com.tttn.orderservice.enums.ProductStatus;
import com.tttn.orderservice.exception.ExternalServiceException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

@DisplayName("ProductClientImpl - getProductById")
class ProductClientImplTest {

    private static final String BASE_URL = "http://product-service/api/v1";

    private MockRestServiceServer server;

    private ProductClientImpl productClient;

    private UUID productId;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);

        server = MockRestServiceServer.bindTo(builder).build();

        productClient = new ProductClientImpl(builder.build());

        productId = UUID.randomUUID();
    }

    @Test
    @DisplayName("Trả về product nằm trong trường data của envelope")
    void getProductById_ShouldUnwrapEnvelopeData() {
        server.expect(requestTo(BASE_URL + "/products/" + productId))
                .andRespond(withSuccess(
                        """
                                {
                                  "success": true,
                                  "message": "Thành công",
                                  "data": {
                                    "id": "%s",
                                    "name": "Kính mắt thời trang",
                                    "basePrice": 500000,
                                    "status": "PUBLISHED"
                                  }
                                }
                                """.formatted(productId),
                        MediaType.APPLICATION_JSON
                ));

        ProductResponse product = productClient.getProductById(productId);

        assertEquals(productId, product.id());
        assertEquals("Kính mắt thời trang", product.name());
        assertEquals(0, new BigDecimal("500000").compareTo(product.basePrice()));
        assertEquals(ProductStatus.PUBLISHED, product.status());

        server.verify();
    }

    @Test
    @DisplayName("Ném ExternalServiceException khi envelope không có data")
    void getProductById_WhenDataIsNull_ShouldThrowExternalServiceException() {
        server.expect(requestTo(BASE_URL + "/products/" + productId))
                .andRespond(withSuccess(
                        """
                                {"success": true, "message": "Thành công", "data": null}
                                """,
                        MediaType.APPLICATION_JSON
                ));

        assertThrows(
                ExternalServiceException.class,
                () -> productClient.getProductById(productId)
        );
    }
}
