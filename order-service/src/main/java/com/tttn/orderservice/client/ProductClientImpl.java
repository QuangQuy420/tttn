package com.tttn.orderservice.client;

import com.tttn.orderservice.dto.response.ProductResponse;
import com.tttn.orderservice.exception.ExternalServiceException;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ProductClientImpl implements ProductClient {

    private final RestClient productRestClient;

    @Override
    public ProductResponse getProductById(UUID productId) {
        try {
            ProductResponse response = productRestClient
                    .get()
                    .uri("/products/{productId}", productId)
                    .retrieve()
                    .onStatus(
                            status -> status.value() == 404,
                            (request, serverResponse) -> {
                                throw new ResourceNotFoundException(
                                        "Không tìm thấy sản phẩm: " + productId
                                );
                            }
                    )
                    .onStatus(
                            HttpStatusCode::is4xxClientError,
                            (request, serverResponse) -> {
                                throw new ExternalServiceException(
                                        "Product Service từ chối yêu cầu với mã lỗi "
                                                + serverResponse.getStatusCode().value()
                                );
                            }
                    )
                    .onStatus(
                            HttpStatusCode::is5xxServerError,
                            (request, serverResponse) -> {
                                throw new ExternalServiceException(
                                        "Product Service đang xảy ra lỗi"
                                );
                            }
                    )
                    .body(ProductResponse.class);

            if (response == null) {
                throw new ExternalServiceException(
                        "Product Service trả về dữ liệu rỗng"
                );
            }

            return response;
        } catch (ResourceNotFoundException | ExternalServiceException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new ExternalServiceException(
                    "Không thể kết nối đến Product Service",
                    exception
            );
        }
    }
}