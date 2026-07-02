import { renderHook, waitFor } from "@testing-library/react";
import { ApiError, getProducts } from "@/lib/api";
import type { Product } from "@/types/product";
import { useProducts } from "./useProducts";

jest.mock("@/lib/api", () => ({
  getProducts: jest.fn(),
  ApiError: jest.requireActual("@/lib/api/client").ApiError,
}));

const mockedGetProducts = getProducts as jest.Mock;

const sampleProduct = {
  id: "p1",
  name: "Aviator Classic",
} as Product;

describe("useProducts", () => {
  afterEach(() => {
    mockedGetProducts.mockReset();
  });

  it("starts in a loading state and resolves with the fetched products", async () => {
    mockedGetProducts.mockResolvedValue({
      items: [sampleProduct],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const { result } = renderHook(() => useProducts({}));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.products).toEqual([sampleProduct]);
    expect(result.current.error).toBeNull();
  });

  it("resolves to an empty product list without setting an error", async () => {
    mockedGetProducts.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    const { result } = renderHook(() => useProducts({}));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.products).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a failed fetch as an error message instead of throwing", async () => {
    mockedGetProducts.mockRejectedValue(new ApiError("product-service is unreachable", 503));

    const { result } = renderHook(() => useProducts({}));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("product-service is unreachable");
    expect(result.current.products).toEqual([]);
  });

  it("refetches when the filter params change", async () => {
    mockedGetProducts.mockResolvedValue({
      items: [sampleProduct],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const { rerender } = renderHook(({ categoryId }) => useProducts({ categoryId }), {
      initialProps: { categoryId: undefined as string | undefined },
    });

    await waitFor(() => expect(mockedGetProducts).toHaveBeenCalledTimes(1));

    rerender({ categoryId: "cat-1" });

    await waitFor(() => expect(mockedGetProducts).toHaveBeenCalledTimes(2));
    expect(mockedGetProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryId: "cat-1" }),
    );
  });
});
