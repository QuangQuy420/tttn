import type { CheckoutPayload } from "@/types/order";
import { checkout } from "./orders";

const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const originalFetch = global.fetch;

describe("orders api client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080/api";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("checkout POSTs /orders/checkout with the bearer token and the Idempotency-Key header", async () => {
    const payload: CheckoutPayload = {
      receiverName: "Nguyen Van A",
      receiverPhone: "0900000000",
      shippingAddress: "1 Le Loi, Q1, HCM",
      paymentMethod: "MOCK",
      variantIds: ["v1"],
      expectedUnitPrices: { v1: 100000 },
    };
    const result = {
      orderId: "o1",
      orderCode: "ORD-1",
      totalAmount: 100000,
      orderStatus: "PENDING",
      paymentId: "p1",
      paymentStatus: "PENDING",
    };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, message: "OK", data: result }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const response = await checkout("token-123", payload, "key-abc");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/orders/checkout",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "Idempotency-Key": "key-abc",
        }),
        body: JSON.stringify(payload),
      }),
    );
    expect(response).toEqual(result);
  });
});
