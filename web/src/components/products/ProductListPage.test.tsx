import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter, useSearchParams } from "next/navigation";
import { useCategories } from "@/hooks/useCategories";
import { useProducts } from "@/hooks/useProducts";
import type { Product } from "@/types/product";
import { ProductListPage } from "./ProductListPage";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));
jest.mock("@/hooks/useProducts", () => ({ useProducts: jest.fn() }));
jest.mock("@/hooks/useCategories", () => ({ useCategories: jest.fn() }));

const mockedUseRouter = useRouter as jest.Mock;
const mockedUseSearchParams = useSearchParams as jest.Mock;
const mockedUseProducts = useProducts as jest.Mock;
const mockedUseCategories = useCategories as jest.Mock;

const sampleProduct: Product = {
  id: "p1",
  sku: "SKU-1",
  name: "Aviator Classic",
  slug: "aviator-classic",
  description: null,
  frameShape: "AVIATOR",
  genderTarget: "UNISEX",
  material: "Metal",
  basePrice: 99.99,
  status: "PUBLISHED",
  brand: { id: "b1", name: "RayShade", logoUrl: null },
  category: { id: "cat-1", name: "Sunglasses", slug: "sunglasses", parentId: null },
  variants: [],
  images: [],
};

function setSearchParams(params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params);
  mockedUseSearchParams.mockReturnValue(searchParams);
}

describe("ProductListPage", () => {
  const push = jest.fn();

  beforeEach(() => {
    mockedUseRouter.mockReturnValue({ push });
    mockedUseCategories.mockReturnValue({
      categories: [{ id: "cat-1", name: "Sunglasses", slug: "sunglasses", parentId: null }],
      isLoading: false,
      error: null,
    });
    setSearchParams();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows a loading indicator while products are being fetched", () => {
    mockedUseProducts.mockReturnValue({ products: [], isLoading: true, error: null });

    render(<ProductListPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/đang tải/i);
  });

  it("shows an error message when the fetch fails", () => {
    mockedUseProducts.mockReturnValue({
      products: [],
      isLoading: false,
      error: "product-service is unreachable",
    });

    render(<ProductListPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("product-service is unreachable");
  });

  it("shows an empty-state message when there are no products", () => {
    mockedUseProducts.mockReturnValue({ products: [], isLoading: false, error: null });

    render(<ProductListPage />);

    expect(screen.getByText(/không tìm thấy sản phẩm/i)).toBeInTheDocument();
  });

  it("renders the product grid once products load", () => {
    mockedUseProducts.mockReturnValue({ products: [sampleProduct], isLoading: false, error: null });

    render(<ProductListPage />);

    expect(screen.getByText("Aviator Classic")).toBeInTheDocument();
  });

  it("pushes the categoryId filter onto the URL when a category pill is clicked", async () => {
    mockedUseProducts.mockReturnValue({ products: [sampleProduct], isLoading: false, error: null });
    const user = userEvent.setup();

    render(<ProductListPage />);

    await user.click(screen.getByRole("button", { name: /sunglasses/i }));

    expect(push).toHaveBeenCalledWith("/?categoryId=cat-1");
  });

  it("pushes minPrice/maxPrice onto the URL when a price-range pill is clicked", async () => {
    mockedUseProducts.mockReturnValue({ products: [sampleProduct], isLoading: false, error: null });
    const user = userEvent.setup();

    render(<ProductListPage />);

    await user.click(screen.getByRole("button", { name: /dưới 1\.500\.000/i }));

    expect(push).toHaveBeenCalledWith("/?maxPrice=1500000");
  });

  it("pushes a debounced search filter to the URL after the user stops typing", async () => {
    mockedUseProducts.mockReturnValue({ products: [sampleProduct], isLoading: false, error: null });
    jest.useFakeTimers();
    const user = userEvent.setup({ delay: null });

    render(<ProductListPage />);

    await user.type(screen.getByRole("searchbox", { name: /tìm sản phẩm/i }), "aviator");

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(push).toHaveBeenCalledWith("/?search=aviator");

    jest.useRealTimers();
  });

  it("cancels a pending debounced search push if the input changes again before it fires", async () => {
    mockedUseProducts.mockReturnValue({ products: [sampleProduct], isLoading: false, error: null });
    jest.useFakeTimers();
    const user = userEvent.setup({ delay: null });

    render(<ProductListPage />);

    const input = screen.getByRole("searchbox", { name: /tìm sản phẩm/i });
    await user.type(input, "avi");

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(push).not.toHaveBeenCalled();

    await user.type(input, "ator");

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(push).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/?search=aviator");

    jest.useRealTimers();
  });

  it("applies a pending debounced search on top of a filter pill clicked in the meantime, not the stale filters from when typing started", async () => {
    mockedUseProducts.mockReturnValue({ products: [sampleProduct], isLoading: false, error: null });
    jest.useFakeTimers();
    const user = userEvent.setup({ delay: null });

    const { rerender } = render(<ProductListPage />);

    await user.type(screen.getByRole("searchbox", { name: /tìm sản phẩm/i }), "avi");

    // Before the search debounce fires, the user clicks a category pill. In the real app this
    // pushes a new URL and next/navigation's useSearchParams() re-renders the page with it —
    // simulate that here by updating the mocked search params and re-rendering.
    await user.click(screen.getByRole("button", { name: /sunglasses/i }));
    expect(push).toHaveBeenCalledWith("/?categoryId=cat-1");
    setSearchParams({ categoryId: "cat-1" });
    rerender(<ProductListPage />);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // The debounced search push must be layered on top of the category filter that was applied
    // in between, not reconstructed from the stale (pre-click) URL params.
    expect(push).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/\?(categoryId=cat-1&search=avi|search=avi&categoryId=cat-1)$/),
    );

    jest.useRealTimers();
  });
});
