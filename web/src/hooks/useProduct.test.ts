import { renderHook, waitFor } from "@testing-library/react";
import { ApiError, getProductById } from "@/lib/api";
import type { Product } from "@/types/product";
import { useProduct } from "./useProduct";

jest.mock("@/lib/api", () => ({
  getProductById: jest.fn(),
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));

const mockedGetProductById = getProductById as jest.Mock;

describe("useProduct", () => {
  afterEach(() => {
    mockedGetProductById.mockReset();
  });

  it("resolves with the fetched product", async () => {
    const product = { id: "p1", name: "Aviator Classic" } as Product;
    mockedGetProductById.mockResolvedValue(product);

    const { result } = renderHook(() => useProduct("p1"));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.product).toEqual(product);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a 404 as an error message instead of throwing", async () => {
    mockedGetProductById.mockRejectedValue(new ApiError("Product not found", 404));

    const { result } = renderHook(() => useProduct("missing"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("Product not found");
    expect(result.current.product).toBeNull();
  });
});
