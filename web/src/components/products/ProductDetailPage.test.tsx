import { render, screen } from "@testing-library/react";
import { useProduct } from "@/hooks/useProduct";
import type { Product } from "@/types/product";
import { ProductDetailPage } from "./ProductDetailPage";

jest.mock("@/hooks/useProduct", () => ({ useProduct: jest.fn() }));

const mockedUseProduct = useProduct as jest.Mock;

const sampleProduct: Product = {
  id: "p1",
  sku: "SKU-1",
  name: "Aviator Classic",
  slug: "aviator-classic",
  description: "A timeless aviator frame.",
  frameShape: "AVIATOR",
  genderTarget: "UNISEX",
  material: "Metal",
  basePrice: 129.5,
  status: "PUBLISHED",
  brand: { id: "b1", name: "RayShade", logoUrl: null },
  category: { id: "c1", name: "Sunglasses", slug: "sunglasses", parentId: null },
  variants: [
    { id: "v1", color: "Gold", size: "M", extraPrice: 0, skuVariant: "SKU-1-GOLD-M" },
  ],
  images: [{ id: "img1", imageUrl: "/img.jpg", isThumbnail: true, sortOrder: 0, variantId: null }],
};

describe("ProductDetailPage", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows a loading indicator while the product is being fetched", () => {
    mockedUseProduct.mockReturnValue({ product: null, isLoading: true, error: null });

    render(<ProductDetailPage id="p1" />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows an error message when the fetch fails", () => {
    mockedUseProduct.mockReturnValue({
      product: null,
      isLoading: false,
      error: "Product not found",
    });

    render(<ProductDetailPage id="missing" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Product not found");
  });

  it("renders the product's name, price, variants and images once loaded", () => {
    mockedUseProduct.mockReturnValue({ product: sampleProduct, isLoading: false, error: null });

    render(<ProductDetailPage id="p1" />);

    expect(screen.getByRole("heading", { name: "Aviator Classic" })).toBeInTheDocument();
    expect(screen.getByText("$129.50")).toBeInTheDocument();
    expect(screen.getByText(/Gold \/ M/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Aviator Classic" })).toHaveAttribute("src", "/img.jpg");
  });

  it("renders an explicit message when the product has no variants or images", () => {
    mockedUseProduct.mockReturnValue({
      product: { ...sampleProduct, variants: [], images: [] },
      isLoading: false,
      error: null,
    });

    render(<ProductDetailPage id="p1" />);

    expect(screen.getByText("No images available.")).toBeInTheDocument();
    expect(screen.getByText("No variants available.")).toBeInTheDocument();
  });
});
