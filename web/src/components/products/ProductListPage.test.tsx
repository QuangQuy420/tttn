import { render, screen } from "@testing-library/react";
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

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
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

    expect(screen.getByText(/no products found/i)).toBeInTheDocument();
  });

  it("renders the product grid once products load", () => {
    mockedUseProducts.mockReturnValue({ products: [sampleProduct], isLoading: false, error: null });

    render(<ProductListPage />);

    expect(screen.getByText("Aviator Classic")).toBeInTheDocument();
  });

  it("pushes the categoryId filter onto the URL when the category select changes", async () => {
    mockedUseProducts.mockReturnValue({ products: [sampleProduct], isLoading: false, error: null });
    const user = userEvent.setup();

    render(<ProductListPage />);

    await user.selectOptions(screen.getByLabelText(/category/i), "cat-1");

    expect(push).toHaveBeenCalledWith("/?categoryId=cat-1");
  });
});
