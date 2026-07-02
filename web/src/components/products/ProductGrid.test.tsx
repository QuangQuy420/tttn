import { render, screen } from "@testing-library/react";
import type { Product } from "@/types/product";
import { ProductGrid } from "./ProductGrid";

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
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
    category: { id: "c1", name: "Sunglasses", slug: "sunglasses", parentId: null },
    variants: [],
    images: [{ id: "img1", imageUrl: "/img.jpg", isThumbnail: true, sortOrder: 0, variantId: null }],
    ...overrides,
  };
}

describe("ProductGrid", () => {
  it("renders a card for each product", () => {
    render(<ProductGrid products={[buildProduct(), buildProduct({ id: "p2", name: "Wayfarer Pro" })]} />);

    expect(screen.getByText("Aviator Classic")).toBeInTheDocument();
    expect(screen.getByText("Wayfarer Pro")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no products", () => {
    render(<ProductGrid products={[]} />);

    expect(screen.getByText(/no products found/i)).toBeInTheDocument();
  });
});
