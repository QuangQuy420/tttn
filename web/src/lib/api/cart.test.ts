import { refreshCart } from "./cart";

const originalBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const originalFetch = global.fetch;

describe("cart api client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:8080/api";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalBaseUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("refreshCart POSTs /cart/refresh with the bearer token and returns {cart, changedVariantIds}", async () => {
    const payload = {
      cart: { userId: "u1", items: [], totalAmount: 0 },
      changedVariantIds: ["v1"],
    };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: "OK", data: payload }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await refreshCart("token-123");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/cart/refresh",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      }),
    );
    expect(result).toEqual(payload);
  });
});
