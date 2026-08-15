import { fireEvent, render, screen } from "@testing-library/react";
import { useProductBySlug } from "@/hooks/useProduct";
import { formatPriceVnd } from "@/lib/format/price";
import type { Product } from "@/types/product";
import { ProductDetailPage } from "./ProductDetailPage";

jest.mock("@/hooks/useProduct", () => ({ useProductBySlug: jest.fn() }));

const mockedUseProduct = useProductBySlug as jest.Mock;

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

    render(<ProductDetailPage slug="p1" />);

    expect(screen.getByRole("status")).toHaveTextContent(/đang tải/i);
  });

  it("shows an error message when the fetch fails", () => {
    mockedUseProduct.mockReturnValue({
      product: null,
      isLoading: false,
      error: "Product not found",
    });

    render(<ProductDetailPage slug="missing" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Product not found");
  });

  it("renders the product's name, price, a color swatch and its main image once loaded", () => {
    mockedUseProduct.mockReturnValue({ product: sampleProduct, isLoading: false, error: null });

    render(<ProductDetailPage slug="p1" />);

    expect(screen.getByRole("heading", { name: "Aviator Classic" })).toBeInTheDocument();
    // Compare raw textContent directly (bypassing RTL's whitespace-normalizing string matcher)
    // since Intl.NumberFormat's exact space character before "₫" is ICU-version-dependent.
    expect(
      screen.getByText((_content, element) => element?.textContent === formatPriceVnd(129.5)),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gold" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Aviator Classic" })).toHaveAttribute("src", "/img.jpg");
  });

  it("renders an explicit message when the product has no variants or images", () => {
    mockedUseProduct.mockReturnValue({
      product: { ...sampleProduct, variants: [], images: [] },
      isLoading: false,
      error: null,
    });

    render(<ProductDetailPage slug="p1" />);

    expect(screen.getByText("Chưa có hình ảnh nào.")).toBeInTheDocument();
    expect(screen.getByText("Chưa có phiên bản màu nào.")).toBeInTheDocument();
  });

  it("renders one swatch per distinct variant color, with a text fallback for unmapped names", () => {
    mockedUseProduct.mockReturnValue({
      product: {
        ...sampleProduct,
        variants: [
          { id: "v1", color: "Gold", size: "M", extraPrice: 0, skuVariant: "SKU-1-GOLD-M" },
          { id: "v2", color: "Gold", size: "L", extraPrice: 0, skuVariant: "SKU-1-GOLD-L" },
          {
            id: "v3",
            color: "Rose Quartz",
            size: "M",
            extraPrice: 0,
            skuVariant: "SKU-1-ROSE-M",
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<ProductDetailPage slug="p1" />);

    // Two variants share the "Gold" color, so only one swatch renders for it (deduplicated).
    expect(screen.getAllByRole("button", { name: "Gold" })).toHaveLength(1);
    // "Rose Quartz" isn't in the known-color lookup, so it gets a visible text label too, not
    // just a colored circle with no accessible name.
    expect(screen.getByRole("button", { name: "Rose Quartz" })).toBeInTheDocument();
    expect(screen.getByText("Rose Quartz")).toBeInTheDocument();
  });

  it("renders a gallery with a main image and a thumbnail row for the remaining images", () => {
    mockedUseProduct.mockReturnValue({
      product: {
        ...sampleProduct,
        images: [
          { id: "img1", imageUrl: "/img-1.jpg", isThumbnail: true, sortOrder: 0, variantId: null },
          { id: "img2", imageUrl: "/img-2.jpg", isThumbnail: false, sortOrder: 1, variantId: null },
          { id: "img3", imageUrl: "/img-3.jpg", isThumbnail: false, sortOrder: 2, variantId: null },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<ProductDetailPage slug="p1" />);

    const images = screen.getAllByRole("img", { name: "Aviator Classic" });
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveAttribute("src", "/img-1.jpg");
    expect(images.map((image) => image.getAttribute("src"))).toEqual(
      expect.arrayContaining(["/img-1.jpg", "/img-2.jpg", "/img-3.jpg"]),
    );
  });

  it("falls back to a placeholder box, independently per image, when an image fails to load", () => {
    mockedUseProduct.mockReturnValue({
      product: {
        ...sampleProduct,
        images: [
          { id: "img1", imageUrl: "/img-1.jpg", isThumbnail: true, sortOrder: 0, variantId: null },
          { id: "img2", imageUrl: "/img-2.jpg", isThumbnail: false, sortOrder: 1, variantId: null },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<ProductDetailPage slug="p1" />);

    const [mainImage, thumbnailImage] = screen.getAllByRole("img", { name: "Aviator Classic" });
    fireEvent.error(mainImage);

    const images = screen.getAllByRole("img", { name: "Aviator Classic" });
    expect(images[0].tagName).toBe("DIV");
    expect(images[1]).toBe(thumbnailImage);
    expect(images[1].tagName).toBe("IMG");
  });
});
